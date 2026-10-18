#!/bin/sh
# Pier container entrypoint — fix data-volume ownership, then drop privileges.
#
# Docker creates bind mounts (like ./data from compose.yaml) as root, which
# would make SQLite read-only for the app user and break every write with a
# confusing empty 500. The same trap hits most stateful containers; popular
# images (gethomepage/homepage, linuxserver/*) solve it the same way: start
# as root, chown the volume, then drop to an unprivileged user via su-exec.
#
# PUID/PGID (default 100:100, the image's `node` user) let you match your
# host user so the files in ./data are owned by you on the host as well.
set -e

PUID="${PUID:-100}"
PGID="${PGID:-100}"

if [ "$(id -u)" = "0" ]; then
  mkdir -p /app/data
  if ! chown -R "$PUID:$PGID" /app/data 2>/dev/null; then
    echo "pier: warning: could not chown /app/data to $PUID:$PGID (root-squashed NFS?)" >&2
  fi
  # Synology's Container Manager has been seen creating bind-mount dirs
  # without owner write (mode 555) — SQLite then can't even create its file.
  chmod -R u+rwX /app/data 2>/dev/null || true
  exec su-exec "$PUID:$PGID" "$@"
fi

# Started with `docker run --user` / compose `user:` — respect it untouched.
exec "$@"
