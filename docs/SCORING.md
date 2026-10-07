# Investment Score & Recommendation Methodology

Version: `score-model v1` (stored on every score row as `model_version`; changing the method bumps the version so history stays interpretable).

The score is a **relative-attractiveness ranking**, not a prediction of returns. It is fully deterministic: same inputs → same score. Claude never produces or alters a score.

---

## 1. Structure

`Overall (0–100) = Σ category_weight × category_score / Σ weights_of_categories_with_sufficient_data`

| Category | Default weight | Underlying metrics (sub-weights within category) |
|---|---:|---|
| Quality | 20 | ROIC (25), ROE (10), gross margin (15), operating margin (15), FCF margin (20), earnings consistency (15) |
| Growth | 15 | Revenue CAGR 3y (25), revenue growth TTM YoY (25), EPS growth TTM YoY (20), FCF growth 3y CAGR (20), growth acceleration (10) |
| Valuation | 15 | Forward P/E (20), EV/EBITDA (20), P/FCF or FCF yield (25), EV/Sales (10), PEG (15), multiple vs own 5y history (10) |
| Forward expectations | 15 | Next-FY EPS growth est. (35), next-FY revenue growth est. (30), upside to consensus target (15), estimate dispersion — lower is better (20) |
| Momentum | 10 | 12-1 month return (40), 6-month return (25), price vs 200-day MA (20), relative strength vs SPY 6m (15) |
| Analyst revisions | 10 | 30d EPS est. revision FY1 (35), 90d EPS est. revision FY1 (25), 90d revenue est. revision (20), net upgrades − downgrades 90d (20) |
| Balance sheet | 5 | Net debt / EBITDA (40), interest coverage (25), current ratio (15), cash / total debt (20) |
| Competitive position | 5 | Gross-margin stability 5y (35), ROIC − sector median ROIC (35), market-share proxy: revenue growth − industry median (30) |
| Insider / institutional | 5 | Net insider buying 6m as % mkt cap (50), change in institutional ownership QoQ (50) |
| **Total** | **100** | |

Weights are user-configurable (Settings → Scoring); stored in `scoring_models`. The engine re-normalizes if weights don't sum to 100.

**Competitive position** is the weakest-evidence category; it uses quantitative proxies only. Moat narratives from Claude are labelled `ai_interpretation` and do **not** feed the score.

---

## 2. Normalization — not raw absolute values

Each metric `m` for company `c` is converted to a 0–100 sub-score by blending comparisons:

```
s(m,c) = w_ind·P_industry + w_sec·P_sector + w_mkt·P_market + w_hist·H_own
```

- `P_x` = percentile rank of `m` within peer group `x` (direction-aware: lower is better for valuation multiples, leverage, dispersion).
- `H_own` = position vs company's own 5-year history: `100·Φ((m − mean_5y)/sd_5y)` (direction-aware), used for margins, ROIC, valuation multiples.
- Default blend: industry 0.35, sector 0.25, market 0.20, own history 0.20.
- **Peer-group size rule:** a group with fewer than 8 members with valid data is dropped and its weight is redistributed (industry → sector → market). Peer counts are stored in the component row.
- **Winsorization:** metrics are clipped at the 2nd/98th percentile of the comparison universe before ranking.
- **Undefined economics:** a P/E with negative earnings is not "cheap". Negative-denominator multiples are excluded from that metric (treated as missing) and the related profitability metric captures the weakness.
- **Universe:** S&P 500 + S&P 400 + user holdings/watchlists by default (configurable). Percentiles are recomputed daily from `financial_metrics` / `valuation_snapshots`.

---

## 3. Missing data & confidence

- A metric with no data is **missing**, never zero. Category score = weighted mean over available metrics; a category needs ≥ 50% of its metric weight present, otherwise the category is `insufficient` and excluded from the overall (weights re-normalized).
- **Data coverage** = Σ weights of available metrics / Σ all weights.
- **Freshness**: each input has an SLA (prices 1 trading day, estimates 7d, fundamentals: last filed period + 100 days). Stale inputs count at half weight toward coverage.
- **Score confidence** (`high` / `medium` / `low`) = f(coverage, freshness, peer group sizes). Shown next to every score. Overall score is hidden (shown as "Insufficient data") if coverage < 60%.

---

## 4. Explainability — what is stored

`investment_scores`: one row per (user, security, snapshot_date, model_version) with overall + 9 category scores, coverage, confidence.

`investment_score_components`: one row per metric with
`category, metric_key, raw_value, unit, direction, peer_group, peer_count, percentile_industry, percentile_sector, percentile_market, own_history_z, sub_score, weight, contribution, source_provider, data_kind, as_of`.

From these rows the UI (and Claude, via the fact sheet) derives:

- **WHY IT SCORES HIGH** — top 5 components by positive contribution vs neutral (50).
- **WHAT COULD GO WRONG** — bottom 5 components + risk flags (leverage, estimate dispersion, concentration).
- **WHAT WOULD CHANGE THE SCORE** — sensitivity: for each top-weighted metric, the raw-value change needed to move the overall score by ±5 points, solved deterministically against the stored peer distribution.

---

## 5. Personal fit (Investment DNA)

The score is universal; **fit** is personal and separate:

- **Hard constraints** (from Investment DNA): excluded sectors, market-cap range, max leverage, min ROIC/growth, profitability requirement → pass/fail with the failing rule listed.
- **Soft preferences**: growth-vs-value tilt, dividend preference, momentum preference → multiply category weights (bounded ±30%) to produce a **Personal Score** alongside the universal score.
- Freeform instructions are converted by Claude into a proposed structured rule set, **shown to the user for confirmation** before being saved. Unconvertible preferences are stored as text and only used as narrative context.

---

## 6. Recommendation engine (deterministic)

Inputs: personal score, score trend (7d/30d), valuation category score, fair-value range (when available), DNA hard-constraint result, portfolio context (current weight vs max position size, sector weight vs max sector concentration), data confidence.

| Rating | Rule (all conditions) |
|---|---|
| STRONG BUY | personal score ≥ 85, valuation ≥ 60, passes DNA, confidence ≥ medium, adding a standard position keeps limits |
| BUY | score ≥ 75, valuation ≥ 45, passes DNA, confidence ≥ medium |
| WATCH | score ≥ 65 but valuation < 45 **or** confidence low **or** score rising ≥ 5 pts/30d from below 75 |
| HOLD | held position, score 55–75, no limit breach |
| REDUCE | held and (position > max position size **or** sector > max sector **or** score < 50 **or** score fell ≥ 10 pts/30d) |
| AVOID | fails a DNA hard constraint **or** score < 45 (not held) |

- **Hysteresis:** a rating change requires crossing the threshold by ≥ 2 points or persisting 2 consecutive snapshots, to prevent flip-flopping on noise.
- **Confidence** = min(score confidence, fair-value confidence); low confidence caps the rating at WATCH/HOLD.
- **Fair value** is shown as a range only when ≥ 2 independent methods are available (e.g., multiple-based on own-history median forward P/E × FY1/FY2 EPS; consensus target range; reverse-DCF implied growth). No single-point fair value.
- **"What would change my mind"** triggers are generated deterministically from the rule table and sensitivities (e.g., *Upgrade if forward P/E < 25 (currently 29.4)*), with thresholds the rule actually uses.
- Claude then writes the narrative (positives, negatives, risks, catalysts, portfolio impact) from the fact sheet; the rating, confidence and numbers are fixed before Claude sees them.

---

## 7. Validation

- Unit tests for every metric transform (direction, winsorization, missing handling).
- Golden-file test: fixture universe → expected scores; any change to the method must update the golden file and bump `model_version`.
- Backtest harness (Phase 4+): score deciles vs forward 3/6/12m relative returns — **diagnostic only**, never presented as expected return.
