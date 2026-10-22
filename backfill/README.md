# Daily Pick-Up history backfill

One-time load of the historical **Occupancy Pick-Up** data (Jan 1 – Oct 19,
2026) for BKDU / BKDS / BKV, reconstructed from the manual *Daily Reservation
Report* workbooks into `daily_pickup_snapshots`.

## How it was built

Each workbook's `{MONTH} PU 2026` tab is an occupancy-movement grid (rows =
snapshot day, columns = stay months, cells = occupancy %). The loader:

- reads each tab's header to map columns → stay months (auto-correcting the odd
  typo, e.g. the September tab), and skips impossible dates (Feb 29–31);
- reconstructs `roomNights = occupancy% × saleable` where saleable = rooms ×
  days (BKDU 20, BKDS 18, BKV 15 rooms);
- uses each month's **exact Room Sold + Revenue Nett** on its latest tracked day,
  so the headline numbers match the sheet precisely.

## Run it (on the VPS)

```bash
cd /home/bkdash/Saleshighligh
git pull
DB=$(grep -E '^DATABASE_URL=' .env | cut -d= -f2- | tr -d '"' | sed 's/[?&]schema=[^&]*//')
psql "$DB" -f backfill/daily-pickup-backfill.sql
```

It is **idempotent** (upserts on `propertyId, snapshotDate, stayYear,
stayMonth`) and **non-destructive** (only touches these rows; any live scraper
data is preserved). The script prints a per-property-month summary at the end.

Safe to delete this folder once loaded — the data lives in the database.
