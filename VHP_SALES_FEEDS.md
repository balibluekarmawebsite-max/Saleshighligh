# VHP → Sales Highlight auto-pull feeds

Monthly Sales Highlight sections that the VHP scraper can populate directly via
API (instead of the Excel upload). Built one section at a time. Each feed is a
token-gated JSON push that replaces one section's data for a (property, period),
creating the period as DRAFT if needed and refusing a FINAL period.

**Auth (all feeds):** `Authorization: Bearer <SALES_API_TOKEN | IMPORT_API_TOKEN>`.
Set a dedicated `SALES_API_TOKEN` to give these report pulls their own identity,
or reuse the `IMPORT_API_TOKEN` the scraper already has. Routes are excluded from
the login middleware.

---

## 1. Account Production (YTD) — `POST /api/sales/account-production`

**Source:** VHP **Forecast Room Production** report —
`https://e1-vhp.com/fr/report/forecast-room-production`, pulled **year-to-date**:
for a report month of October 2026, pull **1 Jan 2026 → 31 Oct 2026**.

**Dashboard section:** Rooms Analytics → Market & Accounts → *Account Production (YTD)*.

### Request

```
POST https://dashboard.bluekarmasecrets.com/api/sales/account-production
Authorization: Bearer <SALES_API_TOKEN | IMPORT_API_TOKEN>
Content-Type: application/json

{
  "property": "BKDS",
  "period": "2026-10",
  "accounts": [
    { "account": "Booking.com", "type": "OTA",        "roomNights": 1480, "revenue": 2701269602 },
    { "account": "Expedia",     "type": "OTA",        "roomNights": 187,  "revenue": 304408058 },
    { "account": "Hotelbeds",   "type": "Wholesaler", "roomNights": 43,   "revenue": 67872442 },
    { "account": "Luxury Escape","type": "Travel Agent","roomNights": 39, "revenue": 59463443 }
  ],
  "source": "vhp:forecast-room-production"
}
```

| Field | Meaning |
| ----- | ------- |
| `property` | `BKDS` / `BKDU` / `BKV`. |
| `period` | The report month `YYYY-MM`. The data is **YTD through this month** (Jan→this month). |
| `accounts[].account` | Account / booker name as VHP shows it. |
| `accounts[].type` | **Optional.** `OTA` · `Travel Agent` · `Overseas Travel Agent` · `B2B` · `Corporate` · `Direct Booking`. If omitted, the dashboard classifies by name. A **saved segmentation rule** for an account always wins over this (see below), so you don't need to get it perfect. |
| `accounts[].roomNights` | YTD room nights for the account (integer). |
| `accounts[].revenue` | YTD room revenue, IDR (no separators needed; `"1,480"` is also accepted). |
| `source` | Optional label, for logs. |

**Behaviour:** replaces that period's account rows (idempotent — safe to re-send),
sums any duplicate account names, creates the period as DRAFT if new, refuses a
FINAL period (409), and records an ImportHistory + `sales_account_production_import`
audit row (so it shows in Admin → Activity and keeps the summary's "data as of"
current).

**Segmentation (saved, reusable across every property).** Each account is shown
under a segment: **OTA · Travel Agent · Overseas Travel Agent · B2B · Corporate ·
Direct Booking**. A saved rule table (`account_segment_rules`, keyed by account
name) maps specific accounts to a segment — or to `EXCLUDE`, which drops junk rows
(e.g. "T o t a l USD", "redeem voucher") from the report. Rules apply to **every
property and period** and are resolved at read time, so editing a rule re-segments
all existing data without re-scraping. The scraper's `type` and automatic
name-classification are only fallbacks when no rule exists.

### How to pull (the YTD window)
1. Open the VHP Forecast Room Production report for `property`.
2. Set the date range **From = {report-year}-01-01**, **To = last day of the report
   month** (e.g. `2026-01-01` → `2026-10-31`). (VHP requires To ≥ today only for
   *future* pulls; a past/YTD range is fine.)
3. Extract per-account: name, (category if shown), room nights, room revenue.
4. POST the array as above.

### Verify
```
GET https://dashboard.bluekarmasecrets.com/api/sales/account-production?property=BKDS&period=2026-10
Authorization: Bearer <token>
```
Returns the stored rows (newest-first by revenue) and the period status. Then open
**Rooms Analytics → Market & Accounts** for that property/month — the *Account
Production (YTD)* table reflects the push.

---

## 2. Room Types — `POST /api/sales/room-types`

**Source:** VHP **Forecast Room by Room Type** report —
`https://e1-vhp.com/fr/report/forecast-room-by-room-type`, pulled for the
**report month** (e.g. June 2026 → that month's room-type production).

**Dashboard section:** Rooms Analytics → Room Types. **Actuals only** — the
report no longer shows budget, so none is needed.

### Request

```
POST https://dashboard.bluekarmasecrets.com/api/sales/room-types
Authorization: Bearer <SALES_API_TOKEN | IMPORT_API_TOKEN>
Content-Type: application/json

{
  "property": "BKDS",
  "period": "2026-06",
  "roomTypes": [
    { "roomType": "Deluxe Room",   "roomNights": 210, "adr": 1650000, "revenue": 346500000 },
    { "roomType": "Premier Suite", "roomNights": 120, "adr": 2100000, "revenue": 252000000 },
    { "roomType": "Pool Villa",    "roomNights": 90,  "adr": 2600000, "revenue": 234000000 },
    { "roomType": "Family Villa",  "roomNights": 34,  "adr": 2200000, "revenue": 74800000 }
  ],
  "source": "vhp:forecast-room-by-room-type"
}
```

| Field | Meaning |
| ----- | ------- |
| `property` | `BKDS` / `BKDU` / `BKV`. |
| `period` | The report month `YYYY-MM`. |
| `roomTypes[].roomType` | Room type **as VHP shows it** — send the raw code (e.g. `1BPVL`); no need to expand it. Readable names are assigned once in **Admin → Room Type Names** and applied to every period. |
| `roomTypes[].roomNights` | Room nights sold (integer). |
| `roomTypes[].adr` | **Optional** — the dashboard derives revenue ÷ room-nights if omitted. |
| `roomTypes[].revenue` | Room revenue, IDR (separators ok). |

**Behaviour:** replaces that month's room-type rows (idempotent), sums any
duplicate room-type names, derives ADR, creates the period as DRAFT if new,
refuses a FINAL period (409), records ImportHistory + a
`sales_room_type_import` audit row.

### Verify
```
GET https://dashboard.bluekarmasecrets.com/api/sales/room-types?property=BKDS&period=2026-06
Authorization: Bearer <token>
```
Then open **Rooms Analytics → Room Types** — the table, Revenue-by-Room-Type and
Room-Nights-Mix populate from the push.

---

_More sections (Nationality, LOS, Booking Pace) will follow the same pattern as
they're wired up._
