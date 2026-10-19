#!/bin/sh
# Container start: bring the database on the volume up to date, optionally fill
# an empty one with demo data, then start the server. Upgrading = a new image.
set -e

db_file="${TAZRIM_DATABASE_URL#file:}"
data_dir="$(dirname "$db_file")"

# Started as root (the default): make the data directory belong to the app user,
# so a bind mount or a backup restored with `docker compose cp` stays writable,
# then re-run this script as that user. Nothing below runs as root.
if [ "$(id -u)" = "0" ]; then
  mkdir -p "$data_dir"
  chown -R node:node "$data_dir"
  exec setpriv --reuid=node --regid=node --init-groups "$0" "$@"
fi

echo "tazrim: applying database migrations to $db_file"
node /opt/prisma-cli/node_modules/prisma/build/index.js migrate deploy --schema /app/prisma/schema.prisma

if [ "$TAZRIM_DEMO" = "1" ]; then
  node /app/scripts/seed-demo.mjs "$db_file" --data-only
fi

exec node /app/server.js
