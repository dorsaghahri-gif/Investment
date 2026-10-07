import { z } from "zod";
import { ACCOUNT_TYPES } from "./types";

const money = z.coerce.number().finite();
const optionalMoney = z
  .union([z.literal(""), z.null(), z.undefined(), z.coerce.number().finite()])
  .transform((v) => (v === "" || v === null || v === undefined ? null : v));

export const symbolSchema = z
  .string()
  .trim()
  .toUpperCase()
  .regex(/^[A-Z0-9][A-Z0-9.\-]{0,14}$/, "Enter a valid ticker symbol");

export const createAccountSchema = z.object({
  name: z.string().trim().min(1).max(80),
  institution: z.string().trim().max(80).optional().transform((v) => v || null),
  accountType: z.enum(ACCOUNT_TYPES),
  trackingMode: z.enum(["positions", "transactions"]),
  cashBalance: optionalMoney.refine((v) => v === null || v >= 0, "Cash cannot be negative"),
});

export const updateCashSchema = z.object({
  accountId: z.uuid(),
  cashBalance: money.refine((v) => v >= 0, "Cash cannot be negative"),
});

export const addHoldingSchema = z.object({
  accountId: z.uuid(),
  symbol: symbolSchema,
  quantity: z.coerce.number().finite().positive("Quantity must be positive"),
  costBasisTotal: optionalMoney.refine((v) => v === null || v >= 0, "Cost basis cannot be negative"),
  acquiredOn: z
    .string()
    .optional()
    .transform((v) => (v ? v : null))
    .refine((v) => v === null || /^\d{4}-\d{2}-\d{2}$/.test(v), "Use YYYY-MM-DD"),
});

export const importSchema = z.object({
  accountId: z.uuid(),
  kind: z.enum(["auto", "positions", "transactions"]),
  mode: z.enum(["replace", "merge"]).default("replace"),
});
