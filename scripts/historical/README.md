# Historical daily occupancy backfill (Jan 2025 → Nov 2026)

One-time load of the team's manual **"Daily Reservation Report"** workbooks
(one per property) into `daily_pickup_snapshots`, so the Daily Report shows real
history back to January 2025 instead of only the scraper's recent (and partly
wrong) pushes.

## What's loaded

- **Source:** the `… PU …` occupancy grids in each property's workbook — one row
  per snapshot date, one column per forward stay month, cell = occupancy on hand.
- **Rows:** 23,381 — BKDS 7,853 · BKDU 7,764 · BKV 7,764, covering
  `2025-01-01 … 2026-11-09`.
- **Per (snapshotDate, stayYear, stayMonth):** `roomNights`, `saleableRooms` and
  (on the latest snapshot day of each month) `revenue`.
  - `saleableRooms = roomCount × days-in-month` (BKDS 18, BKDU 20, BKV 15).
    Out-of-order rooms are treated as 0 — verified: BKDS 2026-11-09 November
    comes out to 343 / 540 = **63.52 %**, matching the manual report.
  - `roomNights = round(occupancy_fraction × saleableRooms)`.
  - `revenue` = the sheet's **"Revenue Nett"** row (latest net revenue on hand
    per stay month), stored on each month's **latest snapshot day** so the Daily
    Report summary's Revenue Nett + derived ADR populate. Verified: BKDS Oct 2026
    OCT = 834,065,399 / 473 rooms = ADR **1,763,352**, matching the file.
    (ADR is derived `revenue ÷ roomNights`, never stored.)

Occupancy %, ADR, MoM etc. are derived by the app (`lib/daily/calculations.ts`),
never stored — so loading `roomNights` + `saleableRooms` is enough for the grid
and the "Occ on Hand / Room Sold" summary to render correctly.

## How to load (on the VPS)

Data-only — no rebuild or restart needed (the Daily pages read live):

```bash
cd /home/bkdash/Saleshighligh
git fetch origin claude/bk-sales-dashboard-report-xsw5me && git checkout claude/bk-sales-dashboard-report-xsw5me && git pull
DB=$(grep -E '^DATABASE_URL=' .env | head -1 | cut -d= -f2- | tr -d '"' | tr -d "'")
gunzip -c scripts/historical/historical-daily-occupancy.sql.gz | psql "$DB"
```

Expect `INSERT 0 500` lines and a final `COMMIT`. It's **idempotent** — it
deletes the covered date range per property first, so re-running is safe and
replaces any wrong scraper data for those dates. It stops at **2026-11-09**, so
the scraper's data from 2026-11-10 onward is left untouched.

Verify:

```bash
psql "$DB" -c "SELECT p.code, count(*), min(d.\"snapshotDate\"), max(d.\"snapshotDate\")
  FROM daily_pickup_snapshots d JOIN properties p ON p.id=d.\"propertyId\" GROUP BY p.code ORDER BY p.code;"
```

Then open **Daily Report → Occupancy Pick-Up**: the month picker now lists every
month back to January 2025.

## Regenerating the SQL

`gen-historical-sql.cjs` parses the workbooks and emits the SQL. If a corrected
workbook is provided, re-run (needs the project's `node_modules`, i.e. `xlsx`):

```bash
node scripts/historical/gen-historical-sql.cjs out.sql \
  "BKDS=18=/path/to/BKS.xlsx" "BKDU=20=/path/to/BKU.xlsx" "BKV=15=/path/to/BKV.xlsx"
```

It was validated by executing the output against a throwaway Postgres 16 and
checking row counts, the 63.52 % spot value, and idempotency.
