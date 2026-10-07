/** Horizontal magnitude bars (single hue). Labels in text ink, value right-aligned. */
export function BarList({ items, format, max = 12 }: { items: { label: string; value: number }[]; format: (v: number) => string; max?: number }) {
  const shown = items.slice(0, max);
  const rest = items.slice(max);
  const rows = rest.length ? [...shown, { label: `Other (${rest.length})`, value: rest.reduce((s, i) => s + i.value, 0) }] : shown;
  const top = Math.max(...rows.map((r) => r.value), 0) || 1;
  if (!rows.length) return <p className="text-sm text-muted-foreground">Data unavailable.</p>;
  return (
    <ul className="space-y-1.5">
      {rows.map((r) => (
        <li key={r.label} className="group grid grid-cols-[minmax(0,6.5rem)_1fr_3rem] items-center gap-2 text-xs" title={`${r.label}: ${format(r.value)}`}>
          <span className="truncate">{r.label}</span>
          <span className="h-2.5 rounded-r-[4px] bg-viz-seq/85 group-hover:bg-viz-seq" style={{ width: `${Math.max(1, (r.value / top) * 100)}%` }} />
          <span className="num text-right text-muted-foreground">{format(r.value)}</span>
        </li>
      ))}
    </ul>
  );
}
