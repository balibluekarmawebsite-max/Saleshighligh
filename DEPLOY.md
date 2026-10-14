# Deploying BK Sales Dashboard

This project runs **entirely on one self-hosted VPS** — the Next.js app, a local
**PostgreSQL** database, and a Caddy reverse proxy for HTTPS. No external
database, no external file storage. The only optional outside service is the
Anthropic API for the "Generate with AI" narrative buttons (the app works fully
without it).

This guide covers the database, env vars, auth, storage, and the full server
walkthrough. Target OS: **Ubuntu 22.04 / 24.04** on any VPS with root access
(Bluehost VPS, Oracle Cloud, etc.).

> A `vercel.json` is still in the repo for anyone who ever wants to run on
> Vercel, but that path needs an external managed Postgres and has a PDF-export
> caveat, so it is **not** the supported setup. Everything below assumes the VPS.

---

## 1. Database — self-hosted PostgreSQL on the VPS

The database runs on the same server as the app. Install PostgreSQL, then create
a dedicated role + database for the app and grant it access.

### Install PostgreSQL

```bash
sudo apt update
sudo apt install -y postgresql
sudo systemctl enable --now postgresql
```

### Create the role, database, and grants

Connect as the `postgres` superuser (add `-p 5433` if your instance listens on a
non-default port — e.g. this server uses `5433`):

```bash
sudo -u postgres psql
```

Then run (replace the password with a strong one):

```sql
CREATE ROLE bkapp WITH LOGIN PASSWORD 'a-strong-db-password';
CREATE DATABASE bkdash OWNER bkapp;
\c bkdash
GRANT ALL ON SCHEMA public TO bkapp;
ALTER SCHEMA public OWNER TO bkapp;
\q
```

> **Why the grants matter (don't skip this).** In PostgreSQL, creating a login
> role and creating a database are separate from *granting that role access* to
> the database's schema. On **PostgreSQL 15+** a non-owner role has no `CREATE`
> on the `public` schema by default. Making `bkapp` the **owner** of its own
> database (as above) gives it everything it needs to run migrations and
> read/write data. Skipping this is the classic cause of
> `P1010: User was denied access on the database` — which shows up as
> "Application error: a server-side exception has occurred" on every page.
>
> If the role and database already exist but the app is hitting that P1010
> error, fix it without recreating anything:
>
> ```sql
> ALTER DATABASE bkdash OWNER TO bkapp;
> \c bkdash
> ALTER SCHEMA public OWNER TO bkapp;
> GRANT ALL ON SCHEMA public TO bkapp;
> GRANT ALL ON ALL TABLES IN SCHEMA public TO bkapp;
> GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO bkapp;
> ```

### Point the app at it

In `.env` (copy from `deploy/env.vm.example`). Both URLs are the **same** for a
plain local Postgres — `DIRECT_URL` only differs when an external connection
pooler sits in front, which we don't use:

```
DATABASE_URL="postgresql://bkapp:a-strong-db-password@127.0.0.1:5432/bkdash?schema=public"
DIRECT_URL="postgresql://bkapp:a-strong-db-password@127.0.0.1:5432/bkdash?schema=public"
```

Use the port your Postgres listens on (default `5432`; this server uses `5433`).

### Apply migrations, seed, create the first admin

From the project directory, once dependencies are installed (see §8):

```bash
npx prisma migrate deploy   # creates every table (prisma/migrations/, in order)
npm run db:seed             # properties + demo period(s)
npm run db:verify           # sanity check: prints a derived example
ADMIN_EMAIL=you@bluekarmasecrets.com ADMIN_PASSWORD='strong-pass' npm run db:create-admin
```

---

## 2. Environment variables

Live in `.env` at the project root (`chmod 600 .env`). Next.js loads it
automatically; the systemd service picks it up on restart. See
`deploy/env.vm.example` for the annotated list.

| Variable | Required | Purpose |
|---|---|---|
| `DATABASE_URL` | ✅ | Runtime DB (local Postgres) |
| `DIRECT_URL` | ✅ | Migrations (same value for local Postgres) |
| `AUTH_SECRET` | ✅ (prod) | Enables auth + route protection. `openssl rand -base64 32` |
| `AUTH_URL` | ✅ (prod) | Deployed origin, e.g. `https://dashboard.bluekarmasecrets.com` |
| `ANTHROPIC_API_KEY` | optional | Server-side Claude key for AI narratives (never exposed to client) |
| `ANTHROPIC_MODEL` | optional | Defaults to `claude-sonnet-4-6` |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | optional | Google SSO (email/password works without it) |
| `UPLOAD_DIR` / `UPLOAD_URL_BASE` | optional | Local image-upload dir + URL base (defaults: `public/uploads`, `/uploads`) |
| `GROQ_API_KEY` | optional | Groq key for AI data-import extraction (required for the data-push API in §10) |
| `CRON_SECRET` | optional | Shared secret for the weekly auto-sync endpoint (§9) |
| `IMPORT_API_TOKEN` | optional | Shared secret for the VHP data-push API (§10). `openssl rand -base64 48` |

> **Auth rollout switch:** protection and role enforcement turn on **only when
> `AUTH_SECRET` is set**. Without it the app stays open and every action runs as a
> synthetic admin — handy while setting up, but set `AUTH_SECRET` before exposing
> the app publicly.

---

## 3. Auth

- **Email/password:** users are created by an admin in **Admin → Users** (or via
  `npm run db:create-admin` for the first one). Passwords are bcrypt-hashed.
- **Google SSO (optional):** create an OAuth client in Google Cloud Console →
  Credentials. Authorized redirect URI:
  `https://<your-domain>/api/auth/callback/google`. Put the client id/secret in
  the env vars. New Google users default to **VIEWER**; an admin can promote them.

### Roles

| Role | Access |
|---|---|
| **ADMIN** | Everything: mark FINAL, manage users, all properties |
| **EDITOR** | Import data + edit narratives/plans for **assigned properties** only |
| **VIEWER** | Read-only + report export (for Directors / management) |

---

## 4. Image storage (local disk — no external service)

Uploaded images (promotions, plans) are written to **local disk** via
`lib/storage.ts` and served by the app. By default they land in `public/uploads`
and are served at `/uploads/<key>` — nothing to configure. To store uploads
outside the repo tree (e.g. a data volume), set `UPLOAD_DIR=/var/lib/bkdash/uploads`
and serve that path with Caddy, matching `UPLOAD_URL_BASE`. The `public/uploads`
directory is gitignored, so user content is never committed.

---

## 5. Rate limiting

API routes (`/api/narrative`, `/api/export/*`) use an in-memory limiter
(`lib/rate-limit.ts`) — correct for a single-instance VPS. If you ever run
multiple app instances, back it with a shared store (e.g. Redis); the
`rateLimit()` call sites stay the same.

---

## 6. Security headers

Set in `next.config.mjs` (`headers()`): `X-Content-Type-Options`,
`X-Frame-Options: SAMEORIGIN`, `Referrer-Policy`, `Permissions-Policy`, and HSTS.
A strict `Content-Security-Policy` is intentionally omitted (Recharts/`html-to-image`
use inline styles) — add a tuned CSP if your security posture requires it.

---

## 7. QA checklist (after seeding a full month for all 3 properties)

- [ ] Every dashboard section renders for BKDS / BKDU / BKV and the Group view.
- [ ] Empty states show where a section has no data (no crashes).
- [ ] Derived numbers match `lib/calculations.ts` — run `npm run test` (32 tests).
- [ ] Occupancy shows the exact ratio (e.g. `94.83%`), not a rounded value.
- [ ] PPTX export opens in PowerPoint/Keynote/Google Slides with tables + charts.
- [ ] PDF export produces a paginated A4-landscape file.
- [ ] MTD/YTD toggle, property switcher, and month picker all update the URL.
- [ ] With `AUTH_SECRET` set: signing out redirects to `/login`; a VIEWER cannot
      import or save narratives; an EDITOR only sees their assigned properties.
- [ ] Admin → Activity lists imports / edits / exports / final-locks.

---

## 8. Full server walkthrough (Ubuntu VPS)

End-to-end setup on a fresh Ubuntu VPS. PDF export works here because Chromium
runs natively. Helper files live in `deploy/`.

> **RAM note.** The Next.js production build is memory-hungry. Give the VPS at
> least **2 GB RAM** (4 GB+ comfortable). On a 1 GB box the build can OOM — add
> swap (see 8.6) or size up.

### 8.1 Install the toolchain

```bash
sudo apt update && sudo apt upgrade -y
sudo apt install -y git build-essential

# Node 20 LTS (NodeSource)
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs
node -v   # v20.x
```

Install PostgreSQL and create the role + database + grants — see **§1**.

### 8.2 Open ports 80 + 443

Open HTTP/HTTPS in your VPS firewall. On plain Ubuntu with `ufw`:

```bash
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
```

> **Oracle Cloud only:** Oracle blocks traffic in **two** places — you must also
> add ingress rules for TCP `80` and `443` from `0.0.0.0/0` in the VCN Security
> List, *and* open them in the instance's `iptables`
> (`sudo iptables -I INPUT 6 -m state --state NEW -p tcp --dport 80 -j ACCEPT`,
> same for 443, then `sudo netfilter-persistent save`). On Bluehost and most
> VPS providers, the `ufw` rules above are all you need.

### 8.3 Clone the repo + create .env

The repo is private, so authenticate the clone (a GitHub Personal Access Token
with repo scope used as the password, or a deploy key). Clone into the home
directory; adjust the path/user in `deploy/bk-dashboard.service` if you use a
different location (this server uses `/home/bkdash/Saleshighligh`):

```bash
cd ~
git clone https://github.com/balibluekarmawebsite-max/saleshighligh.git Saleshighligh
cd Saleshighligh
git checkout claude/bk-sales-dashboard-report-xsw5me   # or main, once merged

cp deploy/env.vm.example .env
nano .env            # fill DATABASE_URL, DIRECT_URL, AUTH_SECRET, AUTH_URL (ANTHROPIC_API_KEY optional)
chmod 600 .env
```

Generate `AUTH_SECRET` with `openssl rand -base64 32`. Set `AUTH_URL` to your
final `https://…` domain (or `http://<public-ip>:3000` for an IP-only smoke test).

### 8.4 Install deps, migrate, seed, build

```bash
npm ci
npx prisma generate
npx playwright install --with-deps chromium   # for PDF export

npx prisma migrate deploy                     # create tables in the local DB
npm run db:seed                               # properties + demo period(s)
ADMIN_EMAIL=you@bluekarmasecrets.com ADMIN_PASSWORD='a-strong-password' npm run db:create-admin

npm run build                                 # production build
```

### 8.5 Run it as a service (systemd)

Keeps the app alive across crashes and reboots.

```bash
sudo cp deploy/bk-dashboard.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now bk-dashboard
sudo systemctl status bk-dashboard     # should be active (running)
journalctl -u bk-dashboard -f          # live logs
```

The app listens on `127.0.0.1:3000`. Quick check:
`curl -I http://localhost:3000` should return `200` (or a `307` redirect to
`/login` when `AUTH_SECRET` is set).

> Edit `deploy/bk-dashboard.service` first if your OS user / project path differ
> from `ubuntu` / `/home/ubuntu/Saleshighligh`.

### 8.6 HTTPS with a domain (Caddy)

Point a DNS A record at the VPS public IP, then install Caddy (it fetches and
renews the TLS cert automatically):

```bash
sudo apt install -y debian-keyring debian-archive-keyring apt-transport-https curl
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' \
  | sudo gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' \
  | sudo tee /etc/apt/sources.list.d/caddy-stable.list
sudo apt update && sudo apt install -y caddy

sudo nano deploy/Caddyfile        # replace dashboard.example.com with your domain
sudo cp deploy/Caddyfile /etc/caddy/Caddyfile
sudo systemctl reload caddy
```

Set `AUTH_URL="https://your-domain"` in `.env`, then
`sudo systemctl restart bk-dashboard`. Visit the domain — you should get HTTPS
and the `/login` page.

> If the build ever gets OOM-killed on a small box, add swap:
> `sudo fallocate -l 4G /swapfile && sudo chmod 600 /swapfile && sudo mkswap
> /swapfile && sudo swapon /swapfile` (persist in `/etc/fstab`).

### 8.7 Updating the app later

```bash
cd ~/Saleshighligh
git pull
npm ci
npx prisma migrate deploy        # only if new migrations landed
npm run build
sudo systemctl restart bk-dashboard
```

### 8.8 AI narrative auth on the server (optional)

`ANTHROPIC_API_KEY` in `.env` is the simplest path. Alternatively log in once
with the Claude CLI on the server and set `ANTHROPIC_USE_PROFILE=true` (see
`deploy/env.vm.example`). Either way calls bill your **Anthropic API** account —
the CLI login is an auth convenience, **not** a way to bill a Claude.ai
subscription. Leave it unset and the "Generate with AI" buttons simply show
"not configured"; nothing else is affected.
```

## 9. Weekly auto-sync (Metricool + ads, every Friday)

The app exposes `GET /api/cron/weekly-sync`, which — for every property — makes
sure the current reporting week's report exists (creating a DRAFT if the team
hasn't yet), then pulls **Metricool** (Instagram + Facebook → Section H) and
**ads/ROAS** (when each is configured). It's resilient: one property failing
never stops the others, and a locked (approved/exported) report is left
untouched.

> **Deploy this code first.** The `/api/cron/weekly-sync` route ships in this
> commit — make sure the server is running a build that includes it (see §8.7:
> `git pull && npm ci && npm run build && sudo systemctl restart bk-dashboard`).
> Confirm with `curl -i http://127.0.0.1:3000/api/cron/weekly-sync`: a JSON 503
> ("CRON_SECRET is not set") means the route is live; a 404 or a redirect to
> `/login` means the build predates it.

### 9.1 Protect it with a secret

Put `CRON_SECRET` in the app's `.env` — the one in the service's
**WorkingDirectory**, not `~`. Derive the path from systemd so it's always
right (adjust the unit name if yours differs):

```bash
APP=$(systemctl show -p WorkingDirectory --value bk-dashboard)
echo "App dir: $APP"
grep -q '^CRON_SECRET=' "$APP/.env" \
  || echo "CRON_SECRET=\"$(openssl rand -base64 32)\"" >> "$APP/.env"
sudo systemctl restart bk-dashboard
```

The endpoint refuses to run without `CRON_SECRET` set. The scheduler must send
it as `Authorization: Bearer <CRON_SECRET>` (or `x-cron-secret: <secret>`, or
`?key=<secret>`). A signed-in **admin** can also trigger it from the browser.
Read the value back when you need it for the scheduler:
`grep CRON_SECRET "$APP/.env"`.

### 9.2 Schedule it (Friday 06:00 Bali time)

The reporting week runs Fri→Thu, so running Friday morning fills the week that
just ended. **Bali is UTC+8**, so Friday 06:00 WITA = **Thursday 22:00 UTC**.

**Option A — crontab.** If the VM's clock is set to `Asia/Makassar`
(`timedatectl set-timezone Asia/Makassar`), schedule it in local time:

The scheduler runs **on the box**, so hit the app on localhost (the port in the
service — `3000` by default) and skip TLS/domain entirely.

```cron
# m h dom mon dow  — Friday 06:00 local (Asia/Makassar)
0 6 * * 5 curl -fsS -H "Authorization: Bearer YOUR_CRON_SECRET" http://127.0.0.1:3000/api/cron/weekly-sync >> /var/log/bk-weekly-sync.log 2>&1
```

If the VM stays on **UTC**, use `0 22 * * 4` (Thursday 22:00 UTC) instead — same
instant.

**Option B — systemd timer (recommended).** Create
`/etc/systemd/system/bk-weekly-sync.service`:

```ini
[Unit]
Description=BK weekly Metricool + ads auto-sync
[Service]
Type=oneshot
ExecStart=/usr/bin/curl -fsS -H "Authorization: Bearer YOUR_CRON_SECRET" http://127.0.0.1:3000/api/cron/weekly-sync
```

and `/etc/systemd/system/bk-weekly-sync.timer`:

```ini
[Unit]
Description=Run BK weekly auto-sync every Friday 06:00 Bali time
[Timer]
OnCalendar=Fri *-*-* 06:00:00 Asia/Makassar
Persistent=true
[Install]
WantedBy=timers.target
```

Then: `sudo systemctl daemon-reload && sudo systemctl enable --now
bk-weekly-sync.timer` (check with `systemctl list-timers bk-weekly-sync`).
`Persistent=true` catches up a run the box missed while powered off.

> **On Vercel instead?** `vercel.json` already declares the cron
> (`0 22 * * 4`); Vercel runs it in UTC and sends `Authorization: Bearer
> $CRON_SECRET` automatically — just set `CRON_SECRET` in the project env.

### 9.3 Run it on demand

```bash
# current week (run on the server; use the public URL from elsewhere)
curl -H "Authorization: Bearer YOUR_CRON_SECRET" http://127.0.0.1:3000/api/cron/weekly-sync
# a specific past week (its Thursday end date)
curl -H "Authorization: Bearer YOUR_CRON_SECRET" "http://127.0.0.1:3000/api/cron/weekly-sync?week=2026-10-01"
```

The JSON response lists, per property, whether the report was created, how many
Metricool/ads rows were written, and any per-property errors. Runs are recorded
in the audit log (`/admin/activity`, action `weekly_auto_sync`).

---

## 10. Data push API (VHP scraper → weekly report)

An external scraper can push a VHP CSV export straight into a weekly report
section. The endpoint finds-or-creates that property + week's **DRAFT** report,
runs the same "Process with AI" extraction the UI uses, and **replaces that one
section's data** — exactly like a manual AI import, but in one call and with no
browser session.

**Needs `GROQ_API_KEY`** (same key as the AI Data Import) and a shared secret.

### 10.1 Set the shared secret

```bash
openssl rand -base64 48        # generate once
```

Put it in `.env` as `IMPORT_API_TOKEN="…"`, restart the service, and give the
scraper the **same** value. Without it set, the endpoint refuses every request
(HTTP 503). A wrong/absent token → HTTP 401.

### 10.2 The contract

```
POST https://dashboard.bluekarmasecrets.com/api/import
Authorization: Bearer <IMPORT_API_TOKEN>
Content-Type: multipart/form-data
```

| Field | Example | Meaning |
|---|---|---|
| `file` | the CSV/Excel file | the VHP export (≤ 20 MB) |
| `property` | `BKDS` | `BKDS` / `BKDU` / `BKV` |
| `section` | `C` | report section — letter (`B`, `C`, `D`, `EF`, `G`, `G2`, `H`, `I`, `J`) **or** internal id (`monthly`, `segment`, …) |
| `week_ending` | `2026-10-08` | `YYYY-MM-DD`, the **Thursday** that ends the reporting week (matches the `/weekly/.../2026-10-08/` URL) |
| `source` | `vhp:reservation-by-creation-date` | optional, recorded in the audit log |
| `year` | `2026` | optional; only the Channel section (`EF`) needs it — defaults to the week's year |
| `platform` | `Instagram` | optional; only the Social section (`H`) uses it |

**Section mapping for this project**

| VHP report | `section` | Fills |
|---|---|---|
| Yearly forecast (per-month occupancy / ADR / revenue — ACTUALS) | `B` | B · YTD Actual & Forecast (Actual columns) |
| Reservation by Creation Date (by booking agent) | `C` | C · Weekly Agent Production |

> **Section B is ACTUALS only.** The push fills the per-month Actual
> occupancy / ADR / revenue (merged month by month). The **Budget** is a
> fixed yearly plan entered by hand in the Section B grid (stored once per
> property + year, shared across every week) and the **Last Year** column is
> entered by hand — the push never touches either, so send only the actual
> figures. The VHP **Month** selector picks the window start (read from the file
> itself): current month to refresh, or any **past month to backfill** — Month =
> January fills the whole year. Section C is a full replace of the week's
> agent-production rows.

### 10.3 Example call

```bash
curl -X POST https://dashboard.bluekarmasecrets.com/api/import \
  -H "Authorization: Bearer $IMPORT_API_TOKEN" \
  -F "property=BKDS" \
  -F "section=C" \
  -F "week_ending=2026-10-08" \
  -F "source=vhp:reservation-by-creation-date" \
  -F "file=@bkds-reservation-by-creation-date-2026-10-12.csv"
```

**Success → HTTP 200**

```json
{ "ok": true, "property": "BKDS", "week_ending": "2026-10-08", "section": "C", "written": 7, "created": false, "message": "Section C updated" }
```

**Errors**

| Status | Meaning |
|---|---|
| 401 | `invalid token` |
| 400 | missing/invalid field (property, section, week_ending, file) |
| 409 | that week's report is **approved/locked** — reopen it to accept imports |
| 422 | no rows could be extracted from the file — existing data left unchanged |
| 501 | `GROQ_API_KEY` not set |
| 503 | `IMPORT_API_TOKEN` not set |

Every successful push writes a `weekly_api_import` audit row (`/admin/activity`)
and a `WeeklyImport` record on the report.

### 10.4 Which week does the daily job target?

`week_ending` is always the **Thursday that ends the reporting week** (reports
run Fri–Thu). For a daily job that refreshes the *current* week, compute the
most recent Thursday on/before today and post to that — each run replaces the
section, so the current week stays live; when the week rolls over, a new DRAFT
is created automatically.

```bash
# most recent Thursday on/before today (UTC), YYYY-MM-DD — for the scraper config
python3 - <<'PY'
import datetime
d = datetime.date.today()
print((d - datetime.timedelta(days=(d.weekday() - 3) % 7)).isoformat())
PY
```

> **Section B budget is safe.** A Section B push only merges the per-month
> Actual columns — it never clears the Budget (a fixed yearly plan entered in
> the grid) or the Last Year column. Section C replaces the week's segment rows.

### 10.5 One-time budget backfill (run once, after deploying the budget change)

The budget became a fixed **annual** figure (stored once per property + year,
shared across every week) instead of a per-week copy. Run this once, right
after `npm run build` + restart, to copy the budget already entered in past
weeks into the annual table. It is idempotent and never overwrites a budget a
human later edits in the grid:

```bash
npm run db:backfill-budget
```

After it runs, every week's Section B shows the same budget, and editing the
budget in any week's grid updates it for the whole year.

---

## 11. On-demand scrape queue (Request Scrape)

Lets a user click **Request Scrape** on the dashboard to have the office PC pull
a specific VHP report + period on demand, instead of waiting for the schedule.
The dashboard writes a job; the office PC's poller claims it, scrapes, uploads
via `/api/import`, and reports the result. (See the companion spec
`VHP_JOBS_INTEGRATION.md` the scraper is built against.)

**Apply the migration** (adds the `scrape_jobs` table) on deploy:

```bash
npx prisma migrate deploy        # applies migrations/20261012120000_add_scrape_jobs
# or run prisma/migrations/20261012120000_add_scrape_jobs/migration.sql by hand
```

**Auth:** both job endpoints accept the existing `IMPORT_API_TOKEN`. Set
`VHP_JOBS_TOKEN` only if you want the queue to use a separate secret (the poller
must then send that one). `/api/jobs/*` is excluded from the login middleware,
self-gated by the token.

**Endpoints (for the poller):**

| Endpoint | Purpose |
|---|---|
| `POST /api/jobs/claim` | atomically claim the oldest queued job → `{ "job": {…} }` or `{ "job": null }`; re-queues leases stuck "running" > 30 min |
| `POST /api/jobs/{id}/result` | idempotent status update → `{ "ok": true }` (sets done/failed + message + rows written) |

**UI:** the **Request Scrape** page (weekly sidebar) lets an EDITOR/ADMIN pick
property + report (B/C) + period; the job list shows queued → running → done /
failed with the result. The data path is unchanged — the scraper still uploads
through `/api/import`; the job endpoints are only status bookkeeping.
