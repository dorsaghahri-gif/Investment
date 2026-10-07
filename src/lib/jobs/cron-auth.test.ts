import { describe, expect, it } from "vitest";
import { isAuthorizedCron } from "./cron-auth";

const S = "0123456789abcdef0123";
describe("cron auth", () => {
  it("accepts only the exact bearer secret", () => {
    expect(isAuthorizedCron(`Bearer ${S}`, S)).toBe(true);
    expect(isAuthorizedCron(`Bearer ${S}x`, S)).toBe(false);
    expect(isAuthorizedCron(null, S)).toBe(false);
  });
  it("fails closed without a (strong) secret", () => {
    expect(isAuthorizedCron("Bearer ", undefined)).toBe(false);
    expect(isAuthorizedCron("Bearer short", "short")).toBe(false);
  });
});
