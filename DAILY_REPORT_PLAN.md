# Daily Reservation Report — Data Storage & Automation Plan

Guidance for building the **Daily Report** module for the BK Sales Dashboard.
This is a planning document — we build it step by step, phase by phase.

---

## 1. Goal

Today the dashboard stores **weekly** data (Sections B & C) pulled from VHP.
The next project is an **automated Daily Reservation Report**. For that we first
need a **dedicated database store** for a *different* set of VHP pulls — recorded
**day by day** — that the daily report will later read from.

This plan covers:

1. The data the daily report needs (learned from the sample workbook
   `Daily_Reservation_Report_BKU_2026.xlsx`).
2. A **database schema** to store it (raw inputs only — the storage layer we
   build first).
3. An **ingestion pipeline** for the new daily VHP pulls (reusing the existing
   scrape-job + import infrastructure).
4. The **calculations**, **report UI/export** that come after the store exists.
5. **Delivery automation** — email the report to owner + management and post it to
   the management WhatsApp group, **every morning at 07:00** (§6).

> **Separate from the weekly module.** The daily data comes from *different* VHP
> pulls than weekly Sections B/C, at a finer (per-day) grain. We store it in its
> own `Daily*` models so the two domains stay decoupled.

---

## 2. What the sample daily report contains

The workbook is **per property, per year**, with these repeating sheet types:

| Sheet | Grain | What it holds |
| ----- | ----- | ------------- |
| `<MONTH> PU <YEAR>` (Pick-Up) | snapshot-day × stay-month | **Occupancy on hand** recorded each day as bookings accumulate; summary rows: Room Sold, ADR, Revenue Nett, Gross selling, Average Pickup/day, Increasement %, Occ on Hand. Exists for 2025 (last year) and 2026 (this year). |
| `<MONTH> room rev <YEAR>` | stay-date | Room Nights, Revenue, ADR actually materialised per arrival date. |
| `Market segment` | segment × month | Budget vs Actual room nights + Revenue Budget per market segment. |
| `BKDU Yielding and forecast` | property / month | Capacity config: rooms available (38), rooms OOO, days in month, saleable room nights; pickup pace. |
| `BEP` | property / month | Break-even: fixed cost, variable cost, VC ratio, BEP, monthly budget vs BEP. |

**The three daily data feeds we must store:**

1. **Pick-up / on-the-books** — for each **snapshot date**, the rooms (and
   revenue) on the books for each future **stay period**. This is what grows day
   by day and drives "Occ on Hand" and "Average Pickup/day".
2. **Daily reservations & cancellations** — for each **business date**, how many
   **reservation room nights** were taken and how many **cancellation room
   nights** occurred. *(This is the new VHP pull you will prepare — it is not in
   the sample as raw numbers; the sample only shows the net pick-up.)*
3. **Per-stay-date actuals** — Room Nights + Revenue per **stay date**
   (the `room rev` sheets).

Plus three mostly-static **reference** inputs: **capacity** (rooms, OOO),
**segment budget/actual**, and **BEP** parameters.

---

## 3. Proposed database schema (the storage layer)

New Prisma models, **raw inputs only** (every derived metric — occupancy %, ADR,
RevPAR, pickup/day, increasement %, pace vs LY, BEP gap — is computed in a
`lib/daily/calculations.ts`, never stored). Money/rates are `Decimal`, counts
are `Int`. Everything references the existing `Property`.

```prisma
/// Rooms available vs out-of-order for a property-month (saleable = (avail-ooo)*days).
model DailyCapacity {
  id              String   @id @default(cuid())
  propertyId      String
  year            Int
  month           Int      // 1-12
  roomsAvailable  Int
  roomsOutOfOrder Int      @default(0)
  property        Property @relation(fields: [propertyId], references: [id], onDelete: Cascade)
  @@unique([propertyId, year, month])
}

/// Pick-up snapshot: on the books for a stay period, as seen on `snapshotDate`.
model DailyPickupSnapshot {
  id           String   @id @default(cuid())
  propertyId   String
  snapshotDate DateTime // the day the reading was taken (@db.Date)
  stayYear     Int
  stayMonth    Int      // 1-12  (date-level later if VHP gives it)
  roomNights   Int                 // rooms on the books for that stay period
  revenue      Decimal? @db.Decimal(14, 2)
  property     Property @relation(fields: [propertyId], references: [id], onDelete: Cascade)
  @@unique([propertyId, snapshotDate, stayYear, stayMonth])
  @@index([propertyId, stayYear, stayMonth])
}

/// The NEW daily pull: reservations taken and cancellations, per business date.
model DailyReservationActivity {
  id                     String   @id @default(cuid())
  propertyId             String
  businessDate           DateTime // the transaction day (@db.Date)
  reservationRoomNights  Int      @default(0)
  cancellationRoomNights Int      @default(0)
  reservationRevenue     Decimal? @db.Decimal(14, 2)
  cancellationRevenue    Decimal? @db.Decimal(14, 2)
  property               Property @relation(fields: [propertyId], references: [id], onDelete: Cascade)
  @@unique([propertyId, businessDate])
  @@index([propertyId, businessDate])
}

/// Materialised per-stay-date actuals (the `room rev` sheets).
model DailyRoomRevenue {
  id         String   @id @default(cuid())
  propertyId String
  stayDate   DateTime // @db.Date
  roomNights Int
  revenue    Decimal  @db.Decimal(14, 2)
  property   Property @relation(fields: [propertyId], references: [id], onDelete: Cascade)
  @@unique([propertyId, stayDate])
  @@index([propertyId, stayDate])
}

/// Market-segment budget vs actual per property-month.
model DailySegmentPerformance {
  id            String   @id @default(cuid())
  propertyId    String
  year          Int
  month         Int
  segment       String   // FIT/WALK IN, Direct Booking, Website, OTA, Local TA, B2B, …
  budgetRoomNights Int?
  actualRoomNights Int?
  budgetRevenue    Decimal? @db.Decimal(14, 2)
  actualRevenue    Decimal? @db.Decimal(14, 2)
  property      Property @relation(fields: [propertyId], references: [id], onDelete: Cascade)
  @@unique([propertyId, year, month, segment])
}

/// Break-even parameters per property-month.
model DailyBreakEven {
  id            String   @id @default(cuid())
  propertyId    String
  year          Int
  month         Int
  budgetRevenue Decimal? @db.Decimal(14, 2)
  fixedCost     Decimal? @db.Decimal(14, 2)
  variableCost  Decimal? @db.Decimal(14, 2)
  bepAdr        Decimal? @db.Decimal(14, 2)
  property      Property @relation(fields: [propertyId], references: [id], onDelete: Cascade)
  @@unique([propertyId, year, month])
}
```

> The exact fields (and whether pick-up is stored as room nights vs occupancy %,
> and at month vs stay-date grain) are **finalised in Phase D0** once we see the
> real VHP pull. The shapes above are the starting point.

---

## 4. Ingestion pipeline (reuse what we already have)

**Feed names** (canonical, in `lib/scrape-sections.ts`): the scraped VHP feeds are
**Yearly Occupancy Report** (`B`), **Reservation Report** (`C`), and the new
**Cancellation Report** (`CANCEL`) — the last feeds the daily report's cancellation
room nights into `DailyReservationActivity`. The name is reserved now; its
ingestion endpoint/parser is built in **D2** once the cancellation pull format is
in hand.

We already run a scrape-job system for weekly B/C: `ScrapeJob` model → office-PC
poller claims jobs → pushes results to `/api/import` (token-gated). The daily
feeds plug into the same machinery:

- **New job sections** on `ScrapeJob` (e.g. `daily_pickup`, `daily_activity`,
  `daily_room_rev`) so the office-PC scraper knows which VHP pull to run.
- **A daily sync runner** (`lib/daily/daily-sync-run.ts`) that queues those jobs
  and, when results arrive, upserts them **idempotently** by their natural keys
  (`propertyId` + date). Re-running a day overwrites that day only — never
  duplicates.
- **A manual/Excel fallback** (like the weekly importer): upload the daily
  workbook, parse each sheet, preview, apply — so history can be back-filled and
  a failed scrape can be fixed by hand.
- **Audit**: every daily import writes an audit row, same as weekly.

---

## 5. Calculations & report (after the store exists)

- **`lib/daily/calculations.ts`** — pure, tested functions: occupancy on hand,
  pickup/day, increasement %, ADR, RevPAR, net pickup (reservations −
  cancellations), pace vs last year, pace vs budget, BEP gap.
- **Daily report dashboard** — the pick-up matrix, a reservations-vs-cancellations
  daily chart, per-stay-date actuals, segment budget-vs-actual, and BEP, per
  property + period.
- **Export** — Excel/PDF mirroring the sample workbook's layout.

Delivery of that report (email + WhatsApp, every morning) is §6.

---

## 6. Delivery automation — email + WhatsApp (every morning, 07:00 WITA)

One scheduled job at **07:00 Asia/Makassar (WITA)** runs: build the report →
render a **PDF + a short text summary** → **email** it → **post it to WhatsApp** →
record what was sent (so a retry never double-sends). We reuse the existing cron
pattern — a systemd timer hitting a token-gated `/api/cron/...` endpoint, exactly
like the weekly sync.

### 6a. Email — free and simple

Daily volume is tiny (one email, a handful of recipients), so this is effectively
free several ways:

| Option | Cost | Notes |
| ------ | ---- | ----- |
| **Nodemailer + our own SMTP** (bluekarmasecrets.com mailbox, or a Gmail app password) | **Free** | No third party, simplest. Gmail SMTP caps ~500/day — far above our need. **Recommended start.** |
| **Brevo** (free plan) | **Free** | 300 emails/day over SMTP/API; small "Brevo" footer on the free tier; better deliverability than raw SMTP. |
| **Resend** (free plan) | **Free** | 3,000/month (100/day) on a verified domain; clean developer API. |

Recommendation: start with **Nodemailer + our domain SMTP** (zero dependencies,
zero cost); move to Brevo/Resend only if mail lands in spam. The report goes as a
**PDF attachment + an inline HTML summary**; recipients are a configurable list
(owner + management).

### 6b. WhatsApp group — the honest trade-off

Posting into an **existing WhatsApp group** is the hard part. The **official**
WhatsApp Cloud API does **not** let you post into a normal group: its new Groups
API needs an Official Business Account, the group must be created/invited through
the API, and it caps at ~8 participants — so it cannot post into your existing
management group, and it is a paid platform beyond a small free tier.

The only **free** way into your real management group is an **unofficial**
WhatsApp-Web library:

| Option | Cost | Posts to your group? | Trade-off |
| ------ | ---- | -------------------- | --------- |
| **Baileys** (`@whiskeysockets/baileys`) | **Free / open-source** | ✅ via group JID (`…@g.us`) | WebSocket, **no browser** needed — light on the VPS. **Recommended** of the two. |
| **whatsapp-web.js** | **Free / open-source** | ✅ | Drives headless Chromium (heavier). |
| **Official Cloud API** | Free tier then paid | ❌ existing groups | 1:1 template messages to individuals only. |

**Important caveats for the unofficial route (Baileys):**

- It is **against WhatsApp's Terms of Service** — a real risk the number gets
  **banned**. Use a **dedicated secondary number** (a spare SIM/device), **never**
  anyone's personal WhatsApp.
- It links like WhatsApp Web: a **one-time QR scan** to pair, then a **session
  file** kept on the server (re-scan if it logs out).
- Keep it low-key: **one message a day**, a text summary + the report link (or a
  single small PDF/image), to the one group only.

**Pragmatic recommendation:** post a concise **text summary + link** (optionally
the PDF) to the group via **Baileys on a dedicated number**, accepting the
ToS/ban risk. If zero risk is required, the fallback is the official Cloud API
sending **direct messages to each manager** (not the group) — more setup, has
cost, and loses the single-group convenience.

---

## 7. Step-by-step build order

| Phase | Deliverable | Needs |
| ----- | ----------- | ----- |
| **D0 · Spec** | Finalise the exact columns of each new VHP daily pull + the storage grain (month vs stay-date for pick-up; per-business-date for reservations/cancellations). A short data spec you sign off on. | **A sample of the NEW VHP pull(s)** you will prepare. |
| **D1 · Schema** | The `Daily*` Prisma models above + migration (`prisma migrate`). This is the "database storage" you asked for first. | D0 |
| **D2 · Ingestion** | New scrape-job sections + `daily-sync-run` upserts + Excel fallback importer + audit. | D1 |
| **D3 · Calculations** | `lib/daily/calculations.ts` + vitest tests (occ, pickup, pace, BEP). | D1 |
| **D4 · Report + export** | Daily report dashboard pages + Excel/PDF export. | D2, D3 |
| **D5 · Email delivery** | Scheduled 07:00 build → PDF → email to owner + management (Nodemailer + our SMTP). | D4 |
| **D6 · WhatsApp delivery** | Post the report summary + link to the management group via Baileys (dedicated number). | D5 |
| **D7 · Hardening** | Idempotent send log (no double-send), retries, a failure alert if a morning send fails. | D5, D6 |

We can start **D1 (schema/storage)** immediately on the shapes in §3, and refine
once D0's real pull is in hand.

### Progress

- **D1 — ✅ built.** The six `Daily*` models are in `prisma/schema.prisma` and the
  migration is `prisma/migrations/20261019120000_add_daily_report/`. Apply it on
  the VPS with `npx prisma migrate deploy` (then `npm run db:generate` if needed).
  *Refined after seeing the real Cancellation Report:* the placeholder
  `DailyReservationActivity` was replaced with **`DailyCancellation`** — one RAW
  row per cancelled line (the migration was updated in place, so if you already
  ran `migrate deploy` for the first D1, tell me and I'll add a follow-up
  migration instead).
- **D2 — Cancellation Report ingestion ✅ built.** Deterministic parser
  (`lib/daily/parse-cancellation.ts`, DD/MM/YY dates, skips blanks + TOTAL), the
  same-day exclusion calc (`lib/daily/calculations.ts`), apply + token-gated
  endpoint **`POST /api/daily/cancellation`** (`lib/daily/import-cancellation.ts`),
  and tests against the real sample (verified: raw 48 → **46** counted after
  excluding the one same-day book-and-cancel). The scraper posts the CSV as-is;
  see VHP_INTEGRATION.md §11. The **same-day rule** (Cancel Date = Created Date →
  excluded) lives in the calc, so raw lines are kept.
  *Migration fix:* the first D1 migration was amended in place and had already
  been deployed, so `daily_cancellations` was never created. A corrective
  migration `prisma/migrations/20261020090000_daily_report_cancellation/` now
  swaps `daily_reservation_activity` → `daily_cancellations` (verified live on
  the VPS: raw 2-row smoke test → `roomNights 4`, `sameDayRoomNights 2`).
- **D2 — Occupancy Pickup ingestion ✅ built.** The pick-up feed snapshots the
  **same VHP export as Section B** (*Yearly Forecast Of Room Occupancy*) once a
  day. Deterministic parser (`lib/daily/parse-pickup.ts`, keeps all 12 forward
  stay-months with roll-over years), apply + token-gated endpoint **`POST
  /api/daily/pickup`** (`lib/daily/import-pickup.ts`, idempotent per snapshot
  date, `snapshotDate` defaults to today), verify **GET** + `lib/daily/pickup-
  data.ts`, and tests against the real forecast fixture. Stores raw room nights +
  revenue per `(snapshotDate, stayYear, stayMonth)` into `daily_pickup_snapshots`
  (no schema change — the table was already in the D1 migration). Occupancy on
  hand, pickup/day and pace vs LY are **computed in D3**, never stored. See
  VHP_INTEGRATION.md §12. Feed registered as `PICKUP` in `lib/scrape-sections.ts`.
  *Still to do in D2:* the room-revenue, segment and capacity feeds.

---

## 8. Open questions (need your input)

1. **The new VHP pull(s):** please share a sample export of the data you'll pull
   for the daily report — especially the one with **reservation room nights** and
   **cancellation room nights** per day. The column names/order drive the parser.
2. **Pick-up grain:** store on-the-books by stay-**month** (as the sample matrix
   shows) or by stay-**date** (finer)? Does VHP give room nights, or only occ %?
3. **Reservations/cancellations grain:** per business date **total**, or per
   business date **split by stay date / segment**?
4. **Scope:** all three properties (BKDS/BKDU/BKV) from the start, or BKDU first?
5. **History:** back-fill 2025 + 2026-to-date from the existing workbook, or start
   fresh from go-live?
6. **Email recipients:** the owner + management addresses the 07:00 email should go
   to, and which mailbox/SMTP we send *from* (our domain, or a Gmail app password).
7. **WhatsApp:** can you provide a **dedicated secondary number** for the bot and
   add it to the management group — and are you OK with the unofficial-library
   **ToS/ban risk** (Baileys)? If not, we use official 1:1 messages to each manager
   instead of the group.
8. **Send time:** confirm **07:00 Asia/Makassar (WITA)** for the daily send.
