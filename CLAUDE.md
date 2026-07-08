# CLAUDE.md — BK Sales Dashboard

Guidance for Claude Code (and humans) working in this repository.

---

## 1. What this is

**BK Sales Dashboard** is an internal web app for **Blue Karma Group**, a Bali
hospitality company. It replaces a manual, monthly ~60-slide PowerPoint "Sales
Highlight" report with an interactive analytics dashboard **plus** an automated
report export.

Users are the **sales & marketing team** and **management (Director level)**.
Report language is **English**. Currency is **IDR**.

### Properties & outlets

| Code | Property                        | Location       | Restaurant | Spa           |
| ---- | ------------------------------- | -------------- | ---------- | ------------- |
| BKDS | Blue Karma Dijiwa Seminyak      | Seminyak, Bali | BKeto      | Mudara        |
| BKDU | Blue Karma Dijiwa Ubud          | Ubud, Bali     | Botanist   | Flying Bamboo |
| BKV  | Blue Karma Village              | Bali           | Hiiragi    | Heiwa         |

### Monthly report sections

Each property produces a monthly Sales Highlight with these sections:

1. **Executive Summary vs Budget**
2. **Rooms Analytics** — market segment, room type, nationality, geography,
   length of stay, account production
3. **Digital Ads & ROAS**
4. **Online Reputation** — OTA rankings, Tripadvisor
5. **Restaurant Performance**
6. **Spa Performance**
7. **Market Intelligence & Booking Pace**
8. **6-Month Forecast**
9. **Social Media reports**
10. **Action Plans**
11. **Promotions**

---

## 2. Tech stack

- **Next.js 14+** (App Router) + **TypeScript**
- **Tailwind CSS** + **shadcn/ui** components
- **Recharts** for charts
- **Prisma ORM** on **Supabase (Postgres)** — all environments
- **SheetJS (`xlsx`)** for Excel parsing
- **lucide-react** for icons

### Database (Supabase / Postgres)

The database is Supabase Postgres for every environment (no SQLite). Prisma
connects through two URLs (Supabase's recommended setup):

- **`DATABASE_URL`** — the app's runtime connection via the **Transaction
  pooler** (Supavisor, `...pooler.supabase.com:6543`) with `?pgbouncer=true`.
- **`DIRECT_URL`** — used by Prisma Migrate/Introspect (they can't run over the
  transaction pooler) via the **Session pooler** (port `5432`) or the direct
  connection.

Both are configured in `prisma/schema.prisma`'s `datasource` block. See
`.env.example` for the exact formats. Because the GitHub↔Supabase integration is
set up, prefer **`prisma migrate`** (versioned migration files under
`prisma/migrations/`) over `db push` so schema changes are tracked and can sync.

Conventions:

- Money stored as integer IDR (use `BigInt` where values can exceed 2^31).
- Native `enum` types and scalar arrays are now available (Postgres); introduce
  them where they add clarity.

---

## 3. Project structure

```
/app          Next.js App Router routes, root layout, global styles
/components
  /ui         shadcn/ui primitives (button, …)
  /layout     app shell (sidebar, topbar)
  /charts     Recharts chart components
  /tables     data-table components
/lib
  utils.ts    cn() class-name helper
  format.ts   IDR / percentage / variance formatting
  prisma.ts   Prisma client singleton
  constants.ts  properties, outlets, report sections
  /calculations  pure business calculations (variance, ADR, RevPAR, ROAS, …)
  /parsers       SheetJS parsers for uploaded workbooks
/prisma       schema.prisma
/public       static assets
```

---

## 4. Coding conventions

- **TypeScript strict.** `tsconfig` has `strict` + `noUncheckedIndexedAccess`.
  No `any` — model unknowns explicitly.
- **Server Components by default.** Add `"use client"` only when a component
  needs state, effects, or browser APIs (e.g. Recharts charts, interactive
  filters). Keep client components small and push data fetching to the server.
- **Path alias:** import from `@/…` (maps to repo root).
- **Money:** always IDR, formatted with thousand separators and **no decimals**
  via `formatIDR` in `lib/format.ts`. Never hand-format currency.
- **Percentages:** formatted to **2 decimal places** via `formatPercent` /
  `formatVariancePercent`.
- **Variances:** **negative → red, positive → green.** Use
  `varianceColorClass()` for the Tailwind color and `formatVariancePercent()`
  for the signed value. Do not invent ad-hoc red/green logic.
- **Styling:** Tailwind utilities + shadcn tokens (`bg-primary`,
  `text-muted-foreground`, …). Compose classes with `cn()`. Avoid inline
  styles except for chart-only concerns.
- **Calculations** live in `lib/calculations` as pure, testable functions —
  not inline in components.
- **Parsers** live in `lib/parsers`; validate input and return typed results
  with row-level errors surfaced to the upload UI.

### Design system

- **Background:** white. **Primary:** deep teal `#0F4C5C`. **Accent:** gold
  `#C9A227`. Generous whitespace. **Font:** Inter (`--font-inter`).
- Brand colors are available as Tailwind utilities: `bg-brand-teal`,
  `text-brand-gold`, etc. (see `tailwind.config.ts`). Gold is also exposed as
  the CSS var `--brand-gold` for use inside `hsl(var(--brand-gold))`.
- Variance semantic colors: `text-variance-positive` (green),
  `text-variance-negative` (red).
- shadcn semantic tokens (`--primary`, `--accent`, …) are defined in
  `app/globals.css` and mapped to the brand palette.

---

## 5. Commands

```bash
npm run dev         # start the dev server
npm run build       # production build
npm run lint        # eslint (next/core-web-vitals + next/typescript)
npm run typecheck   # tsc --noEmit
npm run format      # prettier

npm run db:generate # prisma generate
npm run db:migrate  # create + apply a versioned migration (preferred)
npm run db:push     # push schema without a migration (prototyping only)
npm run db:studio   # Prisma Studio
```

---

## 6. Phase roadmap

**Phase 0 — Scaffolding & design system (this commit).**
Project setup, folder structure, Tailwind + shadcn design system, brand
palette, formatting helpers, Prisma schema (foundational reference data),
app shell (sidebar + topbar), CLAUDE.md. No dashboard pages yet.

**Phase 1 — Data model & ingestion.**
Flesh out the Prisma schema for all report sections (rooms, F&B, spa, ads,
reputation, forecasts). Build SheetJS parsers for the monthly workbooks and an
upload flow with validation and row-level error reporting.

**Phase 2 — Executive Summary & Rooms.**
Executive Summary vs Budget with variance KPIs; Rooms Analytics (market
segment, room type, nationality, geography, length of stay, account
production) with Recharts visualizations and data tables.

**Phase 3 — Outlets, Ads & Reputation.**
Restaurant and Spa performance, Digital Ads & ROAS, Online Reputation (OTA
rankings, Tripadvisor).

**Phase 4 — Market Intelligence, Forecast & Social.**
Booking pace and market intelligence, 6-month forecast, social media reports,
action plans, and promotions.

**Phase 5 — Report export.**
Automated generation of the monthly Sales Highlight (replacing the manual
PowerPoint), property filters, and month-over-month comparisons.

**Later — Postgres & deployment.**
Switch the Prisma datasource to Postgres, add auth, and deploy.
