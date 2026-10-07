/**
 * Defensive value parsing for provider payloads.
 * Principle: anything not a finite number becomes null — never 0.
 */

export function num(v: unknown): number | null {
  if (v === null || v === undefined || v === "") return null;
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  if (typeof v === "string") {
    const t = v.trim().replace(/,/g, "");
    if (t === "" || /^(n\/?a|none|null|-|—)$/i.test(t)) return null;
    const n = Number(t);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

export function int(v: unknown): number | null {
  const n = num(v);
  return n === null ? null : Math.round(n);
}

/** Provider gives a percent number (1.23 meaning 1.23%) → decimal fraction 0.0123. */
export function pctToFraction(v: unknown): number | null {
  const n = num(v);
  return n === null ? null : n / 100;
}

export function str(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const t = v.trim();
  return t === "" ? null : t;
}

export function bool(v: unknown): boolean | null {
  if (typeof v === "boolean") return v;
  if (v === "true") return true;
  if (v === "false") return false;
  return null;
}

/** Normalize to YYYY-MM-DD, or null when unparseable. */
export function isoDate(v: unknown): string | null {
  const s = str(v);
  if (!s) return null;
  const m = /^(\d{4}-\d{2}-\d{2})/.exec(s);
  if (m) return m[1];
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10);
}

/** Normalize to ISO datetime (UTC), or null. Date-only strings are treated as UTC midnight. */
export function isoDateTime(v: unknown): string | null {
  if (typeof v === "number" && Number.isFinite(v)) {
    // epoch seconds vs ms heuristic: seconds are < 1e11 until year 5138
    const ms = v < 1e11 ? v * 1000 : v;
    return new Date(ms).toISOString();
  }
  const s = str(v);
  if (!s) return null;
  const normalized = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}(:\d{2})?$/.test(s) ? s.replace(" ", "T") + "Z" : s;
  const d = new Date(normalized);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

export function normalizeSymbol(s: string): string {
  return s.trim().toUpperCase();
}

/** First non-null numeric among candidate field names (for provider field renames). */
export function pickNum(obj: Record<string, unknown>, ...keys: string[]): number | null {
  for (const k of keys) {
    const n = num(obj[k]);
    if (n !== null) return n;
  }
  return null;
}

export function pickStr(obj: Record<string, unknown>, ...keys: string[]): string | null {
  for (const k of keys) {
    const s = str(obj[k]);
    if (s !== null) return s;
  }
  return null;
}

/**
 * Returns which of the expected keys are absent from every row — used to
 * surface provider schema drift on the Data Health page.
 */
export function missingKeys(rows: Record<string, unknown>[], expected: string[]): string[] {
  if (rows.length === 0) return [];
  return expected.filter((k) => rows.every((r) => !(k in r)));
}
