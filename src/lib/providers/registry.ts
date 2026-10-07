/**
 * Provider registry — the single place that knows which concrete provider
 * serves each data category. Configured via PROVIDER_<CATEGORY> env vars
 * (comma-separated = fallback chain). Only jobs and server actions use it.
 */
import "server-only";
import { serverEnv } from "@/lib/env";
import type { ProviderId } from "@/lib/domain/provenance";
import { ProviderError, isProviderError } from "./errors";
import { createFmpProvider } from "./fmp";
import { createMockProvider } from "./mock";
import {
  PROVIDER_CATEGORIES,
  type ProviderBundle,
  type ProviderCategory,
  type ProviderCategoryMap,
  type ProviderRequestLogger,
} from "./interfaces";

/** Providers that have an implementation today. Add new ids here when implemented. */
export const IMPLEMENTED_PROVIDERS = ["fmp", "mock"] as const satisfies readonly ProviderId[];
type ImplementedProvider = (typeof IMPLEMENTED_PROVIDERS)[number];

const ENV_KEY: Record<ProviderCategory, string> = {
  market_data: "PROVIDER_MARKET_DATA",
  fundamentals: "PROVIDER_FUNDAMENTALS",
  estimates: "PROVIDER_ESTIMATES",
  company_info: "PROVIDER_COMPANY_INFO",
  events: "PROVIDER_EVENTS",
  news: "PROVIDER_NEWS",
  insider: "PROVIDER_INSIDER",
};

export interface RegistryConfig {
  chains: Record<ProviderCategory, ProviderId[]>;
  credentials: { fmpApiKey?: string };
  allowMock: boolean;
}

/** Pure: parse a chain string, rejecting unknown ids. */
export function parseChain(value: string | undefined, fallback: ProviderId[] = ["fmp"]): ProviderId[] {
  const ids = (value ?? "")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
  if (!ids.length) return fallback;
  for (const id of ids) {
    if (!(IMPLEMENTED_PROVIDERS as readonly string[]).includes(id)) {
      throw new Error(`Unknown or unimplemented data provider "${id}". Implemented: ${IMPLEMENTED_PROVIDERS.join(", ")}`);
    }
  }
  return ids as ProviderId[];
}

/**
 * Pure: decide the effective chain per category given credentials.
 * Providers lacking credentials are dropped; mock is appended only if allowed.
 */
export function resolveChains(cfg: RegistryConfig): Record<ProviderCategory, ProviderId[]> {
  const out = {} as Record<ProviderCategory, ProviderId[]>;
  for (const cat of PROVIDER_CATEGORIES) {
    let chain = cfg.chains[cat].filter((id) => {
      if (id === "fmp") return !!cfg.credentials.fmpApiKey;
      if (id === "mock") return cfg.allowMock;
      return true;
    });
    if (chain.length === 0 && cfg.allowMock) chain = ["mock"];
    out[cat] = chain;
  }
  return out;
}

export function configFromEnv(): RegistryConfig {
  const env = serverEnv();
  const chains = {} as Record<ProviderCategory, ProviderId[]>;
  for (const cat of PROVIDER_CATEGORIES) {
    chains[cat] = parseChain((env as unknown as Record<string, string | undefined>)[ENV_KEY[cat]]);
  }
  return { chains, credentials: { fmpApiKey: env.FMP_API_KEY }, allowMock: env.ALLOW_MOCK_DATA };
}

function buildBundle(id: ImplementedProvider, logger?: ProviderRequestLogger): ProviderBundle {
  const env = serverEnv();
  switch (id) {
    case "fmp":
      return createFmpProvider({ apiKey: env.FMP_API_KEY ?? "", rateLimitPerMinute: env.FMP_RATE_LIMIT_PER_MIN, logger });
    case "mock":
      return createMockProvider();
  }
}

/**
 * Wrap a chain of implementations so each method call tries providers in order,
 * moving on only for errors flagged `tryNextProvider`. The provenance on the
 * returned data identifies which provider actually answered.
 */
export function withFallback<C extends ProviderCategory>(
  category: C,
  impls: ProviderCategoryMap[C][],
): ProviderCategoryMap[C] {
  if (impls.length === 0) {
    return new Proxy({} as ProviderCategoryMap[C], {
      get(_t, prop) {
        if (prop === "id") return "none";
        return async () => {
          throw new ProviderError("manual", "not_supported", `No provider configured for category "${category}"`, {
            tryNextProvider: false,
          });
        };
      },
    });
  }
  if (impls.length === 1) return impls[0];
  return new Proxy(impls[0], {
    get(target, prop, receiver) {
      const first = Reflect.get(target, prop, receiver);
      if (typeof first !== "function") return first;
      return async (...args: unknown[]) => {
        let lastErr: unknown;
        for (const impl of impls) {
          const fn = (impl as unknown as Record<string | symbol, unknown>)[prop];
          if (typeof fn !== "function") continue;
          try {
            return await (fn as (...a: unknown[]) => Promise<unknown>).apply(impl, args);
          } catch (e) {
            lastErr = e;
            if (isProviderError(e) && !e.tryNextProvider) throw e;
          }
        }
        throw lastErr;
      };
    },
  });
}

export interface Providers extends ProviderCategoryMap {
  chains: Record<ProviderCategory, ProviderId[]>;
  usingMock: boolean;
}

export function getProviders(opts: { logger?: ProviderRequestLogger; config?: RegistryConfig } = {}): Providers {
  const cfg = opts.config ?? configFromEnv();
  const chains = resolveChains(cfg);
  const bundles = new Map<ProviderId, ProviderBundle>();
  const bundle = (id: ProviderId) => {
    if (!bundles.has(id)) bundles.set(id, buildBundle(id as ImplementedProvider, opts.logger));
    return bundles.get(id)!;
  };
  const pick = <C extends ProviderCategory>(cat: C) =>
    withFallback(
      cat,
      chains[cat].map((id) => bundle(id)[cat]).filter((x): x is NonNullable<typeof x> => !!x) as ProviderCategoryMap[C][],
    );

  return {
    market_data: pick("market_data"),
    fundamentals: pick("fundamentals"),
    estimates: pick("estimates"),
    company_info: pick("company_info"),
    events: pick("events"),
    news: pick("news"),
    insider: pick("insider"),
    chains,
    usingMock: Object.values(chains).some((c) => c.includes("mock")),
  };
}
