#!/usr/bin/env bash
# Turnkey installer for the 07:00 WITA Daily Occupancy Pick-Up email.
# Installs the systemd service + timer, generates CRON_SECRET if missing, and
# warns if the SMTP / recipient env isn't set yet (the email no-ops without it).
#
#   sudo bash deploy/install-daily-report.sh
#
set -euo pipefail

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
SECRET=$(grep '^CRON_SECRET=' "$ENV" | head -1 | cut -d= -f2- | tr -d '"' | tr -d "'" | tr -d '[:space:]')
[ -n "$SECRET" ] || { echo "ERROR: CRON_SECRET is empty in $ENV." >&2; exit 1; }

# Warn (don't fail) when the email isn't configured yet.
missing=""
for key in SMTP_HOST SMTP_USER SMTP_PASS DAILY_REPORT_TO; do
  grep -q "^${key}=" "$ENV" || missing="$missing $key"
done
[ -z "$missing" ] || echo "WARNING: missing email env:$missing — the 07:00 job will no-op until these are set in $ENV (then restart the app)."

tee /etc/systemd/system/bk-daily-report.service >/dev/null <<UNIT
[Unit]
Description=BK daily Occupancy Pick-Up email
After=network.target bk-dashboard.service

[Service]
Type=oneshot
ExecStart=/usr/bin/curl -fsS -H "Authorization: Bearer ${SECRET}" http://127.0.0.1:3000/api/cron/daily-report
UNIT
chmod 600 /etc/systemd/system/bk-daily-report.service
cp "$APP/deploy/bk-daily-report.timer" /etc/systemd/system/bk-daily-report.timer 2>/dev/null \
  || tee /etc/systemd/system/bk-daily-report.timer >/dev/null <<'UNIT'
[Unit]
Description=Send the BK Daily Occupancy Pick-Up email every morning (07:00 WITA)
[Timer]
OnCalendar=*-*-* 07:00:00 Asia/Makassar
Persistent=true
[Install]
WantedBy=timers.target
UNIT

systemctl daemon-reload
systemctl enable --now bk-daily-report.timer
echo
echo "Installed. Next scheduled run:"
systemctl list-timers bk-daily-report --no-pager || true
echo
echo "Test it right now with:"
echo "  sudo systemctl start bk-daily-report.service && journalctl -u bk-daily-report.service -n 40 --no-pager"
