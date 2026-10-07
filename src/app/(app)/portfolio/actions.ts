"use server";

import { after } from "next/server";
import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth/dal";
import { checkRateLimit } from "@/lib/security/rate-limit";
import { addHoldingSchema, createAccountSchema, importSchema, updateCashSchema } from "@/lib/portfolio/schemas";
import { createAccount, deleteHolding, importCsv, updateCash, upsertHolding, UserFacingError, type ImportResult } from "@/lib/portfolio/service";
import { detectKind, MAX_IMPORT_BYTES, parsePositionsCsv, parseTransactionsCsv } from "@/lib/portfolio/csv-import";
import { runRefreshPrices } from "@/lib/jobs";
import { z } from "zod";

export interface ActionState {
  ok: boolean;
  message?: string;
  fieldErrors?: Record<string, string[] | undefined>;
}

const fail = (e: unknown): ActionState => {
  if (e instanceof UserFacingError) return { ok: false, message: e.message };
  console.error("[portfolio action]", e);
  return { ok: false, message: "Something went wrong. Nothing was saved." };
};

/** Fetch quote/history/profile for newly added symbols right after the response. */
async function scheduleSymbolRefresh(userId: string, symbols: string[]) {
  if (!symbols.length) return;
  if (!(await checkRateLimit("refresh:symbols", 600, 10))) return;
  after(async () => {
    try {
      await runRefreshPrices({ trigger: "manual", triggeredBy: userId, symbols });
    } catch (e) {
      console.error("[portfolio] background refresh failed", e);
    }
  });
}

export async function createAccountAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requireUser();
  const parsed = createAccountSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { ok: false, fieldErrors: z.flattenError(parsed.error).fieldErrors, message: "Check the highlighted fields." };
  try {
    await createAccount(user, parsed.data);
  } catch (e) {
    return fail(e);
  }
  revalidatePath("/portfolio");
  return { ok: true, message: "Account created." };
}

export async function updateCashAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  await requireUser();
  const parsed = updateCashSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0]?.message ?? "Invalid input" };
  try {
    await updateCash(parsed.data.accountId, parsed.data.cashBalance);
  } catch (e) {
    return fail(e);
  }
  revalidatePath("/portfolio");
  return { ok: true, message: "Cash updated." };
}

export async function addHoldingAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requireUser();
  const parsed = addHoldingSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { ok: false, fieldErrors: z.flattenError(parsed.error).fieldErrors, message: "Check the highlighted fields." };
  try {
    await upsertHolding(user, parsed.data);
  } catch (e) {
    return fail(e);
  }
  await scheduleSymbolRefresh(user.id, [parsed.data.symbol]);
  revalidatePath("/portfolio");
  return { ok: true, message: `${parsed.data.symbol} saved. Price data will load shortly.` };
}

export async function deleteHoldingAction(formData: FormData): Promise<void> {
  await requireUser();
  const id = z.uuid().safeParse(formData.get("holdingId"));
  if (!id.success) return;
  await deleteHolding(id.data);
  revalidatePath("/portfolio");
}

// ── CSV import: preview (no writes) → commit (re-parsed server-side) ──

export interface PreviewState {
  ok: boolean;
  message?: string;
  kind?: "positions" | "transactions";
  totalRows?: number;
  accepted?: { line: number; summary: string; notes: string[] }[];
  acceptedCount?: number;
  errors?: { line: number; message: string }[];
  result?: ImportResult;
}

async function readUpload(formData: FormData): Promise<{ text: string; name: string | null } | string> {
  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) return "Choose a CSV file.";
  if (file.size > MAX_IMPORT_BYTES) return `File is too large (max ${MAX_IMPORT_BYTES / 1024 / 1024} MB).`;
  if (!/\.(csv|txt)$/i.test(file.name) && !/csv|text\/plain/.test(file.type)) return "Only .csv files are supported.";
  return { text: await file.text(), name: file.name.slice(0, 200) };
}

export async function previewImportAction(_prev: PreviewState, formData: FormData): Promise<PreviewState> {
  await requireUser();
  const opts = importSchema.safeParse({ accountId: formData.get("accountId"), kind: formData.get("kind"), mode: formData.get("mode") ?? "replace" });
  if (!opts.success) return { ok: false, message: "Choose an account." };
  const upload = await readUpload(formData);
  if (typeof upload === "string") return { ok: false, message: upload };

  const header = upload.text.split(/\r?\n/).find((l) => /symbol|ticker|date/i.test(l)) ?? "";
  const kind = opts.data.kind === "auto" ? detectKind(header.split(",").map((h) => h.replace(/^"|"$/g, ""))) : opts.data.kind;
  if (kind === "positions") {
    const p = parsePositionsCsv(upload.text);
    return {
      ok: true,
      kind,
      totalRows: p.totalRows,
      acceptedCount: p.rows.length,
      accepted: p.rows.slice(0, 200).map((r) => ({
        line: r.line,
        summary: `${r.data.symbol} · ${r.data.quantity} sh · cost ${r.data.costBasisTotal ?? "unknown"}`,
        notes: r.notes,
      })),
      errors: p.errors.slice(0, 200),
    };
  }
  const t = parseTransactionsCsv(upload.text);
  return {
    ok: true,
    kind,
    totalRows: t.totalRows,
    acceptedCount: t.rows.length,
    accepted: t.rows.slice(0, 200).map((r) => ({
      line: r.line,
      summary: `${r.data.tradeDate} · ${r.data.type.toUpperCase()} ${r.data.symbol ?? ""} ${r.data.quantity ?? ""} · ${r.data.amount}`,
      notes: r.notes,
    })),
    errors: t.errors.slice(0, 200),
  };
}

export async function commitImportAction(_prev: PreviewState, formData: FormData): Promise<PreviewState> {
  const user = await requireUser();
  if (!(await checkRateLimit("import:commit", 600, 20))) return { ok: false, message: "Too many imports. Try again in a few minutes." };
  const opts = importSchema.safeParse({ accountId: formData.get("accountId"), kind: formData.get("kind"), mode: formData.get("mode") ?? "replace" });
  if (!opts.success) return { ok: false, message: "Choose an account." };
  const upload = await readUpload(formData);
  if (typeof upload === "string") return { ok: false, message: upload };
  try {
    const result = await importCsv(user, { accountId: opts.data.accountId, text: upload.text, filename: upload.name, kind: opts.data.kind, mode: opts.data.mode });
    await scheduleSymbolRefresh(user.id, result.symbols.slice(0, 200));
    revalidatePath("/portfolio");
    return {
      ok: true,
      result,
      message: `Imported ${result.accepted} row(s); ${result.rejected} rejected.${result.holdingsRecomputed ? " Holdings recomputed from transactions." : ""}`,
    };
  } catch (e) {
    return fail(e);
  }
}
