/** Assemble planner inputs for the signed-in user (RLS-scoped reads). */
import "server-only";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { listAccounts, listHoldings } from "@/lib/portfolio/repository";
import { valuePortfolio } from "@/lib/portfolio/valuation";
import { loadDna } from "@/lib/jobs/compute-scores";
import { classify } from "./funds";
import { listRecommendations } from "./queries";
import type { PlanHolding, PlanInput, PlanSecurity } from "./planner";

export async function loadPlanInputs(userId: string, amount: number): Promise<{ input: PlanInput; hasDna: boolean; hasScores: boolean; unpriced: string[] }> {
  const db = await createSupabaseServerClient();
  const [accounts, holdings, recs, dna] = await Promise.all([listAccounts(userId), listHoldings(userId), listRecommendations(userId), loadDna(db, userId)]);
  const cash = accounts.reduce((s, a) => s + a.cash_balance, 0);
  const val = valuePortfolio(holdings, cash);
  const recBySymbol = new Map(recs.map((r) => [r.symbol, r]));

  const merged = new Map<string, PlanHolding>();
  for (const h of val.holdings) {
    if (h.marketValue === null) continue;
    const src = holdings.find((x) => x.id === h.id)!;
    const cl = classify({ symbol: h.symbol, name: src.name, sector: src.sector, securityType: src.securityType });
    const rec = recBySymbol.get(h.symbol);
    const prev = merged.get(h.symbol);
    merged.set(h.symbol, {
      symbol: h.symbol,
      name: src.name,
      price: h.price,
      priceAsOf: h.quoteTime,
      bucket: cl.bucket,
      isFund: cl.isFund,
      isBroad: cl.isBroad,
      rating: rec?.rating ?? null,
      personal: rec?.score?.personal ?? null,
      confidence: rec?.confidence ?? null,
      dnaPass: rec?.score?.dnaPass ?? null,
      value: (prev?.value ?? 0) + h.marketValue,
    });
  }

  const candidates: PlanSecurity[] = recs
    .filter((r) => !r.portfolioImpact.held && !r.portfolioImpact.isFund && (r.rating === "buy" || r.rating === "strong_buy"))
    .map((r) => ({
      symbol: r.symbol,
      name: r.name,
      price: r.price,
      priceAsOf: r.priceAsOf,
      bucket: r.sector ?? "Unknown sector",
      isFund: false,
      isBroad: false,
      rating: r.rating,
      personal: r.score?.personal ?? null,
      confidence: r.confidence,
      dnaPass: r.score?.dnaPass ?? null,
    }));

  // fallback core: SPY (always tracked as a benchmark)
  const { data: spy } = await db.from("companies").select("symbol, name, security_quotes(price, quote_time)").eq("symbol", "SPY").maybeSingle();
  const q = spy ? (Array.isArray(spy.security_quotes) ? spy.security_quotes[0] : spy.security_quotes) as { price: number | null; quote_time: string | null } | null : null;
  const fallbackCore: PlanSecurity | null = q?.price != null
    ? { symbol: "SPY", name: (spy?.name as string) ?? "SPDR S&P 500 ETF", price: Number(q.price), priceAsOf: q.quote_time, bucket: "Diversified (index / multi-sector funds)", isFund: true, isBroad: true, rating: null, personal: null, confidence: null, dnaPass: null }
    : null;

  return {
    input: {
      amount,
      cash,
      holdings: [...merged.values()],
      candidates,
      limits: {
        riskTolerance: dna?.risk_tolerance ?? null,
        maxPositionWeight: dna?.max_position_weight ?? null,
        maxSectorWeight: dna?.max_sector_weight ?? null,
        preferredPositionWeight: dna?.preferred_position_weight ?? null,
        cashTargetWeight: dna?.cash_target_weight ?? null,
      },
      fallbackCore,
    },
    hasDna: dna !== null,
    hasScores: recs.length > 0,
    unpriced: val.unpricedSymbols,
  };
}
