#!/usr/bin/env bash
# Kirim kode bot terbaru ke VPS lalu restart.
# Pakai: cd bot && ./deploy.sh
# Butuh alias SSH "bot2kuli" di ~/.ssh/config (lihat README).
set -euo pipefail
HOST="${BOT_HOST:-bot2kuli}"
cd "$(dirname "$0")"
node --check src/index.js
rsync -az --delete --exclude node_modules --exclude .DS_Store -e ssh ./ "$HOST:/opt/2kuli-bot/app/"
ssh "$HOST" 'cd /opt/2kuli-bot/app && chown -R bot:bot /opt/2kuli-bot && chmod 600 .env \
  && sudo -u bot -H npm ci --omit=dev --no-audit --no-fund --loglevel=error \
  && systemctl restart 2kuli-bot && sleep 8 && systemctl is-active 2kuli-bot \
  && journalctl -u 2kuli-bot -n 15 --no-pager -o cat | grep -v "Link undang"'
