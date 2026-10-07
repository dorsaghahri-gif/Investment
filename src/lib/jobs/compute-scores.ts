/**
 * Job: compute metrics → scores → recommendations for every user with access.
 * Metrics are universal (computed once); scores carry each user's personal
 * tilt, DNA fit and portfolio context. Fully deterministic from stored rows.
 */
import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { LineItems } from "@/lib/domain/fundamentals";
import { ENGINE_VERSION, MODEL_VERSION } from "@/lib/research/definitions";
import { checkFit, personalMultipliers, type DnaProfile } from "@/lib/research/fit";
import { classify } from "@/lib/research/funds";
import { computeCompanyMetrics, fitInputs, momentumFromPoints, type AnnualPeriod, type EstimateInput, type MetricInputs, type MomentumPoints } from "@/lib/research/metrics";
import { recommend, type Rating } from "@/lib/research/recommend";
import { marketValueAtScore, scoreUniverse, type ScoreInput, type ScoreResult } from "@/lib/research/scoring";
import type { JobContext } from "./runner";
import { selectAll } from "./store-research-supabase";

const chunk = <T>(arr: T[], n: number) => Array.from({ length: Math.ceil(arr.length / n) }, (_, i) => arr.slice(i * n, i * n + n));
const num = (v: unknown): number | null => (v === null || v === undefined || v === "" ? null : Number.isFinite(Number(v)) ? Number(v) : null);
const addDays = (d: string, n: number) => {
  const x = new Date(d + "T00:00:00Z");
  x.setUTCDate(x.getUTCDate() + n);
  return x.toISOString().slice(0, 10);
};

export interface CompanyInfo {
  id: string;
  symbol: string;
  name: string | null;
  sector: string | null;
  industry: string | null;
  securityType: string | null;
  inUniverse: boolean;
}

export interface UniverseData {
  companies: Map<string, CompanyInfo>; // id → info
  inputs: ScoreInput[]; // stocks with metrics
  fit: Map<string, { marketCap: number | null; netIncome: number | null }>;
  price: Map<string, { price: number | null; asOf: string | null }>;
}

/** Load stored rows and compute universal metrics for universe ∪ held stocks. */
export async function loadUniverse(db: SupabaseClient, today: string): Promise<UniverseData> {
  const held = await selectAll<{ company_id: string | null; symbol: string }>((a, b) =>
    db.from("portfolio_holdings").select("company_id, symbol").gt("quantity", 0).order("id").range(a, b),
  );
  const heldIds = [...new Set(held.map((h) => h.company_id).filter((x): x is string => !!x))];
  const cols = "id, symbol, name, sector, industry, security_type, in_universe";
  const universe = await selectAll<Record<string, unknown>>((a, b) => db.from("companies").select(cols).eq("in_universe", true).order("id").range(a, b));
  const extra = heldIds.length ? ((await db.from("companies").select(cols).in("id", heldIds)).data ?? []) : [];
  const spy = (await db.from("companies").select(cols).eq("symbol", "SPY").maybeSingle()).data;
  const companies = new Map<string, CompanyInfo>();
  for (const r of [...universe, ...extra, ...(spy ? [spy] : [])] as Record<string, unknown>[]) {
    companies.set(r.id as string, {
      id: r.id as string,
      symbol: r.symbol as string,
      name: (r.name as string) ?? null,
      sector: (r.sector as string) ?? null,
      industry: (r.industry as string) ?? null,
      securityType: (r.security_type as string) ?? null,
      inUniverse: Boolean(r.in_universe),
    });
  }
  const ids = [...companies.keys()];

  // statements (annual), grouped by company and period end
  const stmts = new Map<string, Map<string, AnnualPeriod>>();
  for (const part of chunk(ids, 150)) {
    const rows = await selectAll<Record<string, unknown>>((a, b) =>
      db.from("financial_statements").select("company_id, statement_type, period_end, fiscal_year, line_items").eq("period", "annual").in("company_id", part).order("id").range(a, b),
    );
    for (const r of rows) {
      const cid = r.company_id as string;
      const pe = r.period_end as string;
      const byPe = stmts.get(cid) ?? stmts.set(cid, new Map()).get(cid)!;
      const p = byPe.get(pe) ?? byPe.set(pe, { periodEnd: pe, fiscalYear: num(r.fiscal_year), income: {}, balance: {}, cash: {} }).get(pe)!;
      const li = (r.line_items ?? {}) as LineItems;
      if (r.statement_type === "income") p.income = li;
      else if (r.statement_type === "balance") p.balance = li;
      else p.cash = li;
    }
  }

  // quotes
  const quotes = new Map<string, { price: number | null; marketCap: number | null; asOf: string | null }>();
  for (const part of chunk(ids, 300)) {
    const { data, error } = await db.from("security_quotes").select("company_id, price, market_cap, quote_time, fetched_at").in("company_id", part);
    if (error) throw new Error(error.message);
    for (const q of data ?? []) quotes.set(q.company_id as string, { price: num(q.price), marketCap: num(q.market_cap), asOf: ((q.quote_time ?? q.fetched_at) as string)?.slice(0, 10) ?? null });
  }

  // momentum points & fiscal-year-end closes (set-based SQL)
  const mom = new Map<string, MomentumPoints>();
  {
    const { data, error } = await db.rpc("research_momentum_inputs", { p_as_of: today });
    if (error) throw new Error(error.message);
    for (const r of (data ?? []) as Record<string, unknown>[]) {
      mom.set(r.company_id as string, {
        lastDate: (r.last_date as string) ?? null, lastClose: num(r.last_close),
        d1m: (r.d_1m as string) ?? null, close1m: num(r.close_1m),
        d6m: (r.d_6m as string) ?? null, close6m: num(r.close_6m),
        d12m: (r.d_12m as string) ?? null, close12m: num(r.close_12m),
        avg200: num(r.avg_200), n200: num(r.n_200),
      });
    }
  }
  const fyCloses = new Map<string, Record<string, number | null>>();
  {
    const { data, error } = await db.rpc("research_fy_end_closes");
    if (error) throw new Error(error.message);
    for (const r of (data ?? []) as Record<string, unknown>[]) {
      const m = fyCloses.get(r.company_id as string) ?? fyCloses.set(r.company_id as string, {}).get(r.company_id as string)!;
      m[r.period_end as string] = num(r.close);
    }
  }

  // latest analyst estimates / targets (present only if the data plan includes them)
  const est = new Map<string, EstimateInput[]>();
  const tgt = new Map<string, { mean: number | null; asOf: string }>();
  const since = addDays(today, -14);
  for (const part of chunk(ids, 150)) {
    const e = await db.from("analyst_estimates").select("company_id, fiscal_period_end, snapshot_date, eps_avg, eps_low, eps_high, revenue_avg").eq("period", "annual").gte("snapshot_date", since).in("company_id", part);
    if (e.error) throw new Error(e.error.message);
    for (const r of e.data ?? []) {
      const list = est.get(r.company_id as string) ?? est.set(r.company_id as string, []).get(r.company_id as string)!;
      list.push({ fiscalPeriodEnd: r.fiscal_period_end as string, epsAvg: num(r.eps_avg), epsLow: num(r.eps_low), epsHigh: num(r.eps_high), revenueAvg: num(r.revenue_avg), asOf: r.snapshot_date as string });
    }
    const t = await db.from("price_targets").select("company_id, snapshot_date, target_mean").gte("snapshot_date", since).in("company_id", part).order("snapshot_date");
    if (t.error) throw new Error(t.error.message);
    for (const r of t.data ?? []) tgt.set(r.company_id as string, { mean: num(r.target_mean), asOf: r.snapshot_date as string });
  }

  const spyMom = spy ? mom.get(spy.id as string) ?? null : null;
  const inputs: ScoreInput[] = [];
  const fit = new Map<string, { marketCap: number | null; netIncome: number | null }>();
  const price = new Map<string, { price: number | null; asOf: string | null }>();
  for (const c of companies.values()) {
    const q = quotes.get(c.id);
    const m = mom.get(c.id);
    price.set(c.id, { price: q?.price ?? m?.lastClose ?? null, asOf: q?.asOf ?? m?.lastDate ?? null });
    const isStock = c.securityType === "stock" || c.securityType === "adr";
    const annuals = [...(stmts.get(c.id)?.values() ?? [])];
    if (!isStock || !annuals.length) continue;
    const latestFy = annuals.map((a) => a.periodEnd).sort().at(-1)!;
    const fy1 = (est.get(c.id) ?? []).filter((e) => e.fiscalPeriodEnd > latestFy).sort((a, b) => a.fiscalPeriodEnd.localeCompare(b.fiscalPeriodEnd) || b.asOf.localeCompare(a.asOf))[0] ?? null;
    const t = tgt.get(c.id);
    const inp: MetricInputs = {
      annuals,
      price: q?.price ?? m?.lastClose ?? null,
      priceAsOf: q?.asOf ?? m?.lastDate ?? null,
      marketCap: q?.marketCap ?? null,
      closes: [],
      benchmarkCloses: [],
      estimate: fy1,
      targetMean: t?.mean ?? null,
      targetAsOf: t?.asOf ?? null,
      momentum: m ? momentumFromPoints(m, spyMom) : momentumFromPoints({ lastDate: null, lastClose: null, d1m: null, close1m: null, d6m: null, close6m: null, d12m: null, close12m: null, avg200: null, n200: null }, null),
      fyEndCloses: fyCloses.get(c.id) ?? {},
    };
    inputs.push({ id: c.id, symbol: c.symbol, sector: c.sector, industry: c.industry, metrics: computeCompanyMetrics(inp) });
    fit.set(c.id, fitInputs(inp));
  }
  return { companies, inputs, fit, price };
}

const DNA_COLS =
  "excluded_sectors, preferred_sectors, market_cap_min, market_cap_max, max_net_debt_to_ebitda, min_roic, min_revenue_growth, min_eps_growth, min_fcf_growth, require_profitability, valuation_ranges, quality_requirements, growth_value_tilt, momentum_preference, dividend_preference, risk_tolerance, horizon_years, max_position_weight, max_sector_weight, preferred_position_weight, cash_target_weight, max_speculative_weight";

export function toDna(r: Record<string, unknown> | null): DnaProfile | null {
  if (!r) return null;
  return {
    excluded_sectors: (r.excluded_sectors as string[]) ?? [],
    preferred_sectors: (r.preferred_sectors as string[]) ?? [],
    market_cap_min: num(r.market_cap_min),
    market_cap_max: num(r.market_cap_max),
    max_net_debt_to_ebitda: num(r.max_net_debt_to_ebitda),
    min_roic: num(r.min_roic),
    min_revenue_growth: num(r.min_revenue_growth),
    min_eps_growth: num(r.min_eps_growth),
    min_fcf_growth: num(r.min_fcf_growth),
    require_profitability: Boolean(r.require_profitability),
    valuation_ranges: (r.valuation_ranges as DnaProfile["valuation_ranges"]) ?? {},
    quality_requirements: (r.quality_requirements as DnaProfile["quality_requirements"]) ?? {},
    growth_value_tilt: num(r.growth_value_tilt),
    momentum_preference: num(r.momentum_preference),
    dividend_preference: num(r.dividend_preference),
    risk_tolerance: num(r.risk_tolerance),
    horizon_years: num(r.horizon_years),
    max_position_weight: num(r.max_position_weight),
    max_sector_weight: num(r.max_sector_weight),
    preferred_position_weight: num(r.preferred_position_weight),
    cash_target_weight: num(r.cash_target_weight),
    max_speculative_weight: num(r.max_speculative_weight),
  };
}

export async function loadDna(db: SupabaseClient, userId: string): Promise<DnaProfile | null> {
  const { data, error } = await db.from("investment_profiles").select(DNA_COLS).eq("user_id", userId).maybeSingle();
  if (error) throw new Error(error.message);
  return toDna(data as Record<string, unknown> | null);
}

export interface PortfolioPosition {
  companyId: string;
  value: number;
  bucket: string;
  isFund: boolean;
  isBroad: boolean;
}

/** Owner-scoped positions valued at the latest price; unpriced positions are excluded (never 0). */
export async function loadPositions(db: SupabaseClient, userId: string, u: Pick<UniverseData, "companies" | "price">) {
  const [h, a] = await Promise.all([
    db.from("portfolio_holdings").select("company_id, symbol, quantity, companies(id, symbol, name, sector, industry, security_type)").eq("user_id", userId).gt("quantity", 0),
    db.from("accounts").select("cash_balance").eq("user_id", userId).eq("is_archived", false),
  ]);
  if (h.error) throw new Error(h.error.message);
  if (a.error) throw new Error(a.error.message);
  const cash = (a.data ?? []).reduce((s, r) => s + (num(r.cash_balance) ?? 0), 0);
  const byCompany = new Map<string, PortfolioPosition>();
  const unpriced: string[] = [];
  for (const r of h.data ?? []) {
    const c = (Array.isArray(r.companies) ? r.companies[0] : r.companies) as Record<string, unknown> | null;
    const id = (r.company_id as string) ?? (c?.id as string);
    if (!id) continue;
    if (!u.companies.has(id) && c) {
      u.companies.set(id, { id, symbol: c.symbol as string, name: (c.name as string) ?? null, sector: (c.sector as string) ?? null, industry: (c.industry as string) ?? null, securityType: (c.security_type as string) ?? null, inUniverse: false });
    }
    const info = u.companies.get(id)!;
    const px = u.price.get(id)?.price ?? null;
    if (px === null) {
      unpriced.push(info.symbol);
      continue;
    }
    const cl = classify({ symbol: info.symbol, name: info.name, sector: info.sector, securityType: info.securityType });
    const prev = byCompany.get(id);
    byCompany.set(id, { companyId: id, value: (prev?.value ?? 0) + Number(r.quantity) * px, bucket: cl.bucket, isFund: cl.isFund, isBroad: cl.isBroad });
  }
  const invested = [...byCompany.values()].reduce((s, p) => s + p.value, 0);
  const total = invested + cash;
  const sector = new Map<string, number>();
  for (const p of byCompany.values()) sector.set(p.bucket, (sector.get(p.bucket) ?? 0) + p.value);
  return { positions: byCompany, cash, total, sectorValue: sector, unpriced };
}

export interface ComputeScoresSummary {
  users: number;
  scored: number;
  recommendations: number;
  ratingChanges: number;
}

export async function computeScores(ctx: JobContext, db: SupabaseClient, today: string): Promise<ComputeScoresSummary> {
  const u = await loadUniverse(db, today);
  const summary: ComputeScoresSummary = { users: 0, scored: 0, recommendations: 0, ratingChanges: 0 };

  const [users, access] = await Promise.all([db.from("users").select("id, email"), db.from("access_list").select("email, revoked_at")]);
  if (users.error) throw new Error(users.error.message);
  if (access.error) throw new Error(access.error.message);
  const active = new Set((access.data ?? []).filter((r) => !r.revoked_at).map((r) => String(r.email).toLowerCase()));
  const targets = (users.data ?? []).filter((x) => active.has(String(x.email).toLowerCase()));
  ctx.setItemsTotal(targets.length);

  // market medians for "what would change my mind" triggers (universal)
  const medianCache = new Map<string, number | null>();
  const marketMedian = (k: string) => {
    if (!medianCache.has(k)) medianCache.set(k, marketValueAtScore(u.inputs, k, 50));
    return medianCache.get(k)!;
  };

  await ctx.forEachIsolated(targets, 1, (t) => `scores:${t.id}`, async (user) => {
    const dna = await loadDna(db, user.id);
    const pf = await loadPositions(db, user.id, u);
    const results = scoreUniverse(u.inputs, { today, personalMultipliers: personalMultipliers(dna) });

    // previous ratings (hysteresis) and scores ~30 days ago (trend rules)
    const prevRecs = new Map<string, { rating: Rating; personal: number | null; id: string }>();
    {
      const { data, error } = await db
        .from("recommendations")
        .select("id, company_id, rating, snapshot_date, investment_scores(personal)")
        .eq("user_id", user.id)
        .lt("snapshot_date", today)
        .gte("snapshot_date", addDays(today, -10))
        .order("snapshot_date", { ascending: false });
      if (error) throw new Error(error.message);
      for (const r of data ?? []) {
        if (prevRecs.has(r.company_id as string)) continue;
        const s = (Array.isArray(r.investment_scores) ? r.investment_scores[0] : r.investment_scores) as { personal: number | null } | null;
        prevRecs.set(r.company_id as string, { rating: r.rating as Rating, personal: num(s?.personal), id: r.id as string });
      }
    }
    const ago = new Map<string, number | null>();
    {
      const rows = await selectAll<{ company_id: string; personal: number | null; snapshot_date: string }>((a, b) =>
        db.from("investment_scores").select("company_id, personal, snapshot_date").eq("user_id", user.id).eq("model_version", MODEL_VERSION)
          .lte("snapshot_date", addDays(today, -30)).gte("snapshot_date", addDays(today, -37)).order("snapshot_date", { ascending: false }).range(a, b),
      );
      for (const r of rows) if (!ago.has(r.company_id)) ago.set(r.company_id, num(r.personal));
    }

    const ctxFor = (companyId: string, bucket: string, isBroad: boolean) => {
      const pos = pf.positions.get(companyId);
      const tot = Math.max(pf.total, 1);
      return {
        held: !!pos,
        weight: pos ? pos.value / tot : 0,
        sectorWeight: isBroad ? 0 : (pf.sectorValue.get(bucket) ?? 0) / tot,
        // broad index funds are diversified: no single-position or sector limit applies
        maxPositionWeight: isBroad ? null : dna?.max_position_weight ?? null,
        maxSectorWeight: isBroad ? null : dna?.max_sector_weight ?? null,
        preferredPositionWeight: dna?.preferred_position_weight ?? null,
      };
    };

    // 1) scores
    const scoreRows = results.map((r) => {
      const info = u.companies.get(r.id)!;
      const f = checkFit(dna, { sector: info.sector, ...(u.fit.get(r.id) ?? { marketCap: null, netIncome: null }), metrics: u.inputs.find((x) => x.id === r.id)!.metrics });
      return { r, f };
    });
    const idByCompany = new Map<string, string>();
    for (const part of chunk(scoreRows, 500)) {
      const { data, error } = await db
        .from("investment_scores")
        .upsert(
          part.map(({ r, f }) => ({
            user_id: user.id, company_id: r.id, snapshot_date: today, model_version: MODEL_VERSION,
            overall: r.overall, personal: r.personal,
            quality: r.categories.quality, growth: r.categories.growth, valuation: r.categories.valuation, forward: r.categories.forward,
            momentum: r.categories.momentum, revisions: r.categories.revisions, balance_sheet: r.categories.balance_sheet,
            competitive: r.categories.competitive, ownership: r.categories.ownership,
            coverage: r.coverage, confidence: r.confidence, dna_pass: f.pass, dna_failures: f.checks, computed_at: new Date().toISOString(),
          })),
          { onConflict: "user_id,company_id,snapshot_date,model_version" },
        )
        .select("id, company_id");
      if (error) throw new Error(error.message);
      for (const x of data ?? []) idByCompany.set(x.company_id as string, x.id as string);
    }
    // components: replace today's, prune older snapshots
    const scoreIds = [...idByCompany.values()];
    for (const part of chunk(scoreIds, 200)) {
      const { error } = await db.from("investment_score_components").delete().in("score_id", part);
      if (error) throw new Error(error.message);
    }
    const compRows = scoreRows.flatMap(({ r }) =>
      r.components.map((c) => ({
        score_id: idByCompany.get(r.id)!, category: c.category, metric_key: c.metricKey, raw_value: c.rawValue, unit: null,
        direction: c.direction, peer_group: c.peerGroup, peer_count: c.peerCount, percentile_industry: c.percentileIndustry,
        percentile_sector: c.percentileSector, percentile_market: c.percentileMarket, own_history_z: c.ownHistoryZ,
        sub_score: c.subScore, weight: c.weight, contribution: c.contribution, is_missing: c.isMissing, is_stale: c.isStale,
        source_provider: "calc", data_kind: c.dataKind, as_of: c.asOf,
      })),
    );
    for (const part of chunk(compRows, 2000)) {
      const { error } = await db.from("investment_score_components").insert(part);
      if (error) throw new Error(error.message);
    }
    await db.rpc("prune_score_components", { p_user: user.id, p_keep_from: today });
    summary.scored += results.length;

    // 2) recommendations (scored stocks + held funds / unscored holdings)
    const recRows: Record<string, unknown>[] = [];
    const history: Record<string, unknown>[] = [];
    const push = (companyId: string, score: ScoreResult | null, fitPass: boolean, fitFailures: string[]) => {
      const info = u.companies.get(companyId)!;
      const cl = classify({ symbol: info.symbol, name: info.name, sector: info.sector, securityType: info.securityType });
      const ctxp = ctxFor(companyId, cl.bucket, cl.isBroad);
      const prev = prevRecs.get(companyId) ?? null;
      const s: ScoreResult = score ?? {
        id: companyId, symbol: info.symbol, overall: null, personal: null, coverage: 0, confidence: "low", components: [],
        categories: { quality: null, growth: null, valuation: null, forward: null, momentum: null, revisions: null, balance_sheet: null, competitive: null, ownership: null },
      };
      const rec = recommend({ score: s, personal30dAgo: ago.get(companyId) ?? null, dnaPass: fitPass, dnaFailures: fitFailures, ctx: ctxp, previous: prev, marketMedian, isFund: cl.isFund });
      const px = u.price.get(companyId);
      recRows.push({
        user_id: user.id, company_id: companyId, snapshot_date: today, rating: rec.rating, confidence: rec.confidence, engine_version: ENGINE_VERSION,
        score_id: idByCompany.get(companyId) ?? null, price: px?.price ?? null, price_as_of: px?.asOf ? `${px.asOf}T00:00:00Z` : null,
        fair_value_low: null, fair_value_high: null, fair_value_methods: [],
        positives: rec.positives, negatives: rec.negatives, risks: rec.risks, catalysts: [], portfolio_impact: { ...rec.portfolioImpact, bucket: cl.bucket, isFund: cl.isFund, isBroad: cl.isBroad },
        upgrade_triggers: rec.upgradeTriggers, downgrade_triggers: rec.downgradeTriggers, rules_fired: rec.rulesFired,
        data_freshness: { priceAsOf: px?.asOf ?? null, scoreCoverage: s.coverage },
      });
      if (prev && prev.rating !== rec.rating) {
        history.push({ user_id: user.id, company_id: companyId, changed_on: today, from_rating: prev.rating, to_rating: rec.rating, from_recommendation_id: prev.id, reasons: rec.rulesFired });
      }
    };
    const scored = new Set<string>();
    for (const { r, f } of scoreRows) {
      push(r.id, r, f.pass, f.checks.filter((c) => c.status === "fail").map((c) => c.detail));
      scored.add(r.id);
    }
    for (const id of pf.positions.keys()) if (!scored.has(id)) push(id, null, true, []);

    for (const part of chunk(recRows, 500)) {
      const { error } = await db.from("recommendations").upsert(part, { onConflict: "user_id,company_id,snapshot_date" });
      if (error) throw new Error(error.message);
    }
    // re-running the same day replaces that day's history rows
    {
      const { error } = await db.from("recommendation_history").delete().eq("user_id", user.id).eq("changed_on", today);
      if (error) throw new Error(error.message);
    }
    if (history.length) {
      const { error } = await db.from("recommendation_history").insert(history);
      if (error) throw new Error(error.message);
    }
    summary.recommendations += recRows.length;
    summary.ratingChanges += history.length;
    summary.users++;
    ctx.addRecords(results.length + recRows.length);
  });

  return summary;
}
