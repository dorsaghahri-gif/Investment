/**
 * Research data access for pages (RLS-scoped: runs as the signed-in user).
 * Scores and recommendations are per-user; market data is shared.
 */
import "server-only";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { Category } from "./definitions";
import type { Factor, Rating, Trigger } from "./recommend";
import type { FitCheck } from "./fit";

const one = <T,>(v: T | T[] | null | undefined): T | null => (Array.isArray(v) ? (v[0] ?? null) : (v ?? null));
const n = (v: unknown): number | null => (v === null || v === undefined ? null : Number(v));

export interface ScoreSummary {
  id: string;
  overall: number | null;
  personal: number | null;
  categories: Record<Category, number | null>;
  coverage: number;
  confidence: "high" | "medium" | "low";
  dnaPass: boolean | null;
  dnaFailures: FitCheck[];
  snapshotDate: string;
  computedAt: string;
}

export interface RecRow {
  companyId: string;
  symbol: string;
  name: string | null;
  sector: string | null;
  industry: string | null;
  securityType: string | null;
  inUniverse: boolean;
  rating: Rating;
  confidence: "high" | "medium" | "low";
  snapshotDate: string;
  price: number | null;
  priceAsOf: string | null;
  positives: Factor[];
  negatives: Factor[];
  risks: string[];
  upgradeTriggers: Trigger[];
  downgradeTriggers: Trigger[];
  rulesFired: string[];
  portfolioImpact: { held?: boolean; currentWeight?: number; sectorWeight?: number; bucket?: string; isFund?: boolean; isBroad?: boolean; maxPositionWeight?: number | null; maxSectorWeight?: number | null };
  score: ScoreSummary | null;
}

const SCORE_COLS = "id, overall, personal, quality, growth, valuation, forward, momentum, revisions, balance_sheet, competitive, ownership, coverage, confidence, dna_pass, dna_failures, snapshot_date, computed_at";

function toScore(s: Record<string, unknown> | null): ScoreSummary | null {
  if (!s) return null;
  return {
    id: s.id as string,
    overall: n(s.overall),
    personal: n(s.personal),
    categories: {
      quality: n(s.quality), growth: n(s.growth), valuation: n(s.valuation), forward: n(s.forward), momentum: n(s.momentum),
      revisions: n(s.revisions), balance_sheet: n(s.balance_sheet), competitive: n(s.competitive), ownership: n(s.ownership),
    },
    coverage: Number(s.coverage),
    confidence: s.confidence as ScoreSummary["confidence"],
    dnaPass: (s.dna_pass as boolean | null) ?? null,
    dnaFailures: (s.dna_failures as FitCheck[]) ?? [],
    snapshotDate: s.snapshot_date as string,
    computedAt: s.computed_at as string,
  };
}

function toRec(r: Record<string, unknown>): RecRow {
  const c = one(r.companies as Record<string, unknown> | Record<string, unknown>[] | null) ?? {};
  return {
    companyId: r.company_id as string,
    symbol: c.symbol as string,
    name: (c.name as string) ?? null,
    sector: (c.sector as string) ?? null,
    industry: (c.industry as string) ?? null,
    securityType: (c.security_type as string) ?? null,
    inUniverse: Boolean(c.in_universe),
    rating: r.rating as Rating,
    confidence: r.confidence as RecRow["confidence"],
    snapshotDate: r.snapshot_date as string,
    price: n(r.price),
    priceAsOf: (r.price_as_of as string) ?? null,
    positives: (r.positives as Factor[]) ?? [],
    negatives: (r.negatives as Factor[]) ?? [],
    risks: (r.risks as string[]) ?? [],
    upgradeTriggers: (r.upgrade_triggers as Trigger[]) ?? [],
    downgradeTriggers: (r.downgrade_triggers as Trigger[]) ?? [],
    rulesFired: (r.rules_fired as string[]) ?? [],
    portfolioImpact: (r.portfolio_impact as RecRow["portfolioImpact"]) ?? {},
    score: toScore(one(r.investment_scores as Record<string, unknown> | Record<string, unknown>[] | null)),
  };
}

const REC_SELECT = `company_id, rating, confidence, snapshot_date, price, price_as_of, positives, negatives, risks, upgrade_triggers, downgrade_triggers, rules_fired, portfolio_impact,
  companies(symbol, name, sector, industry, security_type, in_universe), investment_scores(${SCORE_COLS})`;

export async function latestRecDate(userId: string): Promise<string | null> {
  const db = await createSupabaseServerClient();
  const { data, error } = await db.from("recommendations").select("snapshot_date").eq("user_id", userId).order("snapshot_date", { ascending: false }).limit(1).maybeSingle();
  if (error) throw new Error(error.message);
  return (data?.snapshot_date as string) ?? null;
}

/** All of a user's recommendations for their latest snapshot date. */
export async function listRecommendations(userId: string): Promise<RecRow[]> {
  const date = await latestRecDate(userId);
  if (!date) return [];
  const db = await createSupabaseServerClient();
  const out: RecRow[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await db.from("recommendations").select(REC_SELECT).eq("user_id", userId).eq("snapshot_date", date).order("company_id").range(from, from + 999);
    if (error) throw new Error(error.message);
    out.push(...(data ?? []).map((r) => toRec(r as Record<string, unknown>)));
    if (!data || data.length < 1000) break;
  }
  return out;
}

export interface ComponentRow {
  category: Category;
  metricKey: string;
  rawValue: number | null;
  peerGroup: string | null;
  peerCount: number | null;
  percentileIndustry: number | null;
  percentileSector: number | null;
  percentileMarket: number | null;
  ownHistoryZ: number | null;
  subScore: number | null;
  weight: number;
  contribution: number | null;
  isMissing: boolean;
  isStale: boolean;
  dataKind: string | null;
  asOf: string | null;
}

export interface CompanyResearch {
  company: {
    id: string; symbol: string; name: string | null; sector: string | null; industry: string | null; securityType: string | null;
    description: string | null; website: string | null; exchange: string | null; inUniverse: boolean; profileFetchedAt: string | null; fundamentalsFetchedAt: string | null;
  };
  quote: { price: number | null; changePct: number | null; marketCap: number | null; quoteTime: string | null; provider: string | null; yearHigh: number | null; yearLow: number | null } | null;
  rec: RecRow | null;
  components: ComponentRow[];
  history: { date: string; personal: number | null; overall: number | null }[];
  ratingHistory: { date: string; from: Rating | null; to: Rating }[];
  annuals: { periodEnd: string; fiscalYear: number | null; revenue: number | null; netIncome: number | null; fcf: number | null; epsDiluted: number | null; source: string; fetchedAt: string }[];
}

export async function getCompanyResearch(userId: string, symbol: string): Promise<CompanyResearch | null> {
  const db = await createSupabaseServerClient();
  const sym = symbol.toUpperCase();
  const { data: c, error } = await db
    .from("companies")
    .select("id, symbol, name, sector, industry, security_type, description, website, exchange, in_universe, fetched_at, fundamentals_fetched_at, security_quotes(price, change_pct, market_cap, quote_time, source_provider, year_high, year_low)")
    .eq("symbol", sym)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!c) return null;
  const q = one(c.security_quotes as Record<string, unknown> | Record<string, unknown>[] | null);

  const [recRes, histRes, rhRes, stRes] = await Promise.all([
    db.from("recommendations").select(REC_SELECT).eq("user_id", userId).eq("company_id", c.id).order("snapshot_date", { ascending: false }).limit(1).maybeSingle(),
    db.from("investment_scores").select("snapshot_date, personal, overall").eq("user_id", userId).eq("company_id", c.id).order("snapshot_date", { ascending: false }).limit(180),
    db.from("recommendation_history").select("changed_on, from_rating, to_rating").eq("user_id", userId).eq("company_id", c.id).order("changed_on", { ascending: false }).limit(20),
    db.from("financial_statements").select("statement_type, period_end, fiscal_year, line_items, source_provider, fetched_at").eq("company_id", c.id).eq("period", "annual").order("period_end", { ascending: false }).limit(30),
  ]);
  if (recRes.error) throw new Error(recRes.error.message);
  const rec = recRes.data ? toRec(recRes.data as Record<string, unknown>) : null;

  let components: ComponentRow[] = [];
  if (rec?.score) {
    const { data, error: e } = await db
      .from("investment_score_components")
      .select("category, metric_key, raw_value, peer_group, peer_count, percentile_industry, percentile_sector, percentile_market, own_history_z, sub_score, weight, contribution, is_missing, is_stale, data_kind, as_of")
      .eq("score_id", rec.score.id);
    if (e) throw new Error(e.message);
    components = (data ?? []).map((r) => ({
      category: r.category as Category, metricKey: r.metric_key as string, rawValue: n(r.raw_value), peerGroup: (r.peer_group as string) ?? null, peerCount: n(r.peer_count),
      percentileIndustry: n(r.percentile_industry), percentileSector: n(r.percentile_sector), percentileMarket: n(r.percentile_market), ownHistoryZ: n(r.own_history_z),
      subScore: n(r.sub_score), weight: Number(r.weight), contribution: n(r.contribution), isMissing: Boolean(r.is_missing), isStale: Boolean(r.is_stale),
      dataKind: (r.data_kind as string) ?? null, asOf: (r.as_of as string) ?? null,
    }));
  }

  const byPe = new Map<string, CompanyResearch["annuals"][number]>();
  for (const s of stRes.data ?? []) {
    const pe = s.period_end as string;
    const row = byPe.get(pe) ?? byPe.set(pe, { periodEnd: pe, fiscalYear: n(s.fiscal_year), revenue: null, netIncome: null, fcf: null, epsDiluted: null, source: s.source_provider as string, fetchedAt: s.fetched_at as string }).get(pe)!;
    const li = (s.line_items ?? {}) as Record<string, number | null>;
    if (s.statement_type === "income") {
      row.revenue = n(li.revenue);
      row.netIncome = n(li.net_income);
      row.epsDiluted = n(li.eps_diluted);
    } else if (s.statement_type === "cash_flow") row.fcf = n(li.free_cash_flow);
  }

  return {
    company: {
      id: c.id as string, symbol: c.symbol as string, name: (c.name as string) ?? null, sector: (c.sector as string) ?? null, industry: (c.industry as string) ?? null,
      securityType: (c.security_type as string) ?? null, description: (c.description as string) ?? null, website: (c.website as string) ?? null, exchange: (c.exchange as string) ?? null,
      inUniverse: Boolean(c.in_universe), profileFetchedAt: (c.fetched_at as string) ?? null, fundamentalsFetchedAt: (c.fundamentals_fetched_at as string) ?? null,
    },
    quote: q
      ? { price: n(q.price), changePct: n(q.change_pct), marketCap: n(q.market_cap), quoteTime: (q.quote_time as string) ?? null, provider: (q.source_provider as string) ?? null, yearHigh: n(q.year_high), yearLow: n(q.year_low) }
      : null,
    rec,
    components,
    history: (histRes.data ?? []).map((h) => ({ date: h.snapshot_date as string, personal: n(h.personal), overall: n(h.overall) })).reverse(),
    ratingHistory: (rhRes.data ?? []).map((h) => ({ date: h.changed_on as string, from: (h.from_rating as Rating) ?? null, to: h.to_rating as Rating })),
    annuals: [...byPe.values()].sort((a, b) => b.periodEnd.localeCompare(a.periodEnd)).slice(0, 6),
  };
}

/** Symbol/name search over known companies. User input is escaped for LIKE. */
export async function searchCompanies(query: string, limit = 12) {
  const q = query.trim().slice(0, 40);
  if (!q) return [];
  const esc = q.replace(/[\\%_]/g, (m) => `\\${m}`).replace(/[,()]/g, " ");
  const db = await createSupabaseServerClient();
  const { data, error } = await db
    .from("companies")
    .select("symbol, name, sector, security_type, in_universe")
    .or(`symbol.ilike.${esc.toUpperCase()}%,name.ilike.%${esc}%`)
    .order("in_universe", { ascending: false })
    .order("symbol")
    .limit(limit);
  if (error) throw new Error(error.message);
  return (data ?? []) as { symbol: string; name: string | null; sector: string | null; security_type: string | null; in_universe: boolean }[];
}
