# Scraper Health monitoring & auto-recovery

How the dashboard watches the VHP scraper / data-push feeds, alerts the team by
email when data doesn't arrive, and (optionally) asks the office-PC scraper to
re-pull the missing day.

See it in the app at **Admin → Scraper Health** (`/admin/scraper`).

---

## 1. What's watched

Every successful push writes an `AuditLog` row (`action` = the feed, `entity` =
the property code). The monitor's "did it arrive today?" signal is simply the
presence of that row for the current Bali (WITA) day.

**Daily feeds** (pushed each morning by the always-on office-PC scraper), per
property (BKDS / BKDU / BKV):

| Feed | Push endpoint | Audit action | Severity |
| ---- | ------------- | ------------ | -------- |
| Occupancy (Yearly Forecast) | `POST /api/daily/pickup` | `daily_pickup_import` | critical |
| Reservation (pickup + arrivals) | `POST /api/daily/reservation` | `daily_reservation_import` | critical |
| Room Departure | `POST /api/daily/departure` | `daily_departure_import` | secondary |
| Cancellations | `POST /api/daily/cancellation` | `daily_cancellation_import` | secondary |

**Weekly feeds** (Friday 06:00 WITA auto-sync): Metricool, Ads/ROAS, and the
queued VHP Section B/C scrape jobs — shown on the page from the last
`weekly_auto_sync` run and the scrape-job queue.

A feed is a **gap** when no successful push landed for today (WITA). Occupancy
also shows a data-freshness line: the latest stored snapshot date vs. yesterday.

---

## 2. The scheduled check

`/api/cron/scraper-check` runs daily at **09:00 WITA** (systemd timer
`bk-scraper-check.timer`), a couple of hours after the 07:00 pulls. Each run:

1. Computes the health of every daily feed.
2. Compares the open gaps to the previous run **of the same day**, so a gap is
   emailed **once**, not on every re-check.
3. When `SCRAPER_AUTO_RECOVER` is on, queues one daily re-pull per property that
   is missing a **critical** feed (see §4).
4. Emails the Daily Report recipients (same SMTP + recipient list as the daily
   email) when there is a newly-detected gap.
5. Records the run (`scraper_check_runs`) for the page's history + the next
   run's de-dup, and writes a `scraper_check` / `scraper_alert` audit row.

Auth is the same `CRON_SECRET` as the other crons. Install:

```bash
sudo bash deploy/install-scraper-check.sh
```

---

## 3. Alert email

Subject: `⚠️ Scraper alert — N feeds missing · BK Daily (YYYY-MM-DD)`. Body: a
table of the missing feeds per property with how long ago each last arrived, and
whether a re-pull was queued. It reuses the Daily Report's SMTP config and
recipient list — manage recipients at **Admin → Email Delivery**.

---

## 4. Auto-recovery — the section "D" job the scraper must handle

Auto-recovery reuses the existing on-demand scrape-job queue
(`/api/jobs/claim` → `/api/jobs/{id}/result`) with a **new section `"D"`** =
"re-run the morning Daily Report pull for one day". The whole morning pull is a
single VHP session that produces all four daily feeds, so **one** section-D job
per property covers every missing daily feed.

When the dashboard queues one, the poller's **claim** response gains a job like:

```json
{
  "job": {
    "id": "clx…",
    "property": "BKDS",
    "section": "D",
    "start": "2026-11-09",
    "end": "2026-11-09",
    "month": "2026-11",
    "week_ending": null
  }
}
```

**What the office-PC poller must do for `section === "D"`:**

1. Run the **daily** VHP pull for `property`, targeting snapshot date `start`
   (= `end`; the day a morning pull reflects — yesterday).
2. Upload to the **daily** endpoints with `snapshotDate=<start>` and
   `Authorization: Bearer <IMPORT_API_TOKEN>`:
   - `POST /api/daily/pickup` (Yearly Forecast Of Room Occupancy) — **remember
     to exclude `Compliment` and `House Use` sources**, as agreed.
   - `POST /api/daily/reservation`, `POST /api/daily/departure`,
     `POST /api/daily/cancellation` (if your daily routine pushes these).
3. Report the outcome: `POST /api/jobs/{id}/result` with
   `{ "status": "done", "written": <rows>, "message": "daily re-pull" }` — or
   `{ "status": "failed", "message": "<reason>" }`.

> ⚠️ **Enable auto-recovery only after the poller understands section `"D"`.**
> Until then, keep `SCRAPER_AUTO_RECOVER` off (the default). The check still
> records and emails gaps; an admin can trigger a re-pull by hand from the
> Scraper Health page when ready. A claimed `"D"` job that an old poller doesn't
> understand would otherwise sit unfinished and be re-queued every 30 minutes.

Enable it by adding to the app's `.env` and restarting:

```bash
SCRAPER_AUTO_RECOVER=1
```

---

## 5. Deploy checklist

```bash
git pull
npm install
npx prisma migrate deploy            # creates scraper_check_runs
npm run build
sudo systemctl restart bk-dashboard
sudo bash deploy/install-scraper-check.sh   # 09:00 WITA timer
```

Confirm the route is live: `curl -i http://127.0.0.1:3000/api/cron/scraper-check`
returns a JSON 503 ("CRON_SECRET is not set") on a build that has it, or runs the
check when the bearer secret is sent.
