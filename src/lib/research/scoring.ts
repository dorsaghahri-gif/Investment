/**
 * Deterministic scoring engine (docs/SCORING.md §1–4). Same inputs → same output.
 * Percentiles are relative to the scored universe; nothing here predicts returns.
 */
import {
  CATEGORIES,
  DEFAULT_CATEGORY_WEIGHTS,
  METRICS,
  MIN_CATEGORY_COVERAGE,
  MIN_OVERALL_COVERAGE,
  MIN_PEER_GROUP,
  PEER_BLEND,
  type Category,
  type MetricDef,
} from "./definitions";
import type { MetricMap, MetricValue } from "./metrics";

export interface ScoreInput {
  id: string;
  symbol: string;
  sector: string | null;
  industry: string | null;
  metrics: MetricMap;
}

export interface ComponentResult {
  category: Category;
  metricKey: string;
  rawValue: number | null;
  direction: 1 | -1;
  peerGroup: string | null;
  peerCount: number | null;
  percentileIndustry: number | null;
  percentileSector: number | null;
  percentileMarket: number | null;
  ownHistoryZ: number | null;
  subScore: number | null;
  /** Effective weight in overall-score points (0–100 scale). 0 when excluded. */
  weight: number;
  /** Signed points vs a neutral 50: weight × (subScore − 50) / 100. */
  contribution: number | null;
  isMissing: boolean;
  isStale: boolean;
  dataKind: MetricValue["dataKind"];
  asOf: string | null;
}

export type CategoryScores = Record<Category, number | null>;

export interface ScoreResult {
  id: string;
  symbol: string;
  overall: number | null;
  personal: number | null;
  categories: CategoryScores;
  coverage: number;
  confidence: "high" | "medium" | "low";
  components: ComponentResult[];
}

export interface ScoreOptions {
  today: string;
  categoryWeights?: Partial<Record<Category, number>>;
  /** Multipliers from Investment DNA soft preferences (bounded 0.7–1.3). */
  personalMultipliers?: Partial<Record<Category, number>>;
}

// ── Math helpers ──────────────────────────────────────────────────

/** Standard normal CDF (Abramowitz–Stegun 7.1.26, |err| < 1.5e-7). */
export function normCdf(x: number): number {
  const t = 1 / (1 + 0.3275911 * Math.abs(x) / Math.SQRT2);
  const y = 1 - (((((1.061405429 * t - 1.453152027) * t + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t) * Math.exp(-(x * x) / 2);
  return x >= 0 ? (1 + y) / 2 : (1 - y) / 2;
}

export function quantile(sorted: number[], q: number): number {
  if (!sorted.length) return NaN;
  const pos = (sorted.length - 1) * q;
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (pos - lo);
}

export function median(xs: number[]): number | null {
  if (!xs.length) return null;
  return quantile([...xs].sort((a, b) => a - b), 0.5);
}

/** Mid-rank percentile (0–100) of v within sorted values, higher = larger value. */
export function percentileRank(sorted: number[], v: number): number {
  let below = 0;
  let equal = 0;
  for (const x of sorted) {
    if (x < v) below++;
    else if (x === v) equal++;
  }
  return (100 * (below + 0.5 * equal)) / sorted.length;
}

const finite = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);
const round2 = (v: number) => Math.round(v * 100) / 100;

// ── Staleness ─────────────────────────────────────────────────────

const DAY = 86_400_000;
export function isStale(def: MetricDef, mv: MetricValue, today: string): boolean {
  if (!mv.asOf) return false;
  const age = (Date.parse(today) - Date.parse(mv.asOf)) / DAY;
  if (def.category === "momentum") return age > 5;
  if (mv.dataKind === "estimate") return age > 7;
  if (def.category === "valuation") return age > 5; // price-driven
  return age > 15 * 30; // annual fundamentals: fiscal year-end + ~15 months
}

// ── Cross-sectional metrics ───────────────────────────────────────

function addRelativeMetrics(rows: ScoreInput[]): void {
  const by = (keyFn: (r: ScoreInput) => string | null, metric: string) => {
    const m = new Map<string, number[]>();
    for (const r of rows) {
      const k = keyFn(r);
      const v = r.metrics[metric]?.value;
      if (k && finite(v)) (m.get(k) ?? m.set(k, []).get(k)!).push(v);
    }
    return m;
  };
  const roicBySector = by((r) => r.sector, "roic");
  const growthByIndustry = by((r) => r.industry, "revenue_growth_yoy");
  const growthBySector = by((r) => r.sector, "revenue_growth_yoy");
  for (const r of rows) {
    const roic = r.metrics.roic;
    const sectorRoic = r.sector ? roicBySector.get(r.sector) ?? [] : [];
    const med = sectorRoic.length >= 5 ? median(sectorRoic) : null;
    r.metrics.roic_vs_sector = { value: roic && finite(roic.value) && med !== null ? roic.value - med : null, asOf: roic?.asOf ?? null, dataKind: "calculated" };
    const gr = r.metrics.revenue_growth_yoy;
    const ind = r.industry ? growthByIndustry.get(r.industry) ?? [] : [];
    const sec = r.sector ? growthBySector.get(r.sector) ?? [] : [];
    const gmed = ind.length >= 5 ? median(ind) : sec.length >= 5 ? median(sec) : null;
    r.metrics.growth_vs_industry = { value: gr && finite(gr.value) && gmed !== null ? gr.value - gmed : null, asOf: gr?.asOf ?? null, dataKind: "calculated" };
  }
}

// ── Engine ────────────────────────────────────────────────────────

interface Dist {
  lo: number;
  hi: number;
  market: number[];
  bySector: Map<string, number[]>;
  byIndustry: Map<string, number[]>;
}

function buildDist(rows: ScoreInput[], key: string): Dist {
  const raw = rows.map((r) => r.metrics[key]?.value).filter(finite).sort((a, b) => a - b);
  const lo = raw.length ? quantile(raw, 0.02) : 0;
  const hi = raw.length ? quantile(raw, 0.98) : 0;
  const clip = (v: number) => Math.min(hi, Math.max(lo, v));
  const market = raw.map(clip);
  const bySector = new Map<string, number[]>();
  const byIndustry = new Map<string, number[]>();
  for (const r of rows) {
    const v = r.metrics[key]?.value;
    if (!finite(v)) continue;
    if (r.sector) (bySector.get(r.sector) ?? bySector.set(r.sector, []).get(r.sector)!).push(clip(v));
    if (r.industry) (byIndustry.get(r.industry) ?? byIndustry.set(r.industry, []).get(r.industry)!).push(clip(v));
  }
  for (const m of [bySector, byIndustry]) for (const arr of m.values()) arr.sort((a, b) => a - b);
  return { lo, hi, market, bySector, byIndustry };
}

export function ownHistoryZ(value: number, history: number[] | undefined): number | null {
  const h = (history ?? []).filter(finite);
  if (h.length < 3) return null;
  const mean = h.reduce((a, b) => a + b, 0) / h.length;
  const sd = Math.sqrt(h.reduce((a, b) => a + (b - mean) ** 2, 0) / (h.length - 1));
  if (!(sd > 1e-12)) return null;
  return (value - mean) / sd;
}

export function confidenceFor(coverage: number): "high" | "medium" | "low" {
  return coverage >= 0.85 ? "high" : coverage >= 0.65 ? "medium" : "low";
}

export function scoreUniverse(input: ScoreInput[], opts: ScoreOptions): ScoreResult[] {
  // work on copies so callers' metric maps are not mutated
  const rows: ScoreInput[] = input.map((r) => ({ ...r, metrics: { ...r.metrics } }));
  addRelativeMetrics(rows);

  const dists = new Map<string, Dist>(METRICS.map((m) => [m.key, buildDist(rows, m.key)]));
  const catWeights: Record<Category, number> = { ...DEFAULT_CATEGORY_WEIGHTS, ...(opts.categoryWeights ?? {}) };
  const catTotal = (c: Category) => METRICS.filter((m) => m.category === c).reduce((a, m) => a + m.weight, 0);

  return rows.map((r) => {
    const comps: ComponentResult[] = [];
    const catScores = {} as CategoryScores;
    const catPresentShare = {} as Record<Category, number>; // stale-adjusted share of metric weight present

    for (const c of CATEGORIES) {
      let wSum = 0;
      let sSum = 0;
      let present = 0;
      let presentAdj = 0;
      for (const def of METRICS.filter((m) => m.category === c)) {
        const mv = r.metrics[def.key] ?? { value: null, asOf: null, dataKind: "calculated" as const };
        const d = dists.get(def.key)!;
        const comp: ComponentResult = {
          category: c,
          metricKey: def.key,
          rawValue: finite(mv.value) ? mv.value : null,
          direction: def.direction,
          peerGroup: null,
          peerCount: null,
          percentileIndustry: null,
          percentileSector: null,
          percentileMarket: null,
          ownHistoryZ: null,
          subScore: null,
          weight: 0,
          contribution: null,
          isMissing: !finite(mv.value),
          isStale: false,
          dataKind: mv.dataKind,
          asOf: mv.asOf,
        };
        if (finite(mv.value)) {
          const v = Math.min(d.hi, Math.max(d.lo, mv.value));
          const dirP = (sorted: number[]) => {
            const p = percentileRank(sorted, v);
            return def.direction === 1 ? p : 100 - p;
          };
          const ind = r.industry ? d.byIndustry.get(r.industry) ?? [] : [];
          const sec = r.sector ? d.bySector.get(r.sector) ?? [] : [];
          // peer-group size rule: drop groups < MIN_PEER_GROUP, redistribute industry → sector → market
          const indOk = ind.length >= MIN_PEER_GROUP;
          const secOk = sec.length >= MIN_PEER_GROUP;
          const wInd = indOk ? PEER_BLEND.industry : 0;
          let carry = indOk ? 0 : PEER_BLEND.industry;
          const wSec = secOk ? PEER_BLEND.sector + carry : 0;
          carry = secOk ? 0 : PEER_BLEND.sector + carry;
          // market always kept when it has any data (tiny universes still rank, at low confidence)
          const wMkt = d.market.length >= 2 ? PEER_BLEND.market + carry : 0;
          const z = def.useHistory ? ownHistoryZ(mv.value, mv.history) : null;
          const wHist = z !== null ? PEER_BLEND.history : 0;
          comp.percentileIndustry = wInd ? round2(dirP(ind)) : null;
          comp.percentileSector = wSec ? round2(dirP(sec)) : null;
          comp.percentileMarket = wMkt ? round2(dirP(d.market)) : null;
          comp.ownHistoryZ = z !== null ? Math.round(z * 10000) / 10000 : null;
          const H = z !== null ? 100 * normCdf(def.direction * z) : 0;
          const tot = wInd + wSec + wMkt + wHist;
          if (tot > 0) {
            comp.subScore = round2(((comp.percentileIndustry ?? 0) * wInd + (comp.percentileSector ?? 0) * wSec + (comp.percentileMarket ?? 0) * wMkt + H * wHist) / tot);
            const groupLabel = wInd ? `Industry: ${r.industry}` : wSec ? `Sector: ${r.sector}` : "Market";
            comp.peerGroup = groupLabel;
            comp.peerCount = wInd ? ind.length : wSec ? sec.length : d.market.length;
            comp.isStale = isStale(def, mv, opts.today);
            wSum += def.weight;
            sSum += def.weight * comp.subScore;
            present += def.weight;
            presentAdj += def.weight * (comp.isStale ? 0.5 : 1);
          } else {
            comp.isMissing = true;
          }
        }
        comps.push(comp);
      }
      const share = present / catTotal(c);
      catPresentShare[c] = presentAdj / catTotal(c);
      catScores[c] = share >= MIN_CATEGORY_COVERAGE && wSum > 0 ? round2(sSum / wSum) : null;
    }

    const allW = CATEGORIES.reduce((a, c) => a + catWeights[c], 0);
    const coverage = allW > 0 ? CATEGORIES.reduce((a, c) => a + catWeights[c] * catPresentShare[c], 0) / allW : 0;

    const blend = (mult: Partial<Record<Category, number>>) => {
      let w = 0;
      let s = 0;
      for (const c of CATEGORIES) {
        const sc = catScores[c];
        if (sc === null) continue;
        const cw = catWeights[c] * Math.min(1.3, Math.max(0.7, mult[c] ?? 1));
        w += cw;
        s += cw * sc;
      }
      return w > 0 ? round2(s / w) : null;
    };
    const showOverall = coverage >= MIN_OVERALL_COVERAGE;
    const overall = showOverall ? blend({}) : null;
    const personal = showOverall ? blend(opts.personalMultipliers ?? {}) : null;

    // effective weights & signed contributions (universal weights)
    const usedCatW = CATEGORIES.reduce((a, c) => a + (catScores[c] !== null ? catWeights[c] : 0), 0);
    for (const c of CATEGORIES) {
      if (catScores[c] === null || usedCatW === 0) continue;
      const inCat = comps.filter((x) => x.category === c && x.subScore !== null);
      const mw = inCat.reduce((a, x) => a + METRICS.find((m) => m.key === x.metricKey)!.weight, 0);
      for (const x of inCat) {
        const def = METRICS.find((m) => m.key === x.metricKey)!;
        x.weight = Math.round(((catWeights[c] / usedCatW) * (def.weight / mw) * 100) * 10000) / 10000;
        x.contribution = Math.round(((x.weight * (x.subScore! - 50)) / 100) * 10000) / 10000;
      }
    }

    return {
      id: r.id,
      symbol: r.symbol,
      overall,
      personal,
      categories: catScores,
      coverage: Math.round(coverage * 10000) / 10000,
      confidence: confidenceFor(coverage),
      components: comps,
    };
  });
}

/**
 * Value of a metric at a given market percentile (direction-aware), used for
 * "what would change my mind" triggers. Returns null with < MIN_PEER_GROUP values.
 */
export function marketValueAtScore(input: ScoreInput[], metricKey: string, targetScore: number): number | null {
  const def = METRICS.find((m) => m.key === metricKey);
  if (!def) return null;
  const vals = input.map((r) => r.metrics[metricKey]?.value).filter(finite).sort((a, b) => a - b);
  if (vals.length < MIN_PEER_GROUP) return null;
  const q = def.direction === 1 ? targetScore / 100 : 1 - targetScore / 100;
  return quantile(vals, Math.min(1, Math.max(0, q)));
}
