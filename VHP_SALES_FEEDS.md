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
| `accounts[].type` | **Optional.** `OTA` · `TA` (or `"Travel Agent"`) · `CORPORATE` · `WHOLESALER`. If omitted, the dashboard classifies by name — send it when VHP gives you the category, for accuracy. |
| `accounts[].roomNights` | YTD room nights for the account (integer). |
| `accounts[].revenue` | YTD room revenue, IDR (no separators needed; `"1,480"` is also accepted). |
| `source` | Optional label, for logs. |

**Behaviour:** replaces that period's account rows (idempotent — safe to re-send),
sums any duplicate account names, creates the period as DRAFT if new, refuses a
FINAL period (409), and records an ImportHistory + `sales_account_production_import`
audit row (so it shows in Admin → Activity and keeps the summary's "data as of"
current).

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

_More sections (Market Segment, Room Types, Nationality, LOS, Booking Pace) will
follow the same pattern as they're wired up._
