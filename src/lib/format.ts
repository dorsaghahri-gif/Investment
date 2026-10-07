/**
 * Display formatting. Missing values render as an em dash with an accessible
 * "Data unavailable" title — never as 0.
 */
export const MISSING = "—";

export function formatMoney(v: number | null | undefined, currency = "USD", opts: { compact?: boolean; decimals?: number } = {}): string {
  if (v === null || v === undefined || !Number.isFinite(v)) return MISSING;
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
    notation: opts.compact ? "compact" : "standard",
    minimumFractionDigits: opts.compact ? 0 : (opts.decimals ?? 2),
    maximumFractionDigits: opts.compact ? 2 : (opts.decimals ?? 2),
  }).format(v);
}

export function formatSignedMoney(v: number | null | undefined, currency = "USD"): string {
  if (v === null || v === undefined || !Number.isFinite(v)) return MISSING;
  const s = formatMoney(Math.abs(v), currency);
  return v > 0 ? `+${s}` : v < 0 ? `−${s}` : s;
}

/** Input is a decimal fraction (0.0123 → "1.23%"). */
export function formatPct(v: number | null | undefined, opts: { decimals?: number; signed?: boolean } = {}): string {
  if (v === null || v === undefined || !Number.isFinite(v)) return MISSING;
  const d = opts.decimals ?? 2;
  const s = `${Math.abs(v * 100).toFixed(d)}%`;
  if (!opts.signed) return v < 0 ? `−${s}` : s;
  return v > 0 ? `+${s}` : v < 0 ? `−${s}` : s;
}

export function formatNumber(v: number | null | undefined, decimals = 2): string {
  if (v === null || v === undefined || !Number.isFinite(v)) return MISSING;
  return new Intl.NumberFormat("en-US", { maximumFractionDigits: decimals }).format(v);
}

export function formatQuantity(v: number | null | undefined): string {
  return formatNumber(v, 6);
}

/** "3h ago", "2d ago" relative to now. */
export function formatAge(iso: string | null | undefined, now: Date = new Date()): string {
  if (!iso) return "never";
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return "unknown";
  const s = Math.max(0, Math.round((now.getTime() - t) / 1000));
  if (s < 60) return "just now";
  const m = Math.round(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60);
  if (h < 48) return `${h}h ago`;
  return `${Math.round(h / 24)}d ago`;
}

export function formatTimestamp(iso: string | null | undefined, timeZone = "America/Chicago"): string {
  if (!iso) return MISSING;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return MISSING;
  // Note: dateStyle/timeStyle cannot be combined with timeZoneName (throws on newer runtimes).
  return new Intl.DateTimeFormat("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZone,
    timeZoneName: "short",
  }).format(d);
}

export type Staleness = "fresh" | "stale" | "critical" | "unknown";

/** Price staleness: weekends tolerated via a generous threshold until a trading calendar lands (Phase 7). */
export function priceStaleness(iso: string | null | undefined, now: Date = new Date()): Staleness {
  if (!iso) return "unknown";
  const hours = (now.getTime() - new Date(iso).getTime()) / 3_600_000;
  if (Number.isNaN(hours)) return "unknown";
  if (hours <= 80) return "fresh"; // covers Fri close → Mon morning
  if (hours <= 24 * 7) return "stale";
  return "critical";
}
