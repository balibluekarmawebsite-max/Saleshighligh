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

- **Store only RAW inputs.** Every derived metric (variance, achievement %,
  RevPAR, ADR, ROAS, average check, MoM, YTD accumulation) is computed in
  `lib/calculations.ts` — never persisted.
- Everything is keyed by **(propertyId, period)**, where `period` is the first
  day of the month (`ReportPeriod` is the parent of a month's data).
- Money and rates are **`Decimal`** (Postgres `numeric`); counts are `Int`;
  ratios/percentages are `Decimal`. Native `enum` types are used throughout.

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
  utils.ts          cn() class-name helper
  format.ts         IDR / percentage / variance formatting
  prisma.ts         Prisma client singleton
  constants.ts      properties, report sections
  calculations.ts   pure business calculations (+ calculations.test.ts, vitest)
  /parsers          SheetJS parsers for uploaded workbooks (later phase)
/prisma
  schema.prisma     23 models + 13 enums (see roadmap)
  seed-data.ts      shared demo data (single source of truth)
  seed.ts           Prisma seed (npm run db:seed)
  seed.sql          generated SQL seed (for the Supabase SQL editor)
  gen-seed-sql.ts   regenerates seed.sql from seed-data.ts
  verify.ts         post-seed sanity check (npm run db:verify)
  /migrations       versioned SQL migrations
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
npm run test        # vitest (calculations unit tests)
npm run format      # prettier

npm run db:generate # prisma generate
npm run db:migrate  # create + apply a versioned migration (preferred)
npm run db:push     # push schema without a migration (prototyping only)
npm run db:seed     # seed properties + BKDS June 2026 demo period
npm run db:verify   # read the demo period back + print a derived example
npm run db:studio   # Prisma Studio

# Regenerate prisma/seed.sql after editing prisma/seed-data.ts:
npx tsx prisma/gen-seed-sql.ts
```

---

## 6. Phase roadmap

**Phase 0 — Scaffolding & design system. ✅ Done.**
Project setup, folder structure, Tailwind + shadcn design system, brand
palette, formatting helpers, app shell (sidebar + topbar), CLAUDE.md.
Supabase (Postgres) configured.

**Phase 1 — Data model, calculations & seed. ✅ Done (schema).**
Full Prisma schema (23 models + 13 enums) covering executive summary, rooms
(segment, room type, nationality, LOS, accounts), digital ads, F&B, spa,
reputation, social, booking pace, forecast, narrative, influencers.
`lib/calculations.ts` (pure functions + vitest) holds every derived metric.
Seed: the 3 properties + a fully-populated BKDS June 2026 demo period (real
values where available). Migration + `seed.sql` generated.

**Ingestion system.** ✅ Template generator, upload/parse, validation, preview,
and transactional import are live under `/admin/*`. One shared spec
(`lib/import/schema.ts`) drives both the SheetJS template generator
(`lib/import/template.ts`, route `/admin/template`) and the parser/validator
(`lib/import/parse.ts` — Indonesian number handling, enum/negative checks,
tab/property/period matching). `/admin/import` uploads → previews row counts +
issues → confirms → transactional per-tab upsert (`lib/import/apply.ts`) with
an `ImportHistory` audit row; FINAL periods are locked. Sample workbook in
`/samples`. _Still to do:_ manual-entry forms (react-hook-form + zod), narrative
rich-text (TipTap) + image upload, and admin auth for the draft→final control.

**Phase 2 — Executive Summary & Rooms. ✅ Done.**
Executive Summary vs Budget with variance KPIs (occupancy/ADR/RevPAR/revenue),
revenue-by-department, and all Rooms views (market segment, room types,
nationality, length of stay, account production), reading real data via
`lib/dashboard-data.ts`.

**Phase 3 — App shell, navigation & global filters. ✅ Done.**
URL-driven routing under `/dashboard/[property]/[yyyy-mm]/…` (shareable links),
a persistent context bar (property switcher incl. Group, month picker showing
only real periods with draft/final badge, MTD/YTD toggle, Export placeholder),
a grouped sidebar with the Rooms submenu, mobile section nav, per-section
loading skeletons + error boundary. Shared components in `components/dashboard`
(`KpiCard`, `MoMBadge`, `SectionCard`, `EmptyState`, `Sparkline`) and
`components/tables/VarianceTable`; nav model in `lib/nav.ts`; `/admin/*` has its
own shell. Format helpers `formatPct`/`formatCompact`/`formatRatioPct` in
`lib/format.ts`.
_Still to do:_ consolidated Group pages; wiring the remaining sections
(Digital Ads, Restaurant, Spa, Market & Forecast, Social & PR, Action Plans).

**Phase 4 — Executive Summary page. ✅ Done.**
`/dashboard/[property]/[period]/summary` (base route redirects here): hero KPI
row (Occupancy/ADR/RevPAR/Total & Room Revenue with achievement chips), the
achievement `VarianceTable` (Actual/Budget/Last Year/Variance/Achievement %,
occupancy in points), a revenue-mix donut, the SUMMARY narrative panel with a
stubbed "Generate with AI" button (`/api/ai/narrative`), and a two-column
factors section (External accordion + Internal factors with a 6-month forecast
occupancy preview). Aggregated fetch `getSummaryPageData`; "data as of" caption.

**Phase 5 — Rooms: Market Segment & Account Production. ✅ Done.**
`/dashboard/[property]/[period]/rooms/segments` (respects the MTD/YTD toggle;
old `market-segment`/`account-production` routes redirect here). Grouped-column
`SegmentPerformanceTable` (This Year / Budget / Last Year × RN·ARR·Revenue +
variance + achievement, blended-ARR total), a horizontal Actual/Budget/LY
revenue bar, a room-nights donut, and computed insight chips. Account
Production (YTD): a single-axis Pareto (share + cumulative %) and a
sortable, type-filterable table. Charts export to PNG via `ExportableCard`
(html-to-image). Aggregated fetch `getSegmentsPageData`.

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
