#!/usr/bin/env bash
# Pier installer — deploy the dashboard as a systemd service on a bare Linux server.
#
#   curl -fsSL https://raw.githubusercontent.com/butageek/pier/main/install.sh | sudo bash
#
# Downloads the prebuilt release bundle (seconds — nothing is compiled) and
# falls back to building from source only when no bundle is available.
# If the server has no Node >= 20, a private copy is downloaded into $PIER_DIR/node;
# nothing outside $PIER_DIR and /etc/systemd/system is ever touched.
#
# Options (environment variables):
#   PIER_DIR=/opt/pier           install location (data/ lives inside it)
#   PIER_PORT=3000               port the dashboard listens on
#   PIER_RELEASE=latest          a tag like v0.2.0 to pin a version
#   PIER_BUILD_FROM_SOURCE=1     skip the prebuilt bundle and compile locally
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
# download under $PIER_DIR/node.
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

# --- resolve the release ---------------------------------------------------------
tag="$PIER_RELEASE"
release=""
if [ "$tag" = "latest" ]; then
  release=$(curl -fsSL "https://api.github.com/repos/$REPO/releases/latest") || true
  [ -n "$release" ] || die "could not resolve the latest release (rate-limited? set PIER_RELEASE=v0.2.0)"
  tag=$(printf '%s' "$release" | grep -o '"tag_name": *"[^"]*"' | head -n 1 | cut -d'"' -f4)
fi
if [ -z "$release" ]; then
  release=$(curl -fsSL "https://api.github.com/repos/$REPO/releases/tags/$tag") || true
fi
bundle=""
if [ -n "$release" ]; then
  bundle=$(printf '%s' "$release" | grep -o '"browser_download_url": *"[^"]*pier-standalone\.tar\.gz"' | head -n 1 | cut -d'"' -f4)
fi

# --- fetch the app: prebuilt bundle when available, source build otherwise --------
if [ -n "$bundle" ] && [ "${PIER_BUILD_FROM_SOURCE:-0}" != "1" ]; then
  log "downloading Pier $tag (prebuilt bundle — no build step)"
  curl -fL "$bundle" | tar -xz -C "$stage"
else
  log "downloading Pier $tag source and building locally (slower)"
  curl -fL "https://codeload.github.com/$REPO/tar.gz/refs/tags/$tag" | tar -xz --strip-components=1 -C "$stage"

  # --- build the standalone server -------------------------------------------------
  # Next.js production builds want ~2 GB of memory; small VPSes need a temporary
  # swapfile to get through one. Removed when the script exits.
  tmp_swap=""
  cleanup() {
    if [ -n "$tmp_swap" ] && [ -e "$tmp_swap" ]; then
      swapoff "$tmp_swap" 2>/dev/null || true
      rm -f "$tmp_swap"
    fi
  }
  trap cleanup EXIT
  mem_and_swap=$(free -m | awk '/^Mem:/ {m=$2} /^Swap:/ {s=$2} END {print m+s}')
  if [ "$mem_and_swap" -lt 3000 ]; then
    log "adding a temporary 2G swapfile for the build (removed afterwards)"
    tmp_swap="/pier-build.swap"
    swapoff "$tmp_swap" 2>/dev/null || true
    rm -f "$tmp_swap"
    if fallocate -l 2G "$tmp_swap" 2>/dev/null || dd if=/dev/zero of="$tmp_swap" bs=1M count=2048 status=none; then
      chmod 600 "$tmp_swap"
      if ! swapon "$tmp_swap" 2>/dev/null; then
        rm -f "$tmp_swap"
        tmp_swap=""
        log "swap could not be enabled (unsupported filesystem?) — continuing without it"
      fi
    else
      tmp_swap=""
    fi
  fi

  log "building — this can take a few minutes"
  # --ignore-scripts: better-sqlite3 ships prebuilt binaries for every platform
  # and loads them at runtime; without this, older npm auto-runs node-gyp for its
  # binding.gyp and a clean server (no make/g++) fails the install.
  build_node="$stage/node/bin/node"
  [ -x "$build_node" ] || build_node="$NODE_BIN"
  cd "$stage"
  PATH="$(dirname "$build_node"):$PATH" npm ci --ignore-scripts --no-audit --no-fund
  PATH="$(dirname "$build_node"):$PATH" npm run build
  cp -r .next/static .next/standalone/.next/static
  rm -rf node_modules .next/cache # the standalone tree is self-contained
fi

# Carry over the bundled Node runtime and the database from a previous install.
for keep in node data; do
  if [ -d "$PIER_DIR/$keep" ]; then mv "$PIER_DIR/$keep" "$stage/$keep"; fi
done

# --- locate the server entry point (bundle: server.js at root; source: .next) -----
if [ -f "$stage/server.js" ]; then
  entry="server.js"
elif [ -f "$stage/.next/standalone/server.js" ]; then
  entry=".next/standalone/server.js"
else
  die "could not find the Pier server in $stage"
fi
# Bundled Node lands at its final location when the directory below is swapped.
if [ -z "$NODE_BIN" ]; then NODE_BIN="$PIER_DIR/node/bin/node"; fi

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
ExecStart=$NODE_BIN $PIER_DIR/$entry
Restart=on-failure
RestartSec=5

[Install]
WantedBy=multi-user.target
UNIT
systemctl daemon-reload
systemctl enable --now pier

# --- wait for it to answer ----------------------------------------------------------------
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
