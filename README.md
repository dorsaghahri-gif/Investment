# Stock Intel — Personal AI Investment Research & Portfolio Intelligence

A single-user, AI-native investment research platform: data + personalization + change detection + explainable AI.
**Research and decision support only — it never places trades.**

- Plan & acceptance criteria: [`BUILD_PLAN.md`](BUILD_PLAN.md)
- Architecture: [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md)
- Scoring & recommendation methodology: [`docs/SCORING.md`](docs/SCORING.md)
- Data providers: [`docs/PROVIDERS.md`](docs/PROVIDERS.md)

## Stack

Next.js 16 (App Router) · React 19 · TypeScript · Tailwind v4 · shadcn/ui conventions · Supabase (Postgres + Auth + RLS) · Vercel (+ Cron) · Financial Modeling Prep (swappable) · Claude API (Phase 5).

## Setup

1. **Supabase project** (`stock-intel`, ref `xclfclqotmzmvcdftieg`) — schema fully applied.
   - Authentication → **Hooks** → *Before User Created* → Postgres function `public.hook_before_user_created`. This blocks sign-ups from anyone not on the access list.
   - Authentication → **URL Configuration**: Site URL = your production URL; add redirect URLs `https://<your-domain>/auth/callback` and `http://localhost:3000/auth/callback`.
   - **Email (required before inviting others):** Supabase's built-in email service only delivers to members of your Supabase organization and is heavily rate-limited, and its templates can't be edited. Set up custom SMTP (Authentication → Emails → SMTP Settings; e.g. Resend, Postmark, SES). Then edit the templates:
     *Magic Link* → `{{ .SiteURL }}/auth/callback?token_hash={{ .TokenHash }}&type=email`;
     *Invite user* → `{{ .SiteURL }}/auth/callback?token_hash={{ .TokenHash }}&type=invite`.
     With default templates, sign-in links still work but must be opened in the same browser that requested them, and the "send invite email" option in Settings → Access won't work (invitees just sign in from the login page instead).
   - Project Settings → API Keys: copy the **secret** key into `SUPABASE_SECRET_KEY` (never commit it).
2. **Schema** lives in `supabase/migrations/` (mirrors the live project's migration history). For a fresh project: `supabase link --project-ref <ref> && supabase db push`. Verify RLS with `psql "$DATABASE_URL" -f supabase/tests/rls.sql` (runs in a transaction and rolls back).
3. **Environment**: `cp .env.example .env.local`, then fill in the values (each one is explained in the file).
4. **Check your FMP plan** (one time): `FMP_API_KEY=... npm run fmp:smoke NVDA`. It confirms the field names and shows which endpoints your plan includes.
5. `npm install && npm run dev` → sign in with the owner email seeded in the access list.
6. **Deploy**: import the repo into Vercel and set the same env vars plus `CRON_SECRET`. `vercel.json` schedules the daily refresh for 22:30 UTC on weekdays.

## Scripts

| Command | What it does |
|---|---|
| `npm run dev` / `build` / `start` | Next.js |
| `npm run check` | typecheck + lint + unit tests |
| `npm test` | Vitest unit tests (mappers, HTTP layer, registry, CSV import, holdings derivation, valuation, jobs, crypto, auth) |
| `npm run db:test` | RLS & schema tests against `$DATABASE_URL` |
| `npm run fmp:smoke [SYMBOL]` | Live FMP schema check (prints no secrets) |

## Multiple users

Invite-only. Owners manage the list at **Settings → Access**; each person gets a private portfolio. Anyone can share their own portfolio read-only at **Settings → Sharing**. Enforcement is layered: the before-user-created auth hook blocks un-invited sign-ups, a restrictive RLS policy on every table cuts off revoked users immediately, and the app's DAL checks the role on every request. Data Health and job logs are owner-only.

> **Data licensing:** FMP's individual plans are for personal use and their terms prohibit letting other people access FMP data through your account or displaying it in apps used by multiple people. Get a data-display/commercial license from FMP (or use a provider whose license allows it) **before inviting others**.

## Ground rules enforced in code

- Provider adapters can be imported only by `src/lib/providers/registry.ts` (an ESLint rule enforces this). The UI reads normalized Postgres rows.
- Missing data stays `null` end to end and renders as "—" / "Data unavailable". It is never shown as 0.
- Every value carries provenance (`reported`, `provider_derived`, `calculated`, `estimate`, `ai_interpretation`, `scenario_assumption`), plus its source and timestamp.
- Secrets live only in the server env. Modules that read them are guarded with `server-only`.
- The brokerage connector interface is read-only. A compile-time check fails if anyone adds an order or trade method.
