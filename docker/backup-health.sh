#!/usr/bin/env sh
set -eu

status_file="${BACKUP_HEALTH_MARKER:-/backups/.last-success}"
test -s "${status_file}"

last_success="$(cat "${status_file}")"
case "${last_success}" in
  *[!0-9]*|'') exit 1 ;;
esac

now="$(date -u +%s)"
interval="${BACKUP_INTERVAL_SECONDS:-604800}"
grace="${BACKUP_HEALTH_GRACE_SECONDS:-3600}"
age=$((now - last_success))

test "${age}" -ge 0
test "${age}" -le $((interval + grace))
