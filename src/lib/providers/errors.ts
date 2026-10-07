import type { ProviderId } from "@/lib/domain/provenance";

export type ProviderErrorClass =
  | "auth"
  | "plan_restricted"
  | "rate_limited"
  | "not_found"
  | "unavailable"
  | "schema"
  | "not_supported"
  | "unknown";

export class ProviderError extends Error {
  readonly errorClass: ProviderErrorClass;
  /** Whether trying the same provider again later may succeed. */
  readonly retryable: boolean;
  /** Whether the registry should try the next provider in the chain. */
  readonly tryNextProvider: boolean;
  readonly status?: number;

  constructor(
    readonly provider: ProviderId,
    errorClass: ProviderErrorClass,
    message: string,
    opts: { retryable?: boolean; tryNextProvider?: boolean; status?: number; cause?: unknown } = {},
  ) {
    super(`[${provider}] ${message}`, { cause: opts.cause });
    this.name = "ProviderError";
    this.errorClass = errorClass;
    this.retryable = opts.retryable ?? false;
    this.tryNextProvider = opts.tryNextProvider ?? true;
    this.status = opts.status;
  }
}

export const isProviderError = (e: unknown): e is ProviderError => e instanceof ProviderError;

export function errorClassOf(e: unknown): ProviderErrorClass {
  return isProviderError(e) ? e.errorClass : "unknown";
}
