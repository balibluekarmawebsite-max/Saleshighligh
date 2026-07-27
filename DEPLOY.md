# Deploying BK Sales Dashboard

Two supported targets:

- **Self-hosted on an Ubuntu VM** (Oracle Cloud Always Free, or any VPS) —
  full support **including PDF export**, since Chromium runs natively. This is
  the recommended target for Blue Karma. Jump to **[§9 Self-host on an Ubuntu
  VM](#9-self-host-on-an-ubuntu-vm-oracle-cloud-always-free)**.
- **Vercel** — fast to set up; PPTX + Group zip work unchanged, but PDF export
  needs a workaround (see §5).

Either way the database stays on **Supabase Postgres** (Neon works too). This
guide covers env vars, migrations, auth, storage, and both deploys.

---

## 1. Database (Supabase or Neon)

The Prisma datasource is already PostgreSQL for every environment. You need two
connection strings (see `.env.example` for exact formats):

- **`DATABASE_URL`** — runtime, via the **Transaction pooler** (port `6543`,
  `?pgbouncer=true`).
- **`DIRECT_URL`** — migrations, via the **Session pooler** / direct connection
  (port `5432`).

**Neon:** create a project, use the pooled connection string for `DATABASE_URL`
(add `?pgbouncer=true&connection_limit=1`) and the direct string for `DIRECT_URL`.

### Apply migrations

From a machine that can reach the database:

```bash
npm install
npx prisma migrate deploy   # applies every migration in prisma/migrations/ in order
```

If you prefer the Supabase SQL editor, run each `prisma/migrations/*/migration.sql`
in timestamp order. The full list:

```
20260708090459_init
20260708233011_add_import_history
20260709004909_widen_revenue_summary_precision
20260709090000_add_market_supply
20260709100000_add_sales_strategy_section
20260710090000_add_narrative_versions
20260710100000_add_export_history
20260711090000_add_auth_and_audit
```

### Seed & first admin

```bash
npm run db:seed                                   # properties + demo period(s)
ADMIN_EMAIL=you@bluekarma.com ADMIN_PASSWORD='strong-pass' npm run db:create-admin
```

---

## 2. Environment variables

Set these in **Vercel → Project → Settings → Environment Variables** (and locally
in `.env`). See `.env.example` for the annotated list.

| Variable | Required | Purpose |
|---|---|---|
| `DATABASE_URL` | ✅ | Runtime DB (transaction pooler) |
| `DIRECT_URL` | ✅ | Migrations (session/direct) |
| `AUTH_SECRET` | ✅ (prod) | Enables auth + route protection. `openssl rand -base64 32` |
| `AUTH_URL` | ✅ (prod) | Deployed origin, e.g. `https://app.vercel.app` |
| `ANTHROPIC_API_KEY` | for AI | Server-side Claude key (never exposed to client) |
| `ANTHROPIC_MODEL` | optional | Defaults to `claude-sonnet-4-6` |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | optional | Google SSO |
| `SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY` / `SUPABASE_STORAGE_BUCKET` | optional | Uploaded-image storage |

> **Auth rollout switch:** protection and role enforcement turn on **only when
> `AUTH_SECRET` is set**. Without it the app stays open and every action runs as a
> synthetic admin — handy for preview, but set `AUTH_SECRET` before going live.

---

## 3. Auth

- **Email/password:** users are created by an admin in **Admin → Users** (or via
  `npm run db:create-admin` for the first one). Passwords are bcrypt-hashed.
- **Google SSO:** create an OAuth client in Google Cloud Console → Credentials.
  Authorized redirect URI: `https://<your-domain>/api/auth/callback/google`. Put
  the client id/secret in the env vars. New Google users default to **VIEWER**;
  an admin can promote them.

### Roles

| Role | Access |
|---|---|
| **ADMIN** | Everything: mark FINAL, manage users, all properties |
| **EDITOR** | Import data + edit narratives/plans for **assigned properties** only |
| **VIEWER** | Read-only + report export (for Directors / management) |

---

## 4. Image storage (optional)

Uploaded images use Supabase Storage via `lib/storage.ts` (REST, no SDK). Create
a **public** bucket (default name `uploads`) in Supabase → Storage, then set
`SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_STORAGE_BUCKET`. When
unset, image upload is disabled gracefully.

---

## 5. Deploy to Vercel

1. Import the GitHub repo into Vercel (framework auto-detected: Next.js).
2. `vercel.json` sets the build command (`prisma generate && next build`) and
   raises `maxDuration` for the export routes.
3. Add all env vars (above) for **Production** (and Preview if desired).
4. Deploy. First deploy runs `postinstall` → `prisma generate`.

### PDF export caveat on Vercel

`/api/export/pdf` launches headless Chromium via Playwright. Vercel's serverless
runtime **cannot launch the bundled Chromium** — options:

- Run the app on a **Node host** (Render, Fly, a VM) where `npx playwright install
  chromium` works; or
- Swap to `@sparticuz/chromium` + `playwright-core` and set
  `PLAYWRIGHT_CHROMIUM_PATH` (small code change in `app/api/export/pdf/route.ts`).

**PPTX and the Group zip work on Vercel unchanged** — they need no browser.

---

## 6. Rate limiting

API routes (`/api/narrative`, `/api/export/*`) use an in-memory limiter
(`lib/rate-limit.ts`) — fine for a single instance. On Vercel (many instances)
back it with **Upstash Redis** for a shared counter; the `rateLimit()` call sites
stay the same.

---

## 7. Security headers

Set in `next.config.mjs` (`headers()`): `X-Content-Type-Options`,
`X-Frame-Options: SAMEORIGIN`, `Referrer-Policy`, `Permissions-Policy`, and HSTS.
A strict `Content-Security-Policy` is intentionally omitted (Recharts/`html-to-image`
use inline styles) — add a tuned CSP if your security posture requires it.

---

## 8. QA checklist (after seeding a full month for all 3 properties)

- [ ] Every dashboard section renders for BKDS / BKDU / BKV and the Group view.
- [ ] Empty states show where a section has no data (no crashes).
- [ ] Derived numbers match `lib/calculations.ts` — run `npm run test` (32 tests).
- [ ] Occupancy shows the exact ratio (e.g. `94.83%`), not a rounded value.
- [ ] PPTX export opens in PowerPoint/Keynote/Google Slides with tables + charts.
- [ ] MTD/YTD toggle, property switcher, and month picker all update the URL.
- [ ] With `AUTH_SECRET` set: signing out redirects to `/login`; a VIEWER cannot
      import or save narratives; an EDITOR only sees their assigned properties.
- [ ] Admin → Activity lists imports / edits / exports / final-locks.

---

## 9. Self-host on an Ubuntu VM (Oracle Cloud Always Free)

Full walkthrough for deploying to an **Oracle Cloud Always Free** VM. The DB
stays on Supabase (already migrated), so this only stands up the app. PDF export
works here because Chromium runs natively. Helper files live in `deploy/`.

> **Why Oracle "Ampere A1"?** The Next.js production build is memory-hungry. The
> AMD **Micro** free shape has only **1 GB RAM** and the build will OOM. Use an
> **Ampere A1 (ARM)** shape — the Always Free tier gives you up to **4 vCPU /
> 24 GB RAM**; even 1–2 vCPU / 6–12 GB is plenty. Node/Next/Prisma all have ARM
> builds, so ARM is fine.

### 9.1 Create the instance

1. **Compute → Instances → Create instance.**
2. **Image:** Canonical **Ubuntu 22.04** (or 24.04).
3. **Shape:** *Change shape → Ampere → VM.Standard.A1.Flex*. Set e.g. **2 OCPU /
   12 GB** (all within Always Free). Avoid the AMD Micro shape.
4. **SSH keys:** upload your public key (or let Oracle generate one and download
   the private key). You'll SSH in as user **`ubuntu`**.
5. **Networking:** keep "Assign a public IPv4 address" checked. Create/keep the
   default VCN. **Create.** Note the **public IP**.

### 9.2 Open ports 80 + 443 (the Oracle gotcha — do BOTH)

Oracle blocks traffic in **two** places. You must open ports in **both** or
HTTPS will silently hang.

**(a) VCN Security List (cloud firewall).** Networking → your VCN → the public
subnet → its **Security List** → **Add Ingress Rules**:

| Source CIDR | IP Protocol | Dest. port |
|---|---|---|
| `0.0.0.0/0` | TCP | `80` |
| `0.0.0.0/0` | TCP | `443` |

**(b) The instance's own OS firewall.** Ubuntu on Oracle ships with `iptables`
rules that drop everything but SSH. SSH in (next step) and run:

```bash
sudo iptables -I INPUT 6 -m state --state NEW -p tcp --dport 80 -j ACCEPT
sudo iptables -I INPUT 6 -m state --state NEW -p tcp --dport 443 -j ACCEPT
sudo netfilter-persistent save
```

(If you'll test IP-only on :3000 first, also open `3000` in both places, then
remove it once Caddy/HTTPS is up.)

### 9.3 SSH in and install the toolchain

```bash
ssh ubuntu@<public-ip>

sudo apt update && sudo apt upgrade -y
sudo apt install -y git build-essential

# Node 20 LTS (NodeSource)
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs
node -v   # v20.x
```

### 9.4 Clone the repo + create .env

The repo is private, so authenticate the clone. Easiest is a **GitHub Personal
Access Token** (repo scope) used as the password, or a deploy key. Clone into
the home directory so the path matches the systemd unit
(`/home/ubuntu/Saleshighligh`):

```bash
cd ~
git clone https://github.com/balibluekarmawebsite-max/saleshighligh.git Saleshighligh
cd Saleshighligh
git checkout claude/bk-sales-dashboard-setup-wetevl   # or main, once merged

cp deploy/env.vm.example .env
nano .env            # fill DATABASE_URL, DIRECT_URL, AUTH_SECRET, AUTH_URL, ANTHROPIC_API_KEY
chmod 600 .env
```

Generate `AUTH_SECRET` with `openssl rand -base64 32`. Set `AUTH_URL` to your
final `https://…` domain (or `http://<public-ip>:3000` for an IP-only smoke
test).

### 9.5 Install deps, build, create the admin

```bash
npm ci
npx prisma generate
npx playwright install --with-deps chromium   # for PDF export
npm run build                                 # ~1–3 min on A1; this is why you want RAM

# First admin (bcrypt-hashed). DB is already migrated on Supabase.
ADMIN_EMAIL=you@bluekarmasecrets.com ADMIN_PASSWORD='a-strong-password' npm run db:create-admin
```

> If `npm run build` ever gets OOM-killed on a smaller shape, add swap:
> `sudo fallocate -l 4G /swapfile && sudo chmod 600 /swapfile && sudo mkswap
> /swapfile && sudo swapon /swapfile` (persist in `/etc/fstab`).

### 9.6 Run it as a service (systemd)

Keeps the app alive across crashes and reboots.

```bash
sudo cp deploy/bk-dashboard.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now bk-dashboard
sudo systemctl status bk-dashboard     # should be active (running)
journalctl -u bk-dashboard -f          # live logs
```

The app now listens on `127.0.0.1:3000`. Quick check:
`curl -I http://localhost:3000` should return `200`.

### 9.7 HTTPS with a domain (Caddy)

You need a DNS name pointing at the public IP. Free option: **DuckDNS** —
create `something.duckdns.org` and set it to your IP. Then install Caddy (it
gets and renews the TLS cert automatically):

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

### 9.8 Updating the app later

```bash
cd ~/Saleshighligh
git pull
npm ci
npx prisma migrate deploy        # only if new migrations landed
npm run build
sudo systemctl restart bk-dashboard
```

### 9.9 AI narrative auth on the server

`ANTHROPIC_API_KEY` in `.env` is the simplest path. Alternatively log in once
with the Claude CLI on the server and set `ANTHROPIC_USE_PROFILE=true` (see
`deploy/env.vm.example`). Either way calls bill your **Anthropic API** account —
the CLI login is an auth convenience, **not** a way to bill a Claude.ai
subscription.

