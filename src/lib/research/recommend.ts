/**
 * Deterministic recommendation engine (docs/SCORING.md §6). The rating, its
 * confidence and every number are fixed here; any AI narrative comes later and
 * cannot change them.
 */
import { CATEGORY_LABEL, METRIC_BY_KEY, type Category } from "./definitions";
import type { ComponentResult, ScoreResult } from "./scoring";

export type Rating = "strong_buy" | "buy" | "watch" | "hold" | "reduce" | "avoid";
export const RATING_RANK: Record<Rating, number> = { strong_buy: 5, buy: 4, watch: 3, hold: 2, reduce: 1, avoid: 0 };

/** UI label: a held BUY reads as "Add"; an un-held HOLD reads as "Neutral". */
export function ratingLabel(r: Rating, held: boolean): string {
  if (held && (r === "buy" || r === "strong_buy")) return r === "strong_buy" ? "Add (strong)" : "Add";
  if (!held && r === "hold") return "Neutral";
  return { strong_buy: "Strong buy", buy: "Buy", watch: "Watch", hold: "Hold", reduce: "Reduce", avoid: "Avoid" }[r];
}

export const STANDARD_POSITION = 0.05; // used when the DNA has no preferred position size

export interface PortfolioContext {
  held: boolean;
  weight: number; // current position weight (0 if not held)
  sectorWeight: number; // current weight of this security's sector
  maxPositionWeight: number | null;
  maxSectorWeight: number | null;
  preferredPositionWeight: number | null;
}

export interface RecInput {
  score: ScoreResult;
  /** Personal score 30 days ago (null when no history yet). */
  personal30dAgo: number | null;
  dnaPass: boolean;
  dnaFailures: string[];
  ctx: PortfolioContext;
  previous: { rating: Rating; personal: number | null } | null;
  /** Market-median raw value for metrics, for "what would change my mind" triggers. */
  marketMedian: (metricKey: string) => number | null;
  isFund?: boolean;
}

export interface Trigger {
  text: string;
  metricKey?: string;
  threshold?: number;
  current?: number | null;
}

export interface Factor {
  metricKey: string;
  label: string;
  category: Category;
  rawValue: number | null;
  subScore: number | null;
  contribution: number | null;
}

export interface RecResult {
  rating: Rating;
  confidence: "high" | "medium" | "low";
  rulesFired: string[];
  positives: Factor[];
  negatives: Factor[];
  risks: string[];
  upgradeTriggers: Trigger[];
  downgradeTriggers: Trigger[];
  portfolioImpact: Record<string, number | null | boolean>;
}

const pct = (v: number) => `${(v * 100).toFixed(1)}%`;

function factor(c: ComponentResult): Factor {
  return { metricKey: c.metricKey, label: METRIC_BY_KEY[c.metricKey]?.label ?? c.metricKey, category: c.category, rawValue: c.rawValue, subScore: c.subScore, contribution: c.contribution };
}

export function formatMetric(key: string, v: number | null): string {
  if (v === null || !Number.isFinite(v)) return "—";
  const unit = METRIC_BY_KEY[key]?.unit;
  if (unit === "x") return `${v.toFixed(1)}×`;
  if (unit === "pct_points") return `${v >= 0 ? "+" : ""}${(v * 100).toFixed(1)} pts`;
  if (unit === "score") return v.toFixed(0);
  return pct(v);
}

interface Decision {
  rating: Rating;
  rules: string[];
}

function decide(s: number | null, val: number | null, conf: RecResult["confidence"], inp: RecInput): Decision {
  const { ctx } = inp;
  const rules: string[] = [];
  const standard = ctx.preferredPositionWeight ?? STANDARD_POSITION;
  const overPos = ctx.maxPositionWeight !== null && ctx.weight > ctx.maxPositionWeight;
  const overSector = ctx.maxSectorWeight !== null && ctx.sectorWeight > ctx.maxSectorWeight;
  const fell10 = s !== null && inp.personal30dAgo !== null && inp.personal30dAgo - s >= 10;
  const rising5 = s !== null && inp.personal30dAgo !== null && s - inp.personal30dAgo >= 5 && inp.personal30dAgo < 75;

  if (inp.isFund) {
    if (ctx.held && (overPos || overSector)) return { rating: "reduce", rules: [overPos ? "fund_over_max_position" : "fund_over_max_sector"] };
    return { rating: ctx.held ? "hold" : "watch", rules: ["fund_not_scored"] };
  }

  if (!inp.dnaPass) {
    if (ctx.held) return { rating: "reduce", rules: ["held_fails_dna"] };
    return { rating: "avoid", rules: ["fails_dna"] };
  }
  if (ctx.held && (overPos || overSector || (s !== null && s < 50) || fell10)) {
    if (overPos) rules.push("position_over_max");
    if (overSector) rules.push("sector_over_max");
    if (s !== null && s < 50) rules.push("score_below_50");
    if (fell10) rules.push("score_fell_10_in_30d");
    return { rating: "reduce", rules };
  }
  if (s === null) return { rating: ctx.held ? "hold" : "watch", rules: ["insufficient_data"] };
  if (!ctx.held && s < 45) return { rating: "avoid", rules: ["score_below_45"] };

  const lowConf = conf === "low";
  const keepsLimits =
    (ctx.maxPositionWeight === null || ctx.weight + standard <= ctx.maxPositionWeight) &&
    (ctx.maxSectorWeight === null || ctx.sectorWeight + standard <= ctx.maxSectorWeight);
  if (!lowConf && s >= 85 && val !== null && val >= 60 && keepsLimits) return { rating: "strong_buy", rules: ["score_ge_85", "valuation_ge_60", "limits_ok"] };
  if (!lowConf && s >= 75 && val !== null && val >= 45) {
    if (!keepsLimits) return { rating: ctx.held ? "hold" : "watch", rules: ["buy_blocked_by_limits"] };
    return { rating: "buy", rules: ["score_ge_75", "valuation_ge_45"] };
  }
  if (s >= 65 && ((val !== null && val < 45) || val === null || lowConf || rising5)) {
    if (val === null || val < 45) rules.push("valuation_below_45");
    if (lowConf) rules.push("low_confidence");
    if (rising5) rules.push("score_rising");
    return { rating: ctx.held ? "hold" : "watch", rules };
  }
  if (rising5) return { rating: ctx.held ? "hold" : "watch", rules: ["score_rising"] };
  return { rating: "hold", rules: [ctx.held ? "score_55_75" : "below_buy_thresholds"] };
}

export function recommend(inp: RecInput): RecResult {
  const s = inp.score.personal;
  const val = inp.score.categories.valuation;
  const conf = inp.score.confidence;
  let d = decide(s, val, conf, inp);

  // Hysteresis: leaving the previous rating requires clearing the boundary by ≥ 2 points.
  if (inp.previous && d.rating !== inp.previous.rating && s !== null) {
    const towardPrev = RATING_RANK[inp.previous.rating] > RATING_RANK[d.rating] ? s + 2 : s - 2;
    const alt = decide(towardPrev, val, conf, inp);
    if (alt.rating === inp.previous.rating) d = { rating: inp.previous.rating, rules: [...alt.rules, "hysteresis_hold"] };
  }

  const scored = inp.score.components.filter((c) => c.contribution !== null);
  const positives = [...scored].sort((a, b) => b.contribution! - a.contribution!).filter((c) => c.contribution! > 0).slice(0, 5).map(factor);
  const negatives = [...scored].sort((a, b) => a.contribution! - b.contribution!).filter((c) => c.contribution! < 0).slice(0, 5).map(factor);

  const raw = (k: string) => inp.score.components.find((c) => c.metricKey === k)?.rawValue ?? null;
  const risks: string[] = [];
  const nd = raw("net_debt_to_ebitda");
  if (nd !== null && nd > 3) risks.push(`High leverage: net debt is ${nd.toFixed(1)}× EBITDA`);
  const disp = raw("estimate_dispersion");
  if (disp !== null && disp > 0.5) risks.push(`Analysts disagree widely on next-year EPS (dispersion ${pct(disp)})`);
  const dma = raw("price_vs_200dma");
  if (dma !== null && dma < -0.15) risks.push(`Price is ${pct(-dma)} below its 200-day average`);
  const ec = raw("earnings_consistency");
  if (ec !== null && ec < 0.6) risks.push(`Inconsistent earnings: positive and non-declining in only ${pct(ec)} of recent years`);
  if (inp.ctx.maxPositionWeight !== null && inp.ctx.weight > inp.ctx.maxPositionWeight)
    risks.push(`Position is ${pct(inp.ctx.weight)} of your portfolio — above your ${pct(inp.ctx.maxPositionWeight)} limit`);
  if (inp.ctx.maxSectorWeight !== null && inp.ctx.sectorWeight > inp.ctx.maxSectorWeight)
    risks.push(`Its sector is ${pct(inp.ctx.sectorWeight)} of your portfolio — above your ${pct(inp.ctx.maxSectorWeight)} limit`);
  if (inp.score.confidence === "low") risks.push("Low data confidence: a large share of the score inputs is missing or stale");
  for (const f of inp.dnaFailures) risks.push(f);

  // "What would change my mind" — thresholds are exactly the ones the rules use.
  const up: Trigger[] = [];
  const down: Trigger[] = [];
  const weakestIn = (cat: Category) =>
    inp.score.components.filter((c) => c.category === cat && c.subScore !== null).sort((a, b) => a.subScore! - b.subScore!)[0];
  const r = d.rating;
  if (s !== null && !inp.isFund && inp.dnaPass) {
    if (RATING_RANK[r] < RATING_RANK.buy) {
      if (s < 75) up.push({ text: `Personal score rises to 75 or more (now ${s.toFixed(1)})`, threshold: 75, current: s });
      if (val === null || val < 45) {
        up.push({ text: `Valuation category reaches 45 or more (now ${val === null ? "unavailable" : val.toFixed(1)})`, threshold: 45, current: val });
        const w = weakestIn("valuation");
        const med = w ? inp.marketMedian(w.metricKey) : null;
        if (w && med !== null) {
          const def = METRIC_BY_KEY[w.metricKey];
          up.push({
            text: `${def.label} ${def.direction === -1 ? "at or below" : "at or above"} ${formatMetric(w.metricKey, med)} (market median; now ${formatMetric(w.metricKey, w.rawValue)})`,
            metricKey: w.metricKey,
            threshold: med,
            current: w.rawValue,
          });
        }
      }
      if (inp.score.confidence === "low") up.push({ text: "More complete data (confidence at least medium)" });
    } else if (r === "buy") {
      if (s < 85) up.push({ text: `Strong buy needs a personal score of 85+ (now ${s.toFixed(1)}) and valuation 60+ (now ${val?.toFixed(1) ?? "—"})`, threshold: 85, current: s });
    }
    if (r === "strong_buy") down.push({ text: `Falls to Buy if the personal score drops below 85 (now ${s.toFixed(1)}) or valuation below 60`, threshold: 85, current: s });
    if (r === "buy") down.push({ text: `Falls to Watch/Hold if the personal score drops below 75 (now ${s.toFixed(1)}) or valuation below 45 (now ${val?.toFixed(1) ?? "—"})`, threshold: 75, current: s });
    if (inp.ctx.held && r !== "reduce") {
      down.push({ text: `Turns Reduce if the personal score falls below 50 (now ${s.toFixed(1)}) or drops 10+ points within 30 days`, threshold: 50, current: s });
      if (inp.ctx.maxPositionWeight !== null)
        down.push({ text: `Turns Reduce if the position grows above ${pct(inp.ctx.maxPositionWeight)} of the portfolio (now ${pct(inp.ctx.weight)})`, threshold: inp.ctx.maxPositionWeight, current: inp.ctx.weight });
    }
    if (!inp.ctx.held && r !== "avoid") down.push({ text: `Turns Avoid if the personal score falls below 45 (now ${s.toFixed(1)})`, threshold: 45, current: s });
  }
  if (r === "reduce" && inp.ctx.held) {
    if (d.rules.includes("position_over_max") && inp.ctx.maxPositionWeight !== null)
      up.push({ text: `Back to Hold once the position is at or below ${pct(inp.ctx.maxPositionWeight)} (now ${pct(inp.ctx.weight)})`, threshold: inp.ctx.maxPositionWeight, current: inp.ctx.weight });
    if (d.rules.includes("sector_over_max") && inp.ctx.maxSectorWeight !== null)
      up.push({ text: `Back to Hold once its sector is at or below ${pct(inp.ctx.maxSectorWeight)} (now ${pct(inp.ctx.sectorWeight)})`, threshold: inp.ctx.maxSectorWeight, current: inp.ctx.sectorWeight });
    if (d.rules.includes("score_below_50") && s !== null) up.push({ text: `Back to Hold if the personal score recovers to 52+ (now ${s.toFixed(1)})`, threshold: 52, current: s });
  }

  const standard = inp.ctx.preferredPositionWeight ?? STANDARD_POSITION;
  return {
    rating: d.rating,
    confidence: conf,
    rulesFired: d.rules,
    positives,
    negatives,
    risks,
    upgradeTriggers: up,
    downgradeTriggers: down,
    portfolioImpact: {
      held: inp.ctx.held,
      currentWeight: inp.ctx.weight,
      sectorWeight: inp.ctx.sectorWeight,
      maxPositionWeight: inp.ctx.maxPositionWeight,
      maxSectorWeight: inp.ctx.maxSectorWeight,
      standardPosition: standard,
      sectorWeightAfterStandardAdd: inp.ctx.sectorWeight + standard,
    },
  };
}

export const CATEGORY_NAMES = CATEGORY_LABEL;
