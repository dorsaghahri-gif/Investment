/**
 * CSV import for positions or transactions exported by common brokers
 * (Fidelity, Schwab, Vanguard, generic). Pure: parse → validate → preview.
 * Nothing is written until the user confirms the preview.
 *
 * Every rejected row is reported with its line number and reason.
 * Values that had to be derived (e.g. total cost from avg cost × qty) are
 * listed in `notes` so the preview shows exactly what was calculated.
 */
import Papa from "papaparse";
import type { PositionInput, TransactionInput, TransactionType } from "./types";

export const MAX_IMPORT_ROWS = 10_000;
export const MAX_IMPORT_BYTES = 2 * 1024 * 1024;

type Field =
  | "symbol"
  | "quantity"
  | "costBasisTotal"
  | "avgCost"
  | "currency"
  | "acquiredOn"
  | "date"
  | "action"
  | "price"
  | "amount"
  | "fees"
  | "description"
  | "splitRatio"
  | "externalId";

const SYNONYMS: Record<Field, string[]> = {
  symbol: ["symbol", "ticker", "ticker symbol", "security symbol", "instrument"],
  quantity: ["quantity", "shares", "qty", "units", "share quantity", "quantity (shares)"],
  costBasisTotal: ["cost basis", "cost basis total", "total cost", "total cost basis", "cost_basis", "costbasis", "book value", "cost basis ($)"],
  avgCost: ["average cost", "avg cost", "cost per share", "average cost basis", "unit cost", "avg cost basis", "average cost per share"],
  currency: ["currency", "ccy"],
  acquiredOn: ["acquired", "acquired on", "acquisition date", "open date", "purchase date"],
  date: ["date", "trade date", "run date", "transaction date", "activity date"],
  action: ["action", "type", "transaction type", "activity", "transaction", "activity type"],
  price: ["price", "price ($)", "execution price", "share price", "price per share"],
  amount: ["amount", "net amount", "amount ($)", "total amount", "net cash", "value"],
  fees: ["fees", "commission", "fees & comm", "commissions", "fees ($)", "commission ($)"],
  description: ["description", "security description", "memo", "name", "security name"],
  splitRatio: ["split ratio", "ratio"],
  externalId: ["id", "transaction id", "reference", "ref"],
};

const norm = (h: string) => h.trim().toLowerCase().replace(/\s+/g, " ");

export function mapHeaders(headers: string[]): Partial<Record<Field, string>> {
  const out: Partial<Record<Field, string>> = {};
  const normalized = new Map(headers.map((h) => [norm(h), h]));
  for (const [field, syns] of Object.entries(SYNONYMS) as [Field, string[]][]) {
    for (const s of syns) {
      const hit = normalized.get(s);
      if (hit !== undefined) {
        out[field] = hit;
        break;
      }
    }
  }
  return out;
}

/** "$1,234.56" → 1234.56; "(12.5)" → -12.5; "" / "--" → null. */
export function parseMoney(v: unknown): number | null {
  if (v === null || v === undefined) return null;
  let s = String(v).trim();
  if (!s || /^(-+|n\/a|--)$/i.test(s)) return null;
  let neg = false;
  if (/^\(.*\)$/.test(s)) {
    neg = true;
    s = s.slice(1, -1);
  }
  s = s.replace(/[$,\s]/g, "").replace(/^\+/, "");
  if (s.endsWith("%")) return null;
  const n = Number(s);
  if (!Number.isFinite(n)) return null;
  return neg ? -n : n;
}

export function parseDate(v: unknown): string | null {
  const s = String(v ?? "").trim();
  if (!s) return null;
  let m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s);
  if (m) return valid(+m[1], +m[2], +m[3]);
  m = /^(\d{1,2})\/(\d{1,2})\/(\d{2,4})/.exec(s); // US M/D/Y
  if (m) {
    const y = m[3].length === 2 ? 2000 + +m[3] : +m[3];
    return valid(y, +m[1], +m[2]);
  }
  return null;
}
function valid(y: number, mo: number, d: number): string | null {
  const dt = new Date(Date.UTC(y, mo - 1, d));
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== mo - 1 || dt.getUTCDate() !== d) return null;
  return dt.toISOString().slice(0, 10);
}

const SYMBOL_RE = /^[A-Z0-9][A-Z0-9.\-]{0,14}$/;
const CASH_LIKE = /^(SPAXX|FDRXX|FZFXX|SWVXX|VMFXX|VMMXX|CASH|CORE|PENDING|ACCOUNT TOTAL|TOTAL)/;

export function normalizeImportSymbol(raw: unknown): { symbol: string | null; reason?: string } {
  const s = String(raw ?? "")
    .trim()
    .toUpperCase()
    .replace(/\*+$/, "")
    .replace(/\s+/g, "");
  if (!s) return { symbol: null, reason: "missing symbol" };
  if (CASH_LIKE.test(s)) return { symbol: null, reason: `"${s}" looks like a cash / summary row — enter cash on the account instead` };
  const cleaned = s.replace("/", ".");
  if (!SYMBOL_RE.test(cleaned)) return { symbol: null, reason: `"${s}" is not a valid ticker` };
  return { symbol: cleaned };
}

export function normalizeAction(raw: unknown): TransactionType | null {
  const s = String(raw ?? "").trim().toLowerCase();
  if (!s) return null;
  if (/reinvest/.test(s)) return "reinvest";
  if (/\b(you )?(bought|buy|purchased?)\b/.test(s)) return "buy";
  if (/\b(you )?(sold|sell|sale)\b/.test(s)) return "sell";
  if (/dividend|distribution|cap(ital)? gain/.test(s)) return "dividend";
  if (/interest/.test(s)) return "interest";
  if (/split/.test(s)) return "split";
  if (/fee|commission|adr mgmt/.test(s)) return "fee";
  if (/withdraw|disbursement|transfer out|journal out|wire out/.test(s)) return /transfer out|journal out/.test(s) ? "transfer_out" : "withdrawal";
  if (/deposit|contribution|transfer in|journal in|wire in|electronic funds/.test(s)) return /transfer in|journal in/.test(s) ? "transfer_in" : "deposit";
  return null;
}

/** Sign convention: amount is the signed cash impact on the account. */
const CASH_SIGN: Partial<Record<TransactionType, 1 | -1>> = {
  buy: -1,
  reinvest: -1,
  withdrawal: -1,
  fee: -1,
  sell: 1,
  dividend: 1,
  interest: 1,
  deposit: 1,
};

export interface ImportRowError {
  line: number;
  message: string;
}
export interface ImportRow<T> {
  line: number;
  data: T;
  notes: string[];
}
export interface ImportPreview<T> {
  kind: "positions" | "transactions";
  headerMap: Partial<Record<Field, string>>;
  rows: ImportRow<T>[];
  errors: ImportRowError[];
  totalRows: number;
}

function parseCsv(text: string): { headers: string[]; records: Record<string, string>[]; parseErrors: ImportRowError[] } {
  // Some broker exports have preamble lines before the header; skip to the first line containing a known header.
  const lines = text.replace(/^﻿/, "").split(/\r?\n/);
  const headerIdx = lines.findIndex((l) => /symbol|ticker/i.test(l) && /,/.test(l));
  const body = (headerIdx > 0 ? lines.slice(headerIdx) : lines).join("\n");
  const offset = headerIdx > 0 ? headerIdx : 0;
  const res = Papa.parse<Record<string, string>>(body, { header: true, skipEmptyLines: "greedy", transformHeader: (h) => h.trim() });
  return {
    headers: res.meta.fields ?? [],
    records: res.data,
    parseErrors: res.errors.map((e) => ({ line: (e.row ?? 0) + 2 + offset, message: e.message })),
  };
}

export function detectKind(headers: string[]): "positions" | "transactions" {
  const m = mapHeaders(headers);
  return m.date && m.action ? "transactions" : "positions";
}

export function parsePositionsCsv(text: string, defaultCurrency = "USD"): ImportPreview<PositionInput> {
  const { headers, records, parseErrors } = parseCsv(text);
  const map = mapHeaders(headers);
  const errors: ImportRowError[] = [...parseErrors];
  const rows: ImportRow<PositionInput>[] = [];
  const offset = text.split(/\r?\n/).findIndex((l) => /symbol|ticker/i.test(l) && /,/.test(l));
  const lineOf = (i: number) => i + 2 + Math.max(0, offset);

  if (!map.symbol || !map.quantity) {
    errors.push({ line: 1, message: "Could not find required columns: Symbol and Quantity." });
    return { kind: "positions", headerMap: map, rows, errors, totalRows: records.length };
  }
  if (records.length > MAX_IMPORT_ROWS) {
    errors.push({ line: 1, message: `Too many rows (${records.length}); max ${MAX_IMPORT_ROWS}.` });
    return { kind: "positions", headerMap: map, rows, errors, totalRows: records.length };
  }

  const seen = new Map<string, number>();
  records.forEach((r, i) => {
    const line = lineOf(i);
    const { symbol, reason } = normalizeImportSymbol(r[map.symbol!]);
    if (!symbol) return errors.push({ line, message: reason! });
    const qty = parseMoney(r[map.quantity!]);
    if (qty === null || qty <= 0) return errors.push({ line, message: `${symbol}: quantity must be a positive number` });
    const notes: string[] = [];
    let cost: number | null = map.costBasisTotal ? parseMoney(r[map.costBasisTotal]) : null;
    if (cost === null && map.avgCost) {
      const avg = parseMoney(r[map.avgCost]);
      if (avg !== null) {
        cost = Math.round(avg * qty * 10_000) / 10_000;
        notes.push("cost basis calculated as average cost × quantity");
      }
    }
    if (cost !== null && cost < 0) return errors.push({ line, message: `${symbol}: negative cost basis` });
    if (cost === null) notes.push("cost basis unknown");
    if (seen.has(symbol)) return errors.push({ line, message: `${symbol}: duplicate of line ${seen.get(symbol)} — combine lots before importing` });
    seen.set(symbol, line);
    const currency = (map.currency && r[map.currency]?.trim().toUpperCase()) || defaultCurrency;
    if (!/^[A-Z]{3}$/.test(currency)) return errors.push({ line, message: `${symbol}: invalid currency "${currency}"` });
    rows.push({
      line,
      notes,
      data: { symbol, quantity: qty, costBasisTotal: cost, currency, acquiredOn: map.acquiredOn ? parseDate(r[map.acquiredOn]) : null },
    });
  });
  return { kind: "positions", headerMap: map, rows, errors, totalRows: records.length };
}

export function parseTransactionsCsv(text: string, defaultCurrency = "USD"): ImportPreview<TransactionInput> {
  const { headers, records, parseErrors } = parseCsv(text);
  const map = mapHeaders(headers);
  const errors: ImportRowError[] = [...parseErrors];
  const rows: ImportRow<TransactionInput>[] = [];
  const offset = text.split(/\r?\n/).findIndex((l) => /symbol|ticker/i.test(l) && /,/.test(l));
  const lineOf = (i: number) => i + 2 + Math.max(0, offset);

  if (!map.date || !map.action) {
    errors.push({ line: 1, message: "Could not find required columns: Date and Action/Type." });
    return { kind: "transactions", headerMap: map, rows, errors, totalRows: records.length };
  }
  if (records.length > MAX_IMPORT_ROWS) {
    errors.push({ line: 1, message: `Too many rows (${records.length}); max ${MAX_IMPORT_ROWS}.` });
    return { kind: "transactions", headerMap: map, rows, errors, totalRows: records.length };
  }

  records.forEach((r, i) => {
    const line = lineOf(i);
    const notes: string[] = [];
    const tradeDate = parseDate(r[map.date!]);
    if (!tradeDate) return errors.push({ line, message: `invalid date "${r[map.date!] ?? ""}"` });
    const type = normalizeAction(r[map.action!]);
    if (!type) return errors.push({ line, message: `unrecognized action "${r[map.action!] ?? ""}"` });

    const needsSymbol = ["buy", "sell", "reinvest", "split", "transfer_in", "transfer_out"].includes(type);
    let symbol: string | null = null;
    if (map.symbol && String(r[map.symbol] ?? "").trim()) {
      const res = normalizeImportSymbol(r[map.symbol]);
      if (!res.symbol && needsSymbol) return errors.push({ line, message: res.reason! });
      symbol = res.symbol;
    } else if (needsSymbol) {
      return errors.push({ line, message: `${type} requires a symbol` });
    }

    const quantityRaw = map.quantity ? parseMoney(r[map.quantity]) : null;
    const quantity = quantityRaw === null ? null : Math.abs(quantityRaw);
    const price = map.price ? parseMoney(r[map.price]) : null;
    const fees = Math.abs((map.fees ? parseMoney(r[map.fees]) : null) ?? 0);
    let amount = map.amount ? parseMoney(r[map.amount]) : null;

    if ((type === "buy" || type === "sell" || type === "reinvest") && (quantity === null || quantity <= 0)) {
      return errors.push({ line, message: `${symbol}: ${type} requires a positive quantity` });
    }

    if (amount === null) {
      if ((type === "buy" || type === "reinvest") && quantity !== null && price !== null) {
        amount = -(quantity * price + fees);
        notes.push("amount calculated as −(quantity × price + fees)");
      } else if (type === "sell" && quantity !== null && price !== null) {
        amount = quantity * price - fees;
        notes.push("amount calculated as quantity × price − fees");
      } else if (type === "split" || type === "transfer_in" || type === "transfer_out") {
        amount = 0;
      } else {
        return errors.push({ line, message: `${type}: missing amount` });
      }
    }
    const sign = CASH_SIGN[type];
    if (sign && amount !== 0 && Math.sign(amount) !== sign) {
      amount = Math.abs(amount) * sign;
      notes.push("amount sign normalized to cash-impact convention");
    }

    let splitRatio: number | null = null;
    if (type === "split") {
      splitRatio = map.splitRatio ? parseMoney(r[map.splitRatio]) : null;
      if (splitRatio === null) return errors.push({ line, message: `${symbol}: split requires a split ratio column (new shares per old share)` });
    }

    rows.push({
      line,
      notes,
      data: {
        symbol,
        type,
        tradeDate,
        quantity,
        price,
        amount: Math.round(amount * 10_000) / 10_000,
        fees,
        currency: (map.currency && r[map.currency]?.trim().toUpperCase()) || defaultCurrency,
        splitRatio,
        description: map.description ? (r[map.description]?.trim() || null) : null,
        externalId: map.externalId ? (r[map.externalId]?.trim() || null) : null,
      },
    });
  });
  return { kind: "transactions", headerMap: map, rows, errors, totalRows: records.length };
}
