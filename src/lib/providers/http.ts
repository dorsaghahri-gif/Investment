/**
 * Shared HTTP layer for provider adapters:
 *   • timeout per request
 *   • retry with exponential backoff + jitter on 429 / 5xx / network errors
 *   • client-side rate limiting (min interval + concurrency cap)
 *   • request logging with credentials redacted
 */
import type { ProviderId } from "@/lib/domain/provenance";
import { ProviderError, type ProviderErrorClass } from "./errors";
import type { ProviderCategory, ProviderRequestLogger } from "./interfaces";

export interface HttpClientOptions {
  provider: ProviderId;
  baseUrl: string;
  /** Query parameters added to every request (e.g. apikey). Values are redacted in logs. */
  secretParams?: Record<string, string>;
  headers?: Record<string, string>;
  rateLimitPerMinute?: number;
  maxConcurrency?: number;
  timeoutMs?: number;
  maxRetries?: number;
  logger?: ProviderRequestLogger;
  fetchImpl?: typeof fetch;
  sleep?: (ms: number) => Promise<void>;
  /**
   * Inspect a parsed body for provider-specific errors returned with HTTP 200
   * or to refine classification of non-2xx responses.
   */
  classifyBody?: (status: number, body: unknown) => { errorClass: ProviderErrorClass; message: string } | null;
}

export interface RequestOptions {
  category: ProviderCategory;
  symbol?: string | null;
  /** Called with parsed body to report schema drift (missing expected fields). */
  schemaCheck?: (body: unknown) => string[];
}

const defaultSleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/** Simple in-process limiter: spaces request starts and caps concurrency. */
class Limiter {
  private active = 0;
  private nextStart = 0;
  private queue: (() => void)[] = [];
  constructor(
    private readonly minIntervalMs: number,
    private readonly maxConcurrency: number,
    private readonly sleep: (ms: number) => Promise<void>,
  ) {}

  async run<T>(fn: () => Promise<T>): Promise<T> {
    if (this.active >= this.maxConcurrency) {
      await new Promise<void>((resolve) => this.queue.push(resolve));
    }
    this.active++;
    try {
      const now = Date.now();
      const wait = Math.max(0, this.nextStart - now);
      this.nextStart = Math.max(now, this.nextStart) + this.minIntervalMs;
      if (wait > 0) await this.sleep(wait);
      return await fn();
    } finally {
      this.active--;
      this.queue.shift()?.();
    }
  }
}

export function redactUrl(url: string, secretKeys: string[]): string {
  try {
    const u = new URL(url);
    for (const k of secretKeys) if (u.searchParams.has(k)) u.searchParams.set(k, "REDACTED");
    return u.pathname + (u.search ? u.search : "");
  } catch {
    return "[unparseable-url]";
  }
}

function classifyStatus(status: number): ProviderErrorClass {
  if (status === 401 || status === 403) return "auth";
  if (status === 402) return "plan_restricted";
  if (status === 404) return "not_found";
  if (status === 429) return "rate_limited";
  if (status >= 500) return "unavailable";
  return "unknown";
}

export class HttpClient {
  private readonly limiter: Limiter;
  private readonly fetchImpl: typeof fetch;
  private readonly sleep: (ms: number) => Promise<void>;
  private readonly secretKeys: string[];

  constructor(private readonly opts: HttpClientOptions) {
    const perMin = Math.max(1, opts.rateLimitPerMinute ?? 300);
    this.sleep = opts.sleep ?? defaultSleep;
    this.limiter = new Limiter(Math.ceil(60_000 / perMin), opts.maxConcurrency ?? 8, this.sleep);
    this.fetchImpl = opts.fetchImpl ?? fetch;
    this.secretKeys = Object.keys(opts.secretParams ?? {});
  }

  async getJson(path: string, params: Record<string, string | number | undefined>, req: RequestOptions): Promise<unknown> {
    const url = new URL(path.replace(/^\//, ""), this.opts.baseUrl.endsWith("/") ? this.opts.baseUrl : this.opts.baseUrl + "/");
    for (const [k, v] of Object.entries(params)) if (v !== undefined) url.searchParams.set(k, String(v));
    for (const [k, v] of Object.entries(this.opts.secretParams ?? {})) url.searchParams.set(k, v);
    const loggedEndpoint = redactUrl(url.toString(), this.secretKeys);

    const maxRetries = this.opts.maxRetries ?? 3;
    let attempt = 0;
    for (;;) {
      const started = Date.now();
      let status: number | null = null;
      try {
        const body = await this.limiter.run(async () => {
          const controller = new AbortController();
          const timer = setTimeout(() => controller.abort(), this.opts.timeoutMs ?? 10_000);
          try {
            const res = await this.fetchImpl(url.toString(), {
              headers: { Accept: "application/json", ...(this.opts.headers ?? {}) },
              signal: controller.signal,
              cache: "no-store",
            });
            status = res.status;
            const text = await res.text();
            let parsed: unknown = null;
            try {
              parsed = text ? JSON.parse(text) : null;
            } catch {
              if (res.ok) throw new ProviderError(this.opts.provider, "schema", `Non-JSON response from ${loggedEndpoint}`);
            }
            const bodyErr = this.opts.classifyBody?.(res.status, parsed);
            if (bodyErr) {
              throw new ProviderError(this.opts.provider, bodyErr.errorClass, bodyErr.message, {
                status: res.status,
                retryable: bodyErr.errorClass === "rate_limited" || bodyErr.errorClass === "unavailable",
                tryNextProvider: true,
              });
            }
            if (!res.ok) {
              const cls = classifyStatus(res.status);
              throw new ProviderError(this.opts.provider, cls, `HTTP ${res.status} from ${loggedEndpoint}`, {
                status: res.status,
                retryable: cls === "rate_limited" || cls === "unavailable",
              });
            }
            return parsed;
          } finally {
            clearTimeout(timer);
          }
        });

        const warnings = req.schemaCheck?.(body) ?? [];
        this.opts.logger?.({
          provider: this.opts.provider,
          category: req.category,
          endpoint: loggedEndpoint,
          symbol: req.symbol ?? null,
          httpStatus: status,
          ok: true,
          durationMs: Date.now() - started,
          schemaWarnings: warnings.length ? warnings : undefined,
        });
        return body;
      } catch (e) {
        const err =
          e instanceof ProviderError
            ? e
            : new ProviderError(
                this.opts.provider,
                "unavailable",
                (e as Error)?.name === "AbortError" ? `Timeout calling ${loggedEndpoint}` : `Network error calling ${loggedEndpoint}`,
                { retryable: true, cause: e },
              );
        this.opts.logger?.({
          provider: this.opts.provider,
          category: req.category,
          endpoint: loggedEndpoint,
          symbol: req.symbol ?? null,
          httpStatus: status,
          ok: false,
          errorClass: err.errorClass,
          errorMessage: err.message.slice(0, 500),
          durationMs: Date.now() - started,
        });
        if (err.retryable && attempt < maxRetries) {
          attempt++;
          const backoff = Math.min(8_000, 500 * 2 ** (attempt - 1)) * (0.75 + Math.random() * 0.5);
          await this.sleep(backoff);
          continue;
        }
        throw err;
      }
    }
  }
}
