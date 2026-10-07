/**
 * Server-side environment, validated once at first use.
 * `server-only` makes any accidental client import a build error,
 * so provider secrets can never be bundled into browser code.
 */
import "server-only";
import { z } from "zod";

const boolish = z
  .string()
  .optional()
  .transform((v) => v === "true" || v === "1");

const serverSchema = z.object({
  NEXT_PUBLIC_SUPABASE_URL: z.url(),
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: z.string().min(1),
  SUPABASE_SECRET_KEY: z.string().min(1).optional(),
  NEXT_PUBLIC_SITE_URL: z.url().optional(),
  CRON_SECRET: z.string().min(16).optional(),

  FMP_API_KEY: z.string().optional(),
  FMP_RATE_LIMIT_PER_MIN: z.coerce.number().int().positive().default(300),
  PROVIDER_MARKET_DATA: z.string().default("fmp"),
  PROVIDER_FUNDAMENTALS: z.string().default("fmp"),
  PROVIDER_ESTIMATES: z.string().default("fmp"),
  PROVIDER_COMPANY_INFO: z.string().default("fmp"),
  PROVIDER_EVENTS: z.string().default("fmp"),
  PROVIDER_NEWS: z.string().default("fmp"),
  PROVIDER_INSIDER: z.string().default("fmp"),
  ALLOW_MOCK_DATA: boolish,

  SEC_EDGAR_USER_AGENT: z.string().optional(),
  POLYGON_API_KEY: z.string().optional(),
  ANTHROPIC_API_KEY: z.string().optional(),
  ANTHROPIC_MODEL: z.string().optional(),
  PLAID_CLIENT_ID: z.string().optional(),
  PLAID_SECRET: z.string().optional(),
  PLAID_ENV: z.enum(["sandbox", "production"]).default("sandbox"),
  CREDENTIALS_ENCRYPTION_KEY: z.string().optional(),
});

export type ServerEnv = z.infer<typeof serverSchema>;

let cached: ServerEnv | null = null;

export function serverEnv(): ServerEnv {
  if (cached) return cached;
  const parsed = serverSchema.safeParse(process.env);
  if (!parsed.success) {
    // Report variable NAMES only — never values.
    const names = parsed.error.issues.map((i) => i.path.join(".")).join(", ");
    throw new Error(`Invalid or missing environment variables: ${names}. See .env.example.`);
  }
  if (process.env.NODE_ENV === "production" && parsed.data.ALLOW_MOCK_DATA) {
    console.warn("[env] ALLOW_MOCK_DATA is enabled in production — mock data banner will be shown.");
  }
  cached = parsed.data;
  return cached;
}

/** Test helper. */
export function __resetEnvCache() {
  cached = null;
}
