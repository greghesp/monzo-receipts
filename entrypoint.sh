#!/bin/sh
set -e

# Resolve the data directory from DB_PATH (default: /data)
DATA_DIR=$(dirname "${DB_PATH:-/data/db.sqlite}")

# Support PUID/PGID for volume permission compatibility (e.g. Unraid).
# Defaults match the nextjs user baked into the image (uid/gid 1001).
PUID=${PUID:-1001}
PGID=${PGID:-1001}

# Ensure the directory exists and is owned by the target user
mkdir -p "$DATA_DIR"
chown -R "${PUID}:${PGID}" "$DATA_DIR"

# Drop privileges and start the server
exec gosu "${PUID}:${PGID}" node /app/server.js
