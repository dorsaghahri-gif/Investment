/** Concentration measures on portfolio weights (fractions of total). */

/** Herfindahl–Hirschman index Σw² (0..1). Weights are re-normalized to sum to 1. */
export function hhi(weights: number[]): number | null {
  const w = weights.filter((x) => x > 0);
  const total = w.reduce((a, b) => a + b, 0);
  if (!(total > 0)) return null;
  return w.reduce((s, x) => s + (x / total) ** 2, 0);
}

/** Effective number of positions = 1 / HHI. */
export function effectiveN(weights: number[]): number | null {
  const h = hhi(weights);
  return h ? 1 / h : null;
}

export function topNWeight(weights: number[], n: number): number {
  return [...weights].sort((a, b) => b - a).slice(0, n).reduce((a, b) => a + b, 0);
}

/** Sum weights by a grouping key; null/empty keys go to "Unclassified". */
export function groupWeights<T>(items: T[], key: (t: T) => string | null | undefined, weight: (t: T) => number | null): { group: string; weight: number }[] {
  const m = new Map<string, number>();
  for (const it of items) {
    const w = weight(it);
    if (w === null || !(w > 0)) continue;
    const g = key(it) || "Unclassified";
    m.set(g, (m.get(g) ?? 0) + w);
  }
  return [...m.entries()].map(([group, weight]) => ({ group, weight })).sort((a, b) => b.weight - a.weight);
}
