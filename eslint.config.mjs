import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    // ARCHITECTURE RULE: no code may depend on a concrete data provider except
    // the registry. UI, scoring, calc and AI read normalized data only.
    files: ["src/**/*.{ts,tsx}"],
    ignores: ["src/lib/providers/registry.ts", "src/lib/providers/**/*.test.ts", "src/lib/jobs/*.test.ts"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: ["@/lib/providers/fmp", "@/lib/providers/fmp/*", "@/lib/providers/mock", "@/lib/providers/mock/*", "**/providers/fmp", "**/providers/fmp/*", "**/providers/mock", "**/providers/mock/*"],
              message: "Concrete providers may only be imported by src/lib/providers/registry.ts. Use getProviders() or read normalized rows from Postgres.",
            },
          ],
        },
      ],
    },
  },
  {
    // Provider adapters may use their own internal modules.
    files: ["src/lib/providers/fmp/**", "src/lib/providers/mock/**"],
    rules: { "no-restricted-imports": "off" },
  },
  {
    files: ["src/components/**/*.{ts,tsx}", "src/app/**/*.tsx"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            { group: ["@/lib/providers/*"], message: "UI must not call data providers. Read normalized data via the DAL/repositories." },
            { group: ["@/lib/supabase/admin"], message: "The service-role client is for jobs only." },
          ],
        },
      ],
    },
  },
  {
    rules: { "@typescript-eslint/no-unused-vars": ["warn", { argsIgnorePattern: "^_", varsIgnorePattern: "^_" }] },
  },
  globalIgnores([".next/**", "out/**", "build/**", "next-env.d.ts"]),
]);

export default eslintConfig;
