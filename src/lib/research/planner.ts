/**
 * New-money planner (deterministic). Splits a contribution between cash (to the
 * DNA cash target), a diversified core fund and the best-rated individual names,
 * without breaking position or sector limits. Decision support only — it never
 * places orders, and every line carries the rule that produced it.
 */
import type { Rating } from "./recommend";
import { STANDARD_POSITION } from "./recommend";

export const PLANNER_VERSION = "planner v1.0";

export interface PlanSecurity {
  symbol: string;
  name: string | null;
  price: number | null;
  priceAsOf: string | null;
  bucket: string; // sector bucket (funds classified)
  isFund: boolean;
  isBroad: boolean;
  rating: Rating | null;
  personal: number | null;
  confidence: "high" | "medium" | "low" | null;
  dnaPass: boolean | null;
}

export interface PlanHolding extends PlanSecurity {
  value: number;
}

export interface PlanLimits {
  riskTolerance: number | null; // 1–10
  maxPositionWeight: number | null;
  maxSectorWeight: number | null;
  preferredPositionWeight: number | null;
  cashTargetWeight: number | null;
}

export interface PlanInput {
  amount: number;
  cash: number;
  holdings: PlanHolding[];
  candidates: PlanSecurity[]; // not held
  limits: PlanLimits;
  /** Fallback core fund when no broad fund is held (must have a price). */
  fallbackCore: PlanSecurity | null;
  maxNewNames?: number;
}

export interface PlanLine {
  symbol: string;
  name: string | null;
  kind: "cash" | "core" | "add" | "new";
  amount: number;
  approxShares: number | null;
  price: number | null;
  priceAsOf: string | null;
  weightBefore: number;
  weightAfter: number;
  reasons: string[];
}

export interface PlanResult {
  version: string;
  amount: number;
  totalBefore: number;
  totalAfter: number;
  coreShareTarget: number;
  lines: PlanLine[];
  skipped: { symbol: string; reason: string }[];
  notes: string[];
  sectorWeightsAfter: { bucket: string; before: number; after: number; limit: number | null }[];
}

const pct = (v: number) => `${(v * 100).toFixed(1)}%`;
const money = (v: number) => `$${v.toLocaleString("en-US", { maximumFractionDigits: 0 })}`;
const roundCents = (v: number) => Math.round(v * 100) / 100;

/** Core share of new money by risk tolerance: 1 → 80%, 10 → 35%; unknown → 60%. */
export function coreShareFor(risk: number | null): number {
  if (risk === null) return 0.6;
  return Math.round(Math.min(0.8, Math.max(0.35, 0.8 - 0.05 * (risk - 1))) * 100) / 100;
}

export function planContribution(inp: PlanInput): PlanResult {
  const amount = Math.max(0, inp.amount);
  const invested = inp.holdings.reduce((a, h) => a + h.value, 0);
  const totalBefore = invested + inp.cash;
  const totalAfter = totalBefore + amount;
  const L = inp.limits;
  const notes: string[] = [];
  const skipped: PlanResult["skipped"] = [];
  const lines: PlanLine[] = [];
  const add = new Map<string, number>(); // symbol → planned amount
  const bySymbol = new Map(inp.holdings.map((h) => [h.symbol, h]));
  const sectorBefore = new Map<string, number>();
  for (const h of inp.holdings) sectorBefore.set(h.bucket, (sectorBefore.get(h.bucket) ?? 0) + h.value);
  const sectorPlanned = new Map<string, number>();
  const plannedIn = (bucket: string) => sectorPlanned.get(bucket) ?? 0;
  let remaining = amount;

  // 1) Cash to target
  let cashAmt = 0;
  if (L.cashTargetWeight !== null && L.cashTargetWeight > 0) {
    const need = L.cashTargetWeight * totalAfter - inp.cash;
    if (need > 0) {
      cashAmt = roundCents(Math.min(remaining, need));
      remaining -= cashAmt;
      lines.push({
        symbol: "CASH", name: "Cash", kind: "cash", amount: cashAmt, approxShares: null, price: null, priceAsOf: null,
        weightBefore: totalBefore > 0 ? inp.cash / totalBefore : 0, weightAfter: (inp.cash + cashAmt) / totalAfter,
        reasons: [`Brings cash toward your ${pct(L.cashTargetWeight)} target (now ${pct(totalBefore > 0 ? inp.cash / totalBefore : 0)})`],
      });
    }
  }

  // 2) Core fund: the largest broad fund you already hold, else the fallback
  const heldBroad = inp.holdings.filter((h) => h.isBroad && h.price !== null).sort((a, b) => b.value - a.value)[0];
  const core: PlanSecurity | null = heldBroad ?? inp.fallbackCore;
  const coreShare = coreShareFor(L.riskTolerance);
  const satelliteBudget = remaining * (1 - coreShare);
  let coreAmt = remaining - satelliteBudget;
  if (!core) {
    notes.push("No diversified core fund with a current price is available, so the core share stays unallocated.");
    coreAmt = 0;
  }

  // 3) Satellite: best-rated names within limits
  const standard = L.preferredPositionWeight ?? STANDARD_POSITION;
  const eligible = (s: PlanSecurity) =>
    !s.isFund && (s.rating === "buy" || s.rating === "strong_buy") && s.dnaPass !== false && s.confidence !== "low" && s.price !== null && s.personal !== null;
  const sectorShare = (bucket: string) => (sectorBefore.get(bucket) ?? 0) / Math.max(totalBefore, 1);
  const pool: (PlanSecurity & { held: boolean; value: number })[] = [
    ...inp.holdings.map((h) => ({ ...h, held: true })),
    ...inp.candidates.map((c) => ({ ...c, held: false, value: 0 })),
  ];
  for (const h of inp.holdings) {
    if (h.rating === "reduce" || h.rating === "avoid") skipped.push({ symbol: h.symbol, reason: `Rated ${h.rating === "reduce" ? "Reduce" : "Avoid"} — no new money` });
  }
  // priority: personal score, penalized by how much of the portfolio its sector already is (favors diversification)
  const ranked = pool
    .filter(eligible)
    .map((s) => ({ s, priority: s.personal! - 20 * sectorShare(s.bucket) + (s.rating === "strong_buy" ? 5 : 0) }))
    .sort((a, b) => b.priority - a.priority || a.s.symbol.localeCompare(b.s.symbol));

  let satRemaining = satelliteBudget;
  const minLine = Math.max(25, satelliteBudget * 0.1);
  let newCount = 0;
  const maxNew = inp.maxNewNames ?? 3;
  for (const { s } of ranked) {
    if (satRemaining < minLine) break;
    if (!s.held && newCount >= maxNew) {
      skipped.push({ symbol: s.symbol, reason: `Rated ${s.rating === "strong_buy" ? "Strong buy" : "Buy"}, but the plan already adds ${maxNew} new names` });
      continue;
    }
    const targetValue = standard * totalAfter;
    const posRoom = (L.maxPositionWeight ?? 1) * totalAfter - s.value;
    const secRoom = L.maxSectorWeight === null ? Infinity : L.maxSectorWeight * totalAfter - (sectorBefore.get(s.bucket) ?? 0) - plannedIn(s.bucket);
    const want = Math.max(0, targetValue - s.value);
    const amt = roundCents(Math.min(want, posRoom, secRoom, satRemaining));
    if (amt < minLine) {
      const why = want <= 0 ? `already at or above your ${pct(standard)} standard position size`
        : posRoom < minLine ? `would exceed your ${pct(L.maxPositionWeight ?? 1)} max position`
        : secRoom < minLine ? `${s.bucket} would exceed your ${pct(L.maxSectorWeight ?? 1)} sector limit`
        : "remaining budget too small";
      skipped.push({ symbol: s.symbol, reason: `Rated ${s.rating === "strong_buy" ? "Strong buy" : "Buy"}, but ${why}` });
      continue;
    }
    add.set(s.symbol, amt);
    sectorPlanned.set(s.bucket, plannedIn(s.bucket) + amt);
    satRemaining -= amt;
    if (!s.held) newCount++;
    const reasons = [
      `${s.rating === "strong_buy" ? "Strong buy" : "Buy"} — personal score ${s.personal!.toFixed(1)} (${s.confidence} confidence)`,
      s.held ? `Tops the position up toward your ${pct(standard)} standard size (now ${pct(s.value / Math.max(totalBefore, 1))})` : `New position sized toward your ${pct(standard)} standard size`,
      `${s.bucket} after this plan: ${pct(((sectorBefore.get(s.bucket) ?? 0) + plannedIn(s.bucket)) / totalAfter)}${L.maxSectorWeight !== null ? ` (limit ${pct(L.maxSectorWeight)})` : ""}`,
    ];
    lines.push({
      symbol: s.symbol, name: s.name, kind: s.held ? "add" : "new", amount: amt, price: s.price, priceAsOf: s.priceAsOf,
      approxShares: s.price ? Math.floor((amt / s.price) * 1000) / 1000 : null,
      weightBefore: s.value / Math.max(totalBefore, 1), weightAfter: (s.value + amt) / totalAfter, reasons,
    });
  }
  if (!ranked.length) notes.push("No individual stock currently rates Buy or better for you with at least medium confidence, so the satellite share goes to the core fund.");
  // unspent satellite budget rolls into core
  if (core) coreAmt += satRemaining;
  else notes.push(`${money(satRemaining)} is left unallocated.`);

  if (core && coreAmt > 0.005) {
    const held = bySymbol.get(core.symbol);
    const val = held?.value ?? 0;
    lines.splice(cashAmt > 0 ? 1 : 0, 0, {
      symbol: core.symbol, name: core.name, kind: "core", amount: roundCents(coreAmt), price: core.price, priceAsOf: core.priceAsOf,
      approxShares: core.price ? Math.floor((coreAmt / core.price) * 1000) / 1000 : null,
      weightBefore: val / Math.max(totalBefore, 1), weightAfter: (val + coreAmt) / totalAfter,
      reasons: [
        `Core: ${pct(coreShare)} of investable new money for risk tolerance ${L.riskTolerance ?? "not set"}${satRemaining > 0.005 && ranked.length ? ", plus any unused stock budget" : ""}`,
        held ? "Your largest diversified fund — adding here keeps costs and complexity low" : "Diversified fallback core fund (you don't hold one yet)",
        "Broad index funds are exempt from the single-position limit because they are diversified",
      ],
    });
    sectorPlanned.set("Diversified (index / multi-sector funds)", plannedIn("Diversified (index / multi-sector funds)") + coreAmt);
  }

  const buckets = new Set([...sectorBefore.keys(), ...sectorPlanned.keys()]);
  const sectorWeightsAfter = [...buckets]
    .map((b) => ({
      bucket: b,
      before: (sectorBefore.get(b) ?? 0) / Math.max(totalBefore, 1),
      after: ((sectorBefore.get(b) ?? 0) + plannedIn(b)) / totalAfter,
      limit: b.startsWith("Diversified") ? null : L.maxSectorWeight,
    }))
    .sort((a, b) => b.after - a.after);
  for (const s of sectorWeightsAfter) {
    if (s.limit !== null && s.before > s.limit) notes.push(`${s.bucket} is already ${pct(s.before)} of your portfolio (limit ${pct(s.limit)}); the plan adds nothing there.`);
  }
  if (L.maxPositionWeight === null || L.maxSectorWeight === null) notes.push("Set max position and max sector limits in Investment DNA so the planner can enforce them.");

  return { version: PLANNER_VERSION, amount, totalBefore, totalAfter, coreShareTarget: coreShare, lines, skipped, notes, sectorWeightsAfter };
}
