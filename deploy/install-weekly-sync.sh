#!/usr/bin/env bash
# Turnkey installer for the Friday 06:00 WITA weekly auto-sync.
# Installs the systemd service + timer, generates CRON_SECRET if missing, and
# warns if ADS_API_KEY isn't set (ads/ROAS won't sync without it).
#
#   sudo bash deploy/install-weekly-sync.sh
#
set -euo pipefail

# Locate the app dir (and its .env) from the running dashboard service.
APP=$(systemctl show -p WorkingDirectory --value bk-dashboard 2>/dev/null || true)
if [ -z "$APP" ] || [ ! -d "$APP" ]; then
  echo "ERROR: could not find the bk-dashboard WorkingDirectory. Is the app service installed?" >&2
  exit 1
fi
ENV="$APP/.env"
echo "App dir: $APP"
[ -f "$ENV" ] || { echo "ERROR: $ENV not found." >&2; exit 1; }

# Ensure CRON_SECRET exists (the endpoint refuses to run without it).
if ! grep -q '^CRON_SECRET=' "$ENV"; then
  echo "CRON_SECRET=\"$(openssl rand -base64 32)\"" >> "$ENV"
  echo "Added a new CRON_SECRET to $ENV — restarting the app to load it..."
  systemctl restart bk-dashboard
  sleep 2
fi
SECRET=$(grep '^CRON_SECRET=' "$ENV" | head -1 | cut -d= -f2- | tr -d '"'"'"' | tr -d "[:space:]")
[ -n "$SECRET" ] || { echo "ERROR: CRON_SECRET is empty in $ENV." >&2; exit 1; }

# Warn (don't fail) if ads key is missing — ads/ROAS can't sync without it.
ADS=$(grep '^ADS_API_KEY=' "$ENV" | head -1 | cut -d= -f2- | tr -d '"'"'"' | tr -d "[:space:]" || true)
[ -n "$ADS" ] || echo "WARNING: ADS_API_KEY is not set in $ENV — ROAS/Digital Ads will stay empty until it is."

# Write the units (secret inlined; service kept root-only).
tee /etc/systemd/system/bk-weekly-sync.service >/dev/null <<UNIT
[Unit]
Description=BK weekly Metricool + ads/ROAS auto-sync
After=network.target bk-dashboard.service

[Service]
Type=oneshot
ExecStart=/usr/bin/curl -fsS -H "Authorization: Bearer ${SECRET}" http://127.0.0.1:3000/api/cron/weekly-sync
UNIT
chmod 600 /etc/systemd/system/bk-weekly-sync.service
cp "$APP/deploy/bk-weekly-sync.timer" /etc/systemd/system/bk-weekly-sync.timer 2>/dev/null \
  || tee /etc/systemd/system/bk-weekly-sync.timer >/dev/null <<'UNIT'
[Unit]
Description=Run BK weekly auto-sync every Friday 06:00 Bali time
[Timer]
OnCalendar=Fri *-*-* 06:00:00 Asia/Makassar
Persistent=true
[Install]
WantedBy=timers.target
UNIT

systemctl daemon-reload
systemctl enable --now bk-weekly-sync.timer
echo
echo "Installed. Next scheduled run:"
systemctl list-timers bk-weekly-sync --no-pager || true
echo
echo "Test it right now with:"
echo "  sudo systemctl start bk-weekly-sync.service && journalctl -u bk-weekly-sync.service -n 40 --no-pager"
