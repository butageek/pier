#!/usr/bin/env bash
# Pier installer — deploy the dashboard as a systemd service on a bare Linux server.
#
#   curl -fsSL https://raw.githubusercontent.com/butageek/pier/main/install.sh | sudo bash
#
# Options (environment variables):
#   PIER_DIR=/opt/pier     install location (data/ lives inside it)
#   PIER_PORT=3000         port the dashboard listens on
#   PIER_RELEASE=latest    a tag like v0.1.0 to pin a version
#
# Re-running the script upgrades in place; the SQLite database in $PIER_DIR/data
# is carried over. Uninstall:
#   systemctl disable --now pier && rm -rf /opt/pier /etc/systemd/system/pier.service

set -euo pipefail

REPO="butageek/pier"
PIER_DIR="${PIER_DIR:-/opt/pier}"
PIER_PORT="${PIER_PORT:-3000}"
PIER_RELEASE="${PIER_RELEASE:-latest}"

log() { printf '\033[1;32m==>\033[0m %s\n' "$*"; }
die() { printf '\033[1;31merror:\033[0m %s\n' "$*" >&2; exit 1; }

[ "$(uname -s)" = "Linux" ] || die "this installer is for Linux servers"
[ "$(id -u)" = 0 ] || die "run as root: curl ... | sudo bash"
command -v systemctl >/dev/null 2>&1 || die "systemd not found"
command -v curl >/dev/null 2>&1 || die "curl not found (install it with your package manager)"
command -v tar >/dev/null 2>&1 || die "tar not found (install it with your package manager)"

# --- resolve a Node >= 20 runtime ---------------------------------------------
# Preference: system Node, then a previously bundled copy, then a self-contained
# download under $PIER_DIR/node — nothing outside $PIER_DIR is ever touched.
arch=$(uname -m)
case "$arch" in
  x86_64) arch=x64 ;;
  aarch64 | arm64) arch=arm64 ;;
  *) die "unsupported architecture: $(uname -m)" ;;
esac
libc=glibc
if ldd --version 2>&1 | grep -qi musl; then libc=musl; fi
# Node.js tarball naming: glibc builds carry no libc suffix, musl ones do.
libc_suffix=""
if [ "$libc" = musl ]; then libc_suffix="-musl"; fi

node_ok() { [ -x "$1" ] && "$1" -p 'process.versions.node.split(".")[0] >= 20' 2>/dev/null | grep -q true; }

NODE_BIN="" # absolute path used by the systemd unit (survives the directory swap)
if command -v node >/dev/null 2>&1 && node_ok "$(command -v node)"; then
  NODE_BIN="$(command -v node)"
fi

stage="$PIER_DIR.new"
rm -rf "$stage"
mkdir -p "$stage"

# Bundle a Node runtime when the system doesn't provide a suitable one.
if [ -z "$NODE_BIN" ] && [ ! -x "$PIER_DIR/node/bin/node" ]; then
  log "downloading Node.js (linux-$arch-$libc) into $PIER_DIR/node"
  fname=$(curl -fsSL "https://nodejs.org/dist/latest-v24.x/" \
    | grep -o "node-v2[0-9.]*-linux-$arch$libc_suffix\.tar\.gz" | head -n 1) || true
  [ -n "$fname" ] || die "no official Node.js build for $arch/$libc — install Node >= 20 with your package manager (e.g. apk add nodejs npm) and re-run"
  mkdir -p "$stage/node"
  curl -fL "https://nodejs.org/dist/latest-v24.x/$fname" | tar -xz --strip-components=1 -C "$stage/node"
fi

# --- fetch the source ------------------------------------------------------------
if [ "$PIER_RELEASE" = "latest" ]; then
  src=$(curl -fsSL "https://api.github.com/repos/$REPO/releases/latest" \
    | grep -o '"tarball_url": *"[^"]*"' | head -n 1 | cut -d'"' -f4) || true
  [ -n "$src" ] || die "could not resolve the latest release (rate-limited? set PIER_RELEASE=v0.1.0)"
else
  src="https://codeload.github.com/$REPO/tar.gz/refs/tags/$PIER_RELEASE"
fi
log "downloading Pier ($PIER_RELEASE) into $stage"
curl -fL "$src" | tar -xz --strip-components=1 -C "$stage"

# Carry over the bundled Node runtime and the database from a previous install.
for keep in node data; do
  if [ -d "$PIER_DIR/$keep" ]; then mv "$PIER_DIR/$keep" "$stage/$keep"; fi
done

# --- build the standalone server ---------------------------------------------------
# Build-time runtime: the bundled copy (in the staging dir) or the system Node.
build_node="$stage/node/bin/node"
if [ -z "$NODE_BIN" ]; then
  build_node="$stage/node/bin/node"
  NODE_BIN="$PIER_DIR/node/bin/node" # final location after the swap below
else
  build_node="$NODE_BIN"
fi
[ -x "$build_node" ] || die "no Node runtime available"
log "building with $($build_node --version) (this takes a minute)"
cd "$stage"
# --ignore-scripts: better-sqlite3 ships prebuilt binaries for every platform
# and loads them at runtime; without this, older npm auto-runs node-gyp for its
# binding.gyp and a clean server (no make/g++) fails the install.
PATH="$(dirname "$build_node"):$PATH" npm ci --ignore-scripts --no-audit --no-fund
PATH="$(dirname "$build_node"):$PATH" npm run build
cp -r .next/static .next/standalone/.next/static
rm -rf node_modules .next/cache # the standalone tree is self-contained

# --- swap into place ----------------------------------------------------------------
log "installing to $PIER_DIR"
systemctl stop pier 2>/dev/null || true
if [ -d "$PIER_DIR" ]; then
  old="$PIER_DIR.old.$(date +%s)"
  mv "$PIER_DIR" "$old"
  rm -rf "$old"
fi
mv "$stage" "$PIER_DIR"

# --- service user ---------------------------------------------------------------------
if ! id pier >/dev/null 2>&1; then
  if command -v useradd >/dev/null 2>&1; then
    useradd --system --user-group --home-dir "$PIER_DIR" --shell /usr/sbin/nologin pier
  else
    adduser -S -D -H -h "$PIER_DIR" -s /sbin/nologin pier
  fi
fi
chown -R pier:pier "$PIER_DIR"

# --- systemd unit ----------------------------------------------------------------------
log "enabling pier.service"
cat >/etc/systemd/system/pier.service <<UNIT
[Unit]
Description=Pier — a dock for your self-hosted services
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
User=pier
WorkingDirectory=$PIER_DIR
Environment=NODE_ENV=production
Environment=HOSTNAME=0.0.0.0
Environment=PORT=$PIER_PORT
ExecStart=$NODE_BIN $PIER_DIR/.next/standalone/server.js
Restart=on-failure
RestartSec=5

[Install]
WantedBy=multi-user.target
UNIT
systemctl daemon-reload
systemctl enable --now pier

# --- wait for it to answer -----------------------------------------------------------------
log "waiting for Pier on port $PIER_PORT"
ok=""
for _ in $(seq 1 20); do
  if curl -sf "http://127.0.0.1:$PIER_PORT/" >/dev/null; then ok=1; break; fi
  sleep 1
done
[ -n "$ok" ] || die "service started but did not answer on http://127.0.0.1:$PIER_PORT/ — check: journalctl -u pier -e"

printf '\nPier is up: http://<this-host>:%s\n' "$PIER_PORT"
printf '  app + database : %s (SQLite in %s/data — back this up)\n' "$PIER_DIR" "$PIER_DIR"
printf '  service        : systemctl status pier | restart pier | journalctl -u pier -f\n'
printf '  upgrade        : re-run this script\n'
printf '  uninstall      : systemctl disable --now pier && rm -rf %s /etc/systemd/system/pier.service\n' "$PIER_DIR"
