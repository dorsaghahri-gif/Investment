/**
 * Correlation heatmap. Diverging scale: blue (−1) ↔ neutral gray (0) ↔ red (+1).
 * Every cell shows its value, so color is never the only channel.
 */
export function CorrelationHeatmap({ keys, matrix }: { keys: string[]; matrix: (number | null)[][] }) {
  if (keys.length < 2) return <p className="text-sm text-muted-foreground">Needs at least two holdings with a year of price history.</p>;
  const bg = (v: number | null) => {
    if (v === null) return "transparent";
    const pct = Math.round(Math.min(1, Math.abs(v)) * 100);
    return `color-mix(in oklab, ${v >= 0 ? "var(--viz-pos)" : "var(--viz-neg)"} ${pct}%, var(--viz-mid))`;
  };
  return (
    <div className="overflow-x-auto">
      <table className="border-separate border-spacing-0.5 text-[10px]" aria-label="Correlation matrix of daily returns">
        <thead>
          <tr>
            <th />
            {keys.map((k) => <th key={k} className="px-1 font-medium text-muted-foreground">{k}</th>)}
          </tr>
        </thead>
        <tbody>
          {keys.map((a, i) => (
            <tr key={a}>
              <th className="pr-1 text-right font-medium text-muted-foreground">{a}</th>
              {keys.map((b, j) => {
                const v = matrix[i][j];
                if (i === j)
                  return (
                    <td key={b} className="h-7 min-w-9 rounded-sm bg-muted text-center text-muted-foreground" aria-label={`${a} with itself`}>
                      ·
                    </td>
                  );
                const strong = v !== null && Math.abs(v) > 0.55;
                return (
                  <td
                    key={b}
                    title={`${a} × ${b}: ${v === null ? "Data unavailable" : v.toFixed(2)}`}
                    className="num h-7 min-w-9 rounded-sm text-center"
                    style={{ background: bg(v), color: strong ? "white" : "var(--foreground)" }}
                  >
                    {v === null ? "—" : v.toFixed(2)}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
      <div className="mt-2 flex items-center gap-2 text-[10px] text-muted-foreground">
        <span>−1</span>
        <span className="h-2 w-28 rounded" style={{ background: "linear-gradient(90deg, var(--viz-neg), var(--viz-mid), var(--viz-pos))" }} />
        <span>+1</span>
        <span className="ml-2">Higher = moves together (less diversification)</span>
      </div>
    </div>
  );
}
