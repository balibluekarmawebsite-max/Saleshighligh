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
| `section` | ✅ | `C` | `B` or `C` (see §4). Letters or internal ids both work. |
| `week_ending` | ✅ | `2026-10-08` | `YYYY-MM-DD`, the **Thursday** that ends the reporting week (see §6) |
| `source` | optional | `vhp:reservation-by-creation-date` | free text, recorded in the audit log |

(There are also optional `year` and `platform` fields used by other sections;
they are not needed for B or C.)

---

## 4. Section mapping

| VHP report | `section` | Fills in the dashboard |
|---|---|---|
| **Yearly forecast** — per-month occupancy / ADR / revenue (ACTUALS) | `B` | B · YTD Actual & Forecast — the **Actual** columns |
| **Reservation by Creation Date** — grouped by market segment | `C` | C · Weekly Market Segment |

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

The extraction is AI-based and tolerant of VHP's real column names and extra
columns, but the cleaner the file, the more reliable the result. Give each file
a header row and one row per record. Skip "Total" rows.

### Section B — monthly actuals (yearly forecast)

One row per month, with columns the model can recognise as:

| Meaning | Example header(s) | Example value |
|---|---|---|
| Month | `Month` | `January` or `1` |
| Room nights sold | `RN Sold`, `Room Nights` | `452` |
| Occupancy **actual** (percent) | `Occupancy %`, `Occ`, `Occ Act` | `81.00` (a percent 0–100, **not** 0.81) |
| ADR / ARR **actual** (IDR) | `ADR`, `ARR`, `Average Rate` | `1980000` |
| Revenue **actual** (IDR) | `Revenue`, `Room Revenue` | `895000000` |

- Money = plain numbers, no `Rp` and no thousand separators (`895000000`, not `Rp 895.000.000`).
- Occupancy = a percent like `81` or `81.0`, never a fraction.
- Do **not** include Budget or Last-Year columns — they're ignored, so leaving
  them out keeps the file clean.

### Section C — market segment (reservation by creation date)

One row per market segment:

| Meaning | Example header(s) | Example value |
|---|---|---|
| Segment name | `Market Segment`, `Segment` | `OTA`, `Corporate`, `Walk-in` |
| Room nights | `RN`, `Room Nights` | `128` |
| Revenue (gross, IDR) | `Revenue`, `Gross Revenue` | `356000000` |
| Segment group (optional) | `Group` | `Leisure` |

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
    (`week_ending = current_week_ending()`), per property.
  - Section **C** (reservation by segment): once per reporting week (e.g. Friday
    after the week closes), posting that week's `week_ending`, per property.
- **Log** each response (status + body) so a bad week is visible.

---

## 9. End-to-end examples

Section C (reservation → market segment):

```bash
curl -sS -X POST https://dashboard.bluekarmasecrets.com/api/import \
  -H "Authorization: Bearer $IMPORT_API_TOKEN" \
  -F "property=BKDS" \
  -F "section=C" \
  -F "week_ending=2026-10-08" \
  -F "source=vhp:reservation-by-creation-date" \
  -F "file=@bkds-reservation-by-creation-date-2026-10-12.csv"
```

Section B (yearly forecast → monthly actuals):

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
  - [ ] Section B files contain **actuals only** (no budget / last year).
- [ ] Log every response; retry only on 429/5xx with backoff.
- [ ] Alert on 401 (token), 409 (locked week), 422 (unreadable file), 501 (AI off).
