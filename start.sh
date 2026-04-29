#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")"

if [ ! -f .env ]; then
  echo "ERROR: .env not found. Copy .env.example to .env and fill in values." >&2
  exit 1
fi

set -a
# shellcheck disable=SC1091
. ./.env
set +a

: "${CREATE_PASSWORD:?CREATE_PASSWORD is required}"
: "${SHARE_SECRET:?SHARE_SECRET is required}"
: "${HTTP_ADDR:=0.0.0.0:8090}"

exec ./pb/pocketbase serve \
  --http="$HTTP_ADDR" \
  --dir=pb_data \
  --hooksDir=pb_hooks \
  --migrationsDir=pb_migrations \
  --publicDir=public
