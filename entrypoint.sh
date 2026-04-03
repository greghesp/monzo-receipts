#!/bin/sh
set -e

# Resolve the data directory from DB_PATH (default: /data)
DATA_DIR=$(dirname "${DB_PATH:-/data/db.sqlite}")

# Ensure the directory exists and is owned by the app user
mkdir -p "$DATA_DIR"
chown -R nextjs:nodejs "$DATA_DIR"

# Drop privileges and start the server
exec gosu nextjs node /app/server.js
