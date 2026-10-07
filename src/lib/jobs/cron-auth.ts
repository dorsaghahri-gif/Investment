import "server-only";
import { timingSafeEqual } from "node:crypto";

/** Vercel Cron sends `Authorization: Bearer <CRON_SECRET>`. Constant-time compare; fail closed. */
export function isAuthorizedCron(authHeader: string | null, secret = process.env.CRON_SECRET): boolean {
  if (!secret || secret.length < 16 || !authHeader) return false;
  const expected = Buffer.from(`Bearer ${secret}`);
  const got = Buffer.from(authHeader);
  return got.length === expected.length && timingSafeEqual(got, expected);
}
