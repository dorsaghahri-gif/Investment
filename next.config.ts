import type { NextConfig } from "next";

/**
 * Cache Components is intentionally OFF.
 *
 * Every page in this app is behind authentication and renders per-request
 * financial data whose freshness must be explicit (timestamps + sources are
 * shown on screen). Caching is done deliberately at the data layer (Postgres
 * snapshots written by scheduled jobs), not implicitly at the render layer.
 * See docs/ARCHITECTURE.md §"Rendering & caching".
 */
const securityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
];

const nextConfig: NextConfig = {
  cacheComponents: false,
  poweredByHeader: false,
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

export default nextConfig;
