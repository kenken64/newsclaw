#!/bin/sh
set -eu

if [ -z "${WEBAUTHN_ORIGIN:-}" ] && [ -n "${RAILWAY_PUBLIC_DOMAIN:-}" ]; then
  export WEBAUTHN_ORIGIN="https://${RAILWAY_PUBLIC_DOMAIN}"
fi

if [ -z "${WEBAUTHN_RP_ID:-}" ] && [ -n "${RAILWAY_PUBLIC_DOMAIN:-}" ]; then
  export WEBAUTHN_RP_ID="${RAILWAY_PUBLIC_DOMAIN}"
fi

if [ -z "${SQLITE_DATA_DIR:-}" ] && [ -n "${RAILWAY_VOLUME_MOUNT_PATH:-}" ]; then
  export SQLITE_DATA_DIR="${RAILWAY_VOLUME_MOUNT_PATH}"
fi

mkdir -p "${SQLITE_DATA_DIR:-/app/data}"

exec npm run start -- --hostname 0.0.0.0 --port "${PORT:-3000}"