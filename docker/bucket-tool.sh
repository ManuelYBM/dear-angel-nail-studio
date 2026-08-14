#!/usr/bin/env bash
set -Eeuo pipefail

action="${1:-}"
bucket="${2:-}"
if [[ ! "${bucket}" =~ ^dear-angel-restore-test-[a-f0-9]{12}$ ]]; then
  echo "El bucket aislado no tiene el nombre seguro esperado." >&2
  exit 64
fi

protocol="http"
if [[ "${MINIO_USE_SSL:-false}" == "true" ]]; then protocol="https"; fi
mc alias set test "${protocol}://${MINIO_ENDPOINT:-minio}:${MINIO_PORT:-9000}" \
  "${MINIO_ACCESS_KEY}" "${MINIO_SECRET_KEY}" >/dev/null

case "${action}" in
  count)
    mc find "test/${bucket}" | wc -l
    ;;
  remove)
    mc rb --force "test/${bucket}" >/dev/null 2>&1 || true
    ;;
  *)
    echo "Uso: bucket-tool.sh [count|remove] bucket" >&2
    exit 64
    ;;
esac
