# Deploying BK Sales Dashboard

Production target: **Vercel** + **Supabase Postgres** (Neon works too). This
guide covers env vars, database migrations, auth setup, storage, and the deploy.

---

## 1. Database (Supabase or Neon)

The Prisma datasource is already PostgreSQL for every environment. You need two
connection strings (see `.env.example` for exact formats):

- **`DATABASE_URL`** — runtime, via the **Transaction pooler** (port `6543`,
  `?pgbouncer=true`).
- **`DIRECT_URL`** — migrations, via the **Session pooler** / direct connection
  (port `5432`).

**Neon:** create a project, use the pooled connection string for `DATABASE_URL`
(add `?pgbouncer=true&connection_limit=1`) and the direct string for `DIRECT_URL`.

### Apply migrations

From a machine that can reach the database:

```bash
npm install
npx prisma migrate deploy   # applies every migration in prisma/migrations/ in order
```

If you prefer the Supabase SQL editor, run each `prisma/migrations/*/migration.sql`
in timestamp order. The full list:

```
20260708090459_init
20260708233011_add_import_history
20260709004909_widen_revenue_summary_precision
20260709090000_add_market_supply
20260709100000_add_sales_strategy_section
20260710090000_add_narrative_versions
20260710100000_add_export_history
20260711090000_add_auth_and_audit
```

### Seed & first admin

```bash
npm run db:seed                                   # properties + demo period(s)
ADMIN_EMAIL=you@bluekarma.com ADMIN_PASSWORD='strong-pass' npm run db:create-admin
```

---

## 2. Environment variables

Set these in **Vercel → Project → Settings → Environment Variables** (and locally
in `.env`). See `.env.example` for the annotated list.

| Variable | Required | Purpose |
|---|---|---|
| `DATABASE_URL` | ✅ | Runtime DB (transaction pooler) |
| `DIRECT_URL` | ✅ | Migrations (session/direct) |
| `AUTH_SECRET` | ✅ (prod) | Enables auth + route protection. `openssl rand -base64 32` |
| `AUTH_URL` | ✅ (prod) | Deployed origin, e.g. `https://app.vercel.app` |
| `ANTHROPIC_API_KEY` | for AI | Server-side Claude key (never exposed to client) |
| `ANTHROPIC_MODEL` | optional | Defaults to `claude-sonnet-4-6` |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | optional | Google SSO |
| `SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY` / `SUPABASE_STORAGE_BUCKET` | optional | Uploaded-image storage |

> **Auth rollout switch:** protection and role enforcement turn on **only when
> `AUTH_SECRET` is set**. Without it the app stays open and every action runs as a
> synthetic admin — handy for preview, but set `AUTH_SECRET` before going live.

---

## 3. Auth

- **Email/password:** users are created by an admin in **Admin → Users** (or via
  `npm run db:create-admin` for the first one). Passwords are bcrypt-hashed.
- **Google SSO:** create an OAuth client in Google Cloud Console → Credentials.
  Authorized redirect URI: `https://<your-domain>/api/auth/callback/google`. Put
  the client id/secret in the env vars. New Google users default to **VIEWER**;
  an admin can promote them.

### Roles

| Role | Access |
|---|---|
| **ADMIN** | Everything: mark FINAL, manage users, all properties |
| **EDITOR** | Import data + edit narratives/plans for **assigned properties** only |
| **VIEWER** | Read-only + report export (for Directors / management) |

---

## 4. Image storage (optional)

Uploaded images use Supabase Storage via `lib/storage.ts` (REST, no SDK). Create
a **public** bucket (default name `uploads`) in Supabase → Storage, then set
`SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_STORAGE_BUCKET`. When
unset, image upload is disabled gracefully.

---

## 5. Deploy to Vercel

1. Import the GitHub repo into Vercel (framework auto-detected: Next.js).
2. `vercel.json` sets the build command (`prisma generate && next build`) and
   raises `maxDuration` for the export routes.
3. Add all env vars (above) for **Production** (and Preview if desired).
4. Deploy. First deploy runs `postinstall` → `prisma generate`.

### PDF export caveat on Vercel

`/api/export/pdf` launches headless Chromium via Playwright. Vercel's serverless
runtime **cannot launch the bundled Chromium** — options:

- Run the app on a **Node host** (Render, Fly, a VM) where `npx playwright install
  chromium` works; or
- Swap to `@sparticuz/chromium` + `playwright-core` and set
  `PLAYWRIGHT_CHROMIUM_PATH` (small code change in `app/api/export/pdf/route.ts`).

**PPTX and the Group zip work on Vercel unchanged** — they need no browser.

---

## 6. Rate limiting

API routes (`/api/narrative`, `/api/export/*`) use an in-memory limiter
(`lib/rate-limit.ts`) — fine for a single instance. On Vercel (many instances)
back it with **Upstash Redis** for a shared counter; the `rateLimit()` call sites
stay the same.

---

## 7. Security headers

Set in `next.config.mjs` (`headers()`): `X-Content-Type-Options`,
`X-Frame-Options: SAMEORIGIN`, `Referrer-Policy`, `Permissions-Policy`, and HSTS.
A strict `Content-Security-Policy` is intentionally omitted (Recharts/`html-to-image`
use inline styles) — add a tuned CSP if your security posture requires it.

---

## 8. QA checklist (after seeding a full month for all 3 properties)

- [ ] Every dashboard section renders for BKDS / BKDU / BKV and the Group view.
- [ ] Empty states show where a section has no data (no crashes).
- [ ] Derived numbers match `lib/calculations.ts` — run `npm run test` (32 tests).
- [ ] Occupancy shows the exact ratio (e.g. `94.83%`), not a rounded value.
- [ ] PPTX export opens in PowerPoint/Keynote/Google Slides with tables + charts.
- [ ] MTD/YTD toggle, property switcher, and month picker all update the URL.
- [ ] With `AUTH_SECRET` set: signing out redirects to `/login`; a VIEWER cannot
      import or save narratives; an EDITOR only sees their assigned properties.
- [ ] Admin → Activity lists imports / edits / exports / final-locks.
