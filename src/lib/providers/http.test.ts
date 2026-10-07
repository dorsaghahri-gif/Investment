import { describe, expect, it } from "vitest";
import { HttpClient, redactUrl } from "./http";
import type { ProviderRequestLog } from "./interfaces";
import { ProviderError } from "./errors";

const noSleep = async () => {};

function fakeFetch(responses: Array<{ status: number; body: unknown }>) {
  const calls: string[] = [];
  const impl = (async (url: string) => {
    calls.push(String(url));
    const r = responses.shift() ?? { status: 500, body: {} };
    return new Response(JSON.stringify(r.body), { status: r.status });
  }) as unknown as typeof fetch;
  return { impl, calls };
}

describe("HttpClient", () => {
  it("retries 429/5xx then succeeds, logging each attempt with the key redacted", async () => {
    const logs: ProviderRequestLog[] = [];
    const { impl, calls } = fakeFetch([
      { status: 429, body: {} },
      { status: 503, body: {} },
      { status: 200, body: [{ ok: 1 }] },
    ]);
    const c = new HttpClient({ provider: "fmp", baseUrl: "https://example.test/stable/", secretParams: { apikey: "SECRET123" }, fetchImpl: impl, sleep: noSleep, logger: (l) => logs.push(l), rateLimitPerMinute: 60_000 });
    const body = await c.getJson("quote", { symbol: "A" }, { category: "market_data" });
    expect(body).toEqual([{ ok: 1 }]);
    expect(calls).toHaveLength(3);
    expect(calls[0]).toContain("apikey=SECRET123");
    expect(logs.map((l) => l.ok)).toEqual([false, false, true]);
    for (const l of logs) expect(JSON.stringify(l)).not.toContain("SECRET123");
  });

  it("does not retry auth errors", async () => {
    const { impl, calls } = fakeFetch([{ status: 401, body: {} }]);
    const c = new HttpClient({ provider: "fmp", baseUrl: "https://example.test/", fetchImpl: impl, sleep: noSleep, rateLimitPerMinute: 60_000 });
    await expect(c.getJson("x", {}, { category: "news" })).rejects.toMatchObject({ errorClass: "auth" });
    expect(calls).toHaveLength(1);
  });

  it("uses classifyBody for 200-with-error payloads", async () => {
    const { impl } = fakeFetch([{ status: 200, body: { "Error Message": "premium" } }]);
    const c = new HttpClient({
      provider: "fmp",
      baseUrl: "https://example.test/",
      fetchImpl: impl,
      sleep: noSleep,
      rateLimitPerMinute: 60_000,
      classifyBody: (_s, b) => (b && typeof b === "object" && "Error Message" in b ? { errorClass: "plan_restricted", message: "restricted" } : null),
    });
    const err = (await c.getJson("x", {}, { category: "insider" }).catch((e) => e)) as ProviderError;
    expect(err).toBeInstanceOf(ProviderError);
    expect(err.errorClass).toBe("plan_restricted");
  });

  it("redacts secrets from urls", () => {
    expect(redactUrl("https://h/stable/quote?symbol=A&apikey=abc", ["apikey"])).toBe("/stable/quote?symbol=A&apikey=REDACTED");
  });
});
