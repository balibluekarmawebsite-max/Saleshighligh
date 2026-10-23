# VHP → BK Sales Dashboard — Scraper Integration Spec

This is the contract for a scraper (or any automation) that pushes VHP CSV
exports into the **BK Sales Dashboard** weekly report. Hand this file to the
agent building the scraper — it is everything needed to implement the uploader.

The dashboard side is **already built and deployed**. The scraper only has to
download each VHP report and `POST` it here.

---

## 1. What the integration does

For each VHP report you download, you `POST` the file to one endpoint. The
dashboard:

1. checks your shared-secret token,
2. finds (or creates) that property + week's **DRAFT** weekly report,
3. runs the same AI extraction the dashboard UI uses to read the CSV, and
4. writes that one section's data.

No parsing, no field mapping, no date math on your side beyond choosing the
`property`, `section`, and `week_ending`.

---

## 2. Endpoint & auth

```
POST https://dashboard.bluekarmasecrets.com/api/import
Authorization: Bearer <IMPORT_API_TOKEN>
Content-Type: multipart/form-data
```

- One shared secret (`IMPORT_API_TOKEN`) is configured on the server and given
  to you. Put it in the scraper's env/config — **never hard-code it in source**.
- A missing/incorrect token returns **HTTP 401** `{"ok":false,"error":"invalid token"}`.
- The token grants write access to all three properties; keep it secret.

---

## 3. Request fields (multipart/form-data)

| Field | Required | Example | Notes |
|---|---|---|---|
| `file` | ✅ | the CSV file | the VHP export. CSV or XLSX. Max 20 MB. |
| `property` | ✅ | `BKDS` | one of `BKDS`, `BKDU`, `BKV` |
| `section` | ✅ | `C` | `B` (Yearly Occupancy Report) or `C` (Reservation Report) — see §4. (`CANCEL` is reserved for the upcoming Cancellation Report.) |
| `week_ending` | ✅ | `2026-10-08` | `YYYY-MM-DD`, the **Thursday** that ends the reporting week (see §6) |
| `source` | optional | `vhp:reservation-by-creation-date` | free text, recorded in the audit log |

(There are also optional `year` and `platform` fields used by other sections;
they are not needed for B or C.)

---

## 4. Section mapping

The scraped-data feeds have canonical names (see `lib/scrape-sections.ts`):

| Feed name | `section` | VHP report | Fills in the dashboard |
|---|---|---|---|
| **Yearly Occupancy Report** | `B` | Yearly Forecast Of Room Occupancy (actuals) | B · YTD Actual & Forecast — the **Actual** columns |
| **Reservation Report** | `C` | Reservation By Creation Date (by booking agent) | C · Weekly Agent Production |
| **Cancellation Report** | `CANCEL` | Cancelled reservations (per-line) | Daily Report — `daily_cancellations`. **Live:** POST the CSV to **`/api/daily/cancellation`** (not `/api/import` — see §11). |
| **Occupancy Pickup Report** | `PICKUP` | Yearly Forecast Of Room Occupancy (daily snapshot) | Daily Report — `daily_pickup_snapshots` (occupancy on hand). **Live:** POST the CSV to **`/api/daily/pickup`** daily — see §12. |

### Important: Section B is **actuals only**

Section B has three sets of numbers: **Actual**, **Budget**, **Last Year**.

- **Budget** is a *fixed yearly plan* entered by hand in the dashboard (stored
  once per property + year and shared across every week). **The scraper must
  NOT send budget** — the push never touches it.
- **Last Year** is also entered by hand and never touched by the push.
- So a Section B push only needs the **actual** figures per month. It merges
  them month by month; months you don't include are left as they were.

Section C is a **full replace** of that week's market-segment rows (the whole
segment table comes from the reservation export).

---

## 5. CSV format the dashboard expects

For the two VHP exports below, the dashboard **parses the raw file directly**
(deterministic, instant, exact — it reads the whole file, no AI, no size limit).
Just post the VHP export **as downloaded**; no reshaping needed. Any other /
unrecognised CSV falls back to the tolerant AI extractor.

### Section B — Yearly Forecast Of Room Occupancy

Post the VHP **"Yearly Forecast Of Room Occupancy"** export as-is. The dashboard
reads only its **monthly summary rows** (ignoring the daily grid):

- **Room Occupied** → RN Sold per month
- **Occupancy (%)** → occupancy per month
- **Room Revenue** → revenue per month (ADR is derived = revenue ÷ room-nights)

Rules:
- **Download it with "Show Revenue" ticked**, or the file has no revenue rows.
- **The VHP "Month" selector is the start of the window** — this is what makes
  past months work. The 12 columns run from the selected month forward (e.g.
  Month = Oct → Oct…Sep), and the push fills the months from that start through
  **December**, ignoring the columns that wrap into the next year:
  - **Current month** (the normal daily run): set Month to the current month —
    it fills the current month through year-end.
  - **Past-month backfill is fully supported** — just set the Month selector to
    the month you want. Month = **March** fills Mar…Dec; Month = **January**
    backfills the whole year in one pull. VHP shows actuals for months that have
    already closed and forecast for the rest.
  - The window is read entirely from the file, so **no extra date field is
    needed** — the dashboard takes the start month from the export itself. Keep
    `week_ending` pointed at the report week you want the grid to land in.
- Only the **Actual** columns are written. **Budget** (a fixed yearly plan
  entered by hand) and **Last Year** are never touched by the push.

### Section C — Reservation By Creation Date

Post the VHP **"Reservation By Creation Date"** export as-is (the raw per-booking
list). The dashboard aggregates it **by booking agent / source** — the
**`Reservation Name`** column (Booking.com, Expedia, Agoda, individual
reservations, …): room nights = Night × Room Quantity, revenue = sum of Total
Revenue, **excluding Cancelled / No-show** rows. The agent name is taken as the
text before the first comma (any booker suffix after it is dropped) with
asterisks stripped, so `Booking.com, T&T` and `***INDIVIDUAL RESERVATION***`
become `Booking.com` and `INDIVIDUAL RESERVATION`. It replaces that week's
Section C rows.

If instead you send a pre-made CSV (not the VHP export), the AI extractor expects
one row per booking agent / source:

| Meaning | Example header(s) | Example value |
|---|---|---|
| Agent / source name | `Reservation Name`, `Agent`, `Source` | `Booking.com`, `Expedia`, `Individual` |
| Room nights | `RN`, `Room Nights` | `128` |
| Revenue (gross, IDR) | `Revenue`, `Gross Revenue` | `356000000` |
| Group (optional) | `Group` | `OTA` |

- Don't pre-compute ADR or percentages — the dashboard derives them.
- Skip the totals row.

---

## 6. Choosing `week_ending`

A reporting week runs **Friday → Thursday** and is identified by its **Thursday
end date** (`YYYY-MM-DD`). This matches the dashboard URL
`/weekly/<property>/<week_ending>/`.

For a job that refreshes the **current** week (recommended for the daily
forecast), compute the most recent Thursday on/before today:

```python
import datetime
def current_week_ending(today=None):
    d = today or datetime.date.today()
    return (d - datetime.timedelta(days=(d.weekday() - 3) % 7)).isoformat()
# e.g. on 2026-10-12 → "2026-10-08"
```

```javascript
function currentWeekEnding(today = new Date()) {
  const d = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate()));
  d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() - 4 + 7) % 7)); // 4 = Thursday
  return d.toISOString().slice(0, 10);
}
```

Each push **replaces/merges** that week's section, so re-posting the same week
is safe and idempotent. When the week rolls over to a new Thursday, the first
push of the new week auto-creates its DRAFT report.

---

## 7. Responses

### Success — HTTP 200

```json
{
  "ok": true,
  "property": "BKDS",
  "week_ending": "2026-10-08",
  "section": "C",
  "written": 7,
  "created": false,
  "message": "Section C updated"
}
```

- `written` = rows written (B: months; C: segments).
- `created` = `true` if this call created the week's report.

### Errors

| Status | Body `error` | Meaning | Scraper should… |
|---|---|---|---|
| 400 | field message | missing/invalid `property`/`section`/`week_ending`/`file` | fix the request; don't retry unchanged |
| 401 | `invalid token` | bad/missing token | fix the token; don't retry |
| 409 | `…is approved/locked…` | that week's report was finalised in the dashboard | skip; a human must reopen it |
| 422 | `no rows…` / `no valid rows…` | the file had nothing the extractor could use | log + alert; **existing data is left unchanged** |
| 413 | `request body is too large` | file/body over the limit | shrink the export |
| 429 | too many requests | rate limited (60/min per IP) | back off and retry |
| 500 / 502 / 503 | message | server / AI / config problem | retry with backoff (see §8) |
| 501 | AI not configured | server missing its AI key | alert the dashboard owner |

A non-200 never partially writes — the section is either fully updated or left
exactly as it was.

---

## 8. Retry & scheduling

- **Retry** only on network errors and `429`/`500`/`502`/`503`, with exponential
  backoff (e.g. 2s, 4s, 8s, 16s; a few attempts). Do **not** retry `400`/`401`/
  `409`/`422` — those won't change on retry; log and alert instead.
- **Idempotent:** re-posting the same `(property, section, week_ending)` just
  re-applies that section, so a retry after a timeout is safe.
- **Suggested cadence:**
  - Section **B** (yearly forecast): daily, posting the *current* week each run
    (`week_ending = current_week_ending()`), with VHP's Month set to the current
    month, per property. On demand, set VHP's Month selector to a past month to
    backfill it (January = the whole year).
  - **Occupancy Pickup** (Daily Report): **daily** — generate the
    `Yearly Forecast Of Room Occupancy` export with VHP's **Month selector set
    to the current month** (so the file is a 12-month forward window, e.g. Oct
    2026 → Sep 2027) and POST it, as-is, to **`/api/daily/pickup`** with
    `snapshotDate = yesterday`, per property (see §12). This is a **separate
    generation from Section B** (which uses the report month for actuals). Run
    it once a day so each day becomes a row in the occupancy movement grid.
  - **Cancellation** (Daily Report): daily, POST the cancellations export to
    `/api/daily/cancellation` (see §11).
  - Section **C** (reservation by agent): once per reporting week (e.g. Friday
    after the week closes), posting that week's `week_ending`, per property.
- **Schedule** the daily run at a fixed local time (e.g. 06:00 WITA) on the
  office PC / scraper host — a plain cron or Task Scheduler entry that loops the
  three properties. The daily feeds are idempotent per `snapshotDate` / cancel
  date, so a missed day can be re-run safely.
- **Log** each response (status + body) so a bad day is visible.

---

## 9. End-to-end examples

Section C (reservation → agent production):

```bash
curl -sS -X POST https://dashboard.bluekarmasecrets.com/api/import \
  -H "Authorization: Bearer $IMPORT_API_TOKEN" \
  -F "property=BKDS" \
  -F "section=C" \
  -F "week_ending=2026-10-08" \
  -F "source=vhp:reservation-by-creation-date" \
  -F "file=@bkds-reservation-by-creation-date-2026-10-12.csv"
```

Section B (yearly forecast → monthly actuals). The POST is identical whether you
pull the current month or backfill a past one — what changes is **VHP's Month
selector** when you generate the export (current month to refresh, an earlier
month to backfill from there, January for the whole year):

```bash
curl -sS -X POST https://dashboard.bluekarmasecrets.com/api/import \
  -H "Authorization: Bearer $IMPORT_API_TOKEN" \
  -F "property=BKDS" \
  -F "section=B" \
  -F "week_ending=$(date -d 'last thursday' +%F)" \
  -F "source=vhp:yearly-forecast" \
  -F "file=@bkds-yearly-forecast.csv"
```

Minimal Python uploader:

```python
import requests, os

def push(path, property_code, section, week_ending, source):
    with open(path, "rb") as f:
        r = requests.post(
            "https://dashboard.bluekarmasecrets.com/api/import",
            headers={"Authorization": f"Bearer {os.environ['IMPORT_API_TOKEN']}"},
            data={"property": property_code, "section": section,
                  "week_ending": week_ending, "source": source},
            files={"file": (os.path.basename(path), f, "text/csv")},
            timeout=180,
        )
    print(r.status_code, r.json())
    r.raise_for_status()
    return r.json()
```

---

## 10. Checklist for the scraper agent

- [ ] Read `IMPORT_API_TOKEN` from env/config (never hard-code).
- [ ] For each property (`BKDS`, `BKDU`, `BKV`) and each report:
  - [ ] Download the VHP CSV.
  - [ ] Compute `week_ending` (the Thursday, §6).
  - [ ] POST with the right `property` + `section` + `source`.
  - [ ] Section B: set VHP's **Month** selector to the target month — current
        month to refresh, any past month to backfill (January = whole year).
  - [ ] Section B files contain **actuals only** (no budget / last year).
  - [ ] Occupancy Pickup (daily): generate the Yearly Occupancy with VHP's
        **Month selector = the current month** (a 12-month forward window) and
        POST it to `/api/daily/pickup` (§12). Separate generation from Section B.
- [ ] Log every response; retry only on 429/5xx with backoff.
- [ ] Alert on 401 (token), 409 (locked week), 422 (unreadable file), 501 (AI off).

---

## 11. Cancellation Report (daily feed)

The **Cancellation Report** (`CANCEL`) belongs to the **Daily Report**, not the
weekly one, so it uses a **separate endpoint** — there's no week, just cancel
dates.

**POST** `multipart/form-data` to **`/api/daily/cancellation`**:

```
Authorization: Bearer <IMPORT_API_TOKEN>
property=BKDU
source=vhp:cancellation          (optional, for logs)
file=@cancelled-reservation.csv
```

- Post the VHP cancelled-reservations export **as-is** (the raw per-line CSV: the
  header row `Reservation Number … Cancel Date, …, Created Date, …`, the data
  lines, and the `TOTAL` row — all handled; blank lead rows and the `TOTAL` row
  are skipped automatically). Dates are read as `DD/MM/YY`.
- **Idempotent per cancel date:** every cancel date present in the file replaces
  that day's stored rows, so re-posting a day (or a date range) is safe.
- Typically run it **daily** for the previous day's cancellations, or for a date
  range to back-fill.

**The same-day rule is applied by the dashboard, not the scraper.** Send every
line. Lines where **Cancel Date = Created Date** (booked and cancelled the same
day) are stored but **excluded** from the report's counted cancellation room
nights — don't filter them out in the scraper.

**Success** → `200`:

```json
{ "ok": true, "property": "BKDU", "cancelDates": ["2026-10-18"], "written": 11,
  "message": "Cancellation Report stored — 11 line(s) across 1 cancel date(s)." }
```

Errors mirror §7: `401` bad token, `400` missing property/file, `422` the file
isn't a recognised Cancellation Report.

### Verify what landed

**GET** the same endpoint with the token to confirm a push (same-day book-and-
cancel excluded from the counts):

```
curl -H "Authorization: Bearer <IMPORT_API_TOKEN>" \
  "https://<dashboard-host>/api/daily/cancellation?property=BKDU&from=2026-10-01&to=2026-10-31"
```

```json
{ "ok": true, "property": "BKDU",
  "totals": { "lines": 11, "roomNights": 46, "sameDayRoomNights": 2 },
  "byDate": [ { "cancelDate": "2026-10-18", "lines": 11, "roomNights": 46, "sameDayRoomNights": 2 } ] }
```

Each successful push is also recorded in the dashboard **Activity log**
(`/admin/activity`) as `daily_cancellation_import`.

## 12. Occupancy Pickup Report (daily feed)

The **Occupancy Pickup Report** (`PICKUP`) is the backbone of the Daily Report:
it's the **same VHP export as Section B** — *Yearly Forecast Of Room Occupancy* —
but captured **once a day**. Each day's reading is a snapshot of the rooms (and
revenue) on the books for every forward stay month; comparing snapshots day over
day gives **occupancy on hand**, **pickup per day** and **pace vs last year**
(all computed by the dashboard, never stored).

**POST** `multipart/form-data` to **`/api/daily/pickup`**:

```
Authorization: Bearer <IMPORT_API_TOKEN>
property=BKDU
snapshotDate=2026-10-20           (optional; defaults to yesterday, WITA)
year=2026                         (optional; the year the 12-month window STARTS
                                   in — defaults to the snapshotDate's year, which
                                   is correct for a normal current-month pull, so
                                   you normally OMIT this)
source=vhp:pickup                 (optional, for logs)
file=@yearly-occupancy.csv
```

- Post the VHP *Yearly Forecast Of Room Occupancy* CSV **as-is** — the same file
  Section B uses (the `Date` header with the 12 month columns, the `Room
  Occupied` and `Saleable Rooms` rows, and the `Period` / `Room Revenue`
  blocks). Only those summary rows are read; the daily grid at the top is
  ignored. `Saleable Rooms` is the occupancy-% denominator (occ on hand =
  room nights ÷ saleable); it's optional but normally present.
- `snapshotDate` is the day the reading was taken. **Run it once per day** so the
  occupancy-on-hand matrix builds up one row per day (that daily movement is the
  whole point — each day becomes a row, and Occ on Hand / Room Sold / Revenue /
  ADR use the **latest** reading). Omit `snapshotDate` to default to today. It
  must be a real calendar date (`yyyy-mm-dd`); an impossible date like
  `2026-02-29` is rejected with a `400` rather than silently rolled over.
- **Idempotent per snapshot date + year:** re-posting replaces only that
  snapshot date's rows for the year(s) in the file, so a re-run or a back-fill
  of a past date is safe.
- Every stay-month in the file is kept (unlike Section B, which keeps only the
  report year), with the correct roll-over into next year.

### Generate it with the month selector = current month (year-ahead window)

The Daily Report shows occupancy **a year ahead** of the snapshot month (an
October 2026 view runs Oct 2026 → Sep 2027). The VHP *Yearly Forecast Of Room
Occupancy* export is a **12-month window that starts at the month you select**,
so generate the **daily pickup** file with VHP's **Month selector set to the
CURRENT month** — e.g. in October select October, and the file covers
Oct 2026 → Sep 2027 in one pull. The dashboard rolls the later columns into the
next year automatically (anchored on the snapshot year), so **no `year` field is
needed**.

This is a **separate generation from the weekly Section B pull**: Section B
wants the current calendar year's actuals (Month selector = the report month per
§8), whereas the daily pickup wants the forward window (Month selector = the
current month). Same VHP report, two files generated with different Month
settings.

```bash
# daily pickup — Month selector set to the CURRENT month (October)
curl -sS -X POST "https://<dashboard-host>/api/daily/pickup" \
  -H "Authorization: Bearer <IMPORT_API_TOKEN>" \
  -F "property=BKDU" \
  -F "snapshotDate=2026-10-22" \
  -F "file=@yearly-occupancy-oct.csv"
```

Each day, set the Month selector to that day's month (November's pulls select
November → Nov 2026 → Oct 2027, and so on). The Daily grid then fills the
year-ahead window automatically — no further change needed.

**Success** → `200`:

```json
{ "ok": true, "property": "BKDU", "snapshotDate": "2026-10-20",
  "stayMonths": ["2026-10", "2026-11", "2026-12", "2027-01", "...", "2027-09"],
  "written": 12,
  "message": "Occupancy Pickup stored — 12 stay-month(s) as of 2026-10-20." }
```

Errors mirror §7: `401` bad token, `400` missing property / bad `snapshotDate`,
`422` the file isn't a recognised Yearly Occupancy forecast.

### Verify what landed

**GET** the same endpoint with the token to confirm a push (newest snapshot
first):

```
curl -H "Authorization: Bearer <IMPORT_API_TOKEN>" \
  "https://<dashboard-host>/api/daily/pickup?property=BKDU&from=2026-10-01&to=2026-10-31"
```

```json
{ "ok": true, "property": "BKDU", "latestSnapshot": "2026-10-20",
  "snapshots": [
    { "snapshotDate": "2026-10-20", "totalRoomNights": 1389, "totalRevenue": 3721248379,
      "stayMonths": [
        { "stayMonth": "2026-10", "roomNights": 393, "saleableRooms": 465, "occPct": 84.52, "revenue": 854634373 },
        "..." ] } ] }
```

Each successful push is also recorded in the dashboard **Activity log**
(`/admin/activity`) as `daily_pickup_import`.
