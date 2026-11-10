#!/usr/bin/env bash
# Turnkey installer for the 09:00 WITA scraper-health check. Installs the systemd
# service + timer and reuses the app's CRON_SECRET (same one the daily-report and
# weekly-sync timers use). The check reuses the Daily Report's SMTP + recipient
# config for its alert email, so nothing extra is needed to send alerts.
#
#   sudo bash deploy/install-scraper-check.sh
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

# Note (don't fail) whether auto-recover is on.
if grep -qiE '^SCRAPER_AUTO_RECOVER=(1|true|yes|on)' "$ENV"; then
  echo "SCRAPER_AUTO_RECOVER is ON — a missing critical feed will queue a daily re-pull (section D)."
  echo "  Make sure the office-PC scraper handles section-D jobs (see SCRAPER_MONITORING.md)."
else
  echo "SCRAPER_AUTO_RECOVER is off — the check will record + email gaps but not queue re-pulls."
  echo "  Turn it on by adding SCRAPER_AUTO_RECOVER=1 to $ENV (then restart the app)."
fi

tee /etc/systemd/system/bk-scraper-check.service >/dev/null <<UNIT
[Unit]
Description=BK scraper-health check (daily feeds arrived?)
After=network.target bk-dashboard.service

[Service]
Type=oneshot
ExecStart=/usr/bin/curl -fsS -H "Authorization: Bearer ${SECRET}" http://127.0.0.1:3000/api/cron/scraper-check
UNIT
chmod 600 /etc/systemd/system/bk-scraper-check.service
cp "$APP/deploy/bk-scraper-check.timer" /etc/systemd/system/bk-scraper-check.timer 2>/dev/null \
  || tee /etc/systemd/system/bk-scraper-check.timer >/dev/null <<'UNIT'
[Unit]
Description=Run the BK scraper-health check every morning (09:00 WITA)
[Timer]
OnCalendar=*-*-* 09:00:00 Asia/Makassar
Persistent=true
[Install]
WantedBy=timers.target
UNIT

systemctl daemon-reload
systemctl enable --now bk-scraper-check.timer
echo
echo "Installed. Next scheduled run:"
systemctl list-timers bk-scraper-check --no-pager || true
echo
echo "Test it right now with:"
echo "  sudo systemctl start bk-scraper-check.service && journalctl -u bk-scraper-check.service -n 40 --no-pager"
