#!/usr/bin/env bash
#
# Achievements Passport - one-shot deploy script for the LXC container (CT 109).
# Target: Debian 13 (trixie), run as root.
#
#   bash deploy.sh
#
# Installs the latest Node.js LTS, clones the repo from GitHub, installs deps,
# builds the frontend, and registers the systemd service.

set -euo pipefail

# === CONFIGURATION =========================================================
REPO_URL="https://github.com/MohandL3G/Achievements-Passport.git"
APP_DIR="/opt/achievements-passport"
SERVER_DIR="$APP_DIR/host/server"
FRONTEND_DIR="$APP_DIR/host/frontend"
SERVICE_NAME="achievements-passport"
UNIT_SRC="$APP_DIR/achievements-passport.service"   # deployed from repo root
# ===========================================================================

log() { printf '\033[1;32m[deploy]\033[0m %s\n' "$*"; }
die() { printf '\033[1;31m[deploy] ERROR:\033[0m %s\n' "$*" >&2; exit 1; }

[ "$(id -u)" -eq 0 ] || die "run as root (sudo bash deploy.sh)"
command -v apt-get >/dev/null 2>&1 || die "this script is for Debian/Ubuntu (apt) hosts"

log "System packages..."
export DEBIAN_FRONTEND=noninteractive
apt-get update
apt-get install -y curl ca-certificates gnupg git build-essential

if ! command -v node >/dev/null 2>&1; then
  log "Installing latest Node.js LTS via NodeSource..."
  curl -fsSL https://deb.nodesource.com/setup_lts.x | bash -
  apt-get install -y nodejs
fi
log "Node: $(node --version) | npm: $(npm --version)"

log "Cloning repository..."
mkdir -p /opt
if [ ! -d "$APP_DIR/.git" ]; then
  git clone "$REPO_URL" "$APP_DIR"
else
  git -C "$APP_DIR" fetch --prune
  git -C "$APP_DIR" checkout main
  git -C "$APP_DIR" pull --ff-only
fi

log "Installing server dependencies..."
cd "$SERVER_DIR"
npm install --omit=dev

if [ ! -f "$SERVER_DIR/.env" ]; then
  log "Creating .env from example (edit it with real values, then restart)."
  cp .env.example .env
fi

log "Installing frontend dependencies + building..."
cd "$FRONTEND_DIR"
npm install
npm run build

if [ ! -d "$FRONTEND_DIR/dist" ]; then
  die "frontend build produced no dist/ directory"
fi

log "Installing systemd unit..."
[ -f "$UNIT_SRC" ] || die "missing achievements-passport.service in repo root"
cp "$UNIT_SRC" "/etc/systemd/system/$SERVICE_NAME.service"
systemctl daemon-reload
systemctl enable "$SERVICE_NAME"
systemctl restart "$SERVICE_NAME"

log "Waiting for the server to come up..."
HEALTH="http://127.0.0.1:3281/api/health"
for i in $(seq 1 15); do
  if curl -fsS "$HEALTH" >/dev/null 2>&1; then
    log "Server is up: $HEALTH"
    break
  fi
  [ "$i" -eq 15 ] && die "server did not become healthy - check: journalctl -u $SERVICE_NAME -e"
  sleep 2
done

cat <<EOF

=== DEPLOYED ===
  App dir      : $APP_DIR
  .env         : $SERVER_DIR/.env   (EDIT with real secrets, then: systemctl restart $SERVICE_NAME)
  Service      : systemctl status $SERVICE_NAME
  Logs         : journalctl -fu $SERVICE_NAME
  Local health : $HEALTH

Next steps:
  1. Fill in STEAM_API_KEY, OWNER_STEAMID, COOKIE_SECRET, ENCRYPTION_SECRET, ADMIN_PASSWORD
     in $SERVER_DIR/.env
  2. systemctl restart $SERVICE_NAME
  3. Verify from the LAN: curl http://<CT-IP>:3281/api/health
  4. Point Nginx Proxy Manager at <CT-IP>:3281 and expose passport.mohandl3g.ly
EOF