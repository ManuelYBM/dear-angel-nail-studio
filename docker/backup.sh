#!/usr/bin/env bash
set -Eeuo pipefail

: "${PGHOST:=postgres}"
: "${PGPORT:=5432}"
: "${PGDATABASE:=dear_angel}"
: "${PGUSER:=dear_angel}"
: "${BACKUP_INTERVAL_SECONDS:=604800}"
: "${BACKUP_RETENTION_DAYS:=90}"
: "${MINIO_ENDPOINT:=minio}"
: "${MINIO_PORT:=9000}"
: "${MINIO_BUCKET:=dear-angel-private}"
: "${MINIO_USE_SSL:=false}"

export PGHOST PGPORT PGDATABASE PGUSER

backup_once() (
  local stamp work_dir archive temporary_archive protocol
  stamp="$(date -u +%Y%m%dT%H%M%SZ)"
  work_dir="$(mktemp -d "/backups/.incomplete-${stamp}-XXXXXX")"
  archive="/backups/dear-angel-${stamp}.tar.gz"
  temporary_archive="${archive}.tmp"
  protocol="http"
  if [[ "${MINIO_USE_SSL}" == "true" ]]; then protocol="https"; fi

  cleanup() {
    rm -rf -- "${work_dir}"
    rm -f -- "${temporary_archive}"
  }
  trap cleanup EXIT

  echo "[backup] Exportando PostgreSQL..."
  pg_dump --format=custom --compress=9 --no-owner --no-acl --file "${work_dir}/database.dump"

  echo "[backup] Copiando archivos privados..."
  mkdir -p "${work_dir}/minio"
  mc alias set source "${protocol}://${MINIO_ENDPOINT}:${MINIO_PORT}" \
    "${MINIO_ACCESS_KEY}" "${MINIO_SECRET_KEY}" >/dev/null
  mc stat "source/${MINIO_BUCKET}" >/dev/null
  mc mirror --quiet "source/${MINIO_BUCKET}" "${work_dir}/minio"

  cat >"${work_dir}/manifest.json" <<EOF
{
  "formatVersion": 1,
  "createdAt": "$(date -u +%Y-%m-%dT%H:%M:%SZ)",
  "database": "${PGDATABASE}",
  "storageBucket": "${MINIO_BUCKET}"
}
EOF
  (
    cd "${work_dir}"
    find . -type f ! -name CHECKSUMS.txt -print0 | sort -z | xargs -0 sha256sum >CHECKSUMS.txt
  )
  tar -czf "${temporary_archive}" -C "${work_dir}" .
  mv -- "${temporary_archive}" "${archive}"
  sha256sum "${archive}" >"${archive}.sha256"
  echo "[backup] Respaldo listo: $(basename "${archive}")"

  find /backups -maxdepth 1 -type f \
    \( -name 'dear-angel-*.tar.gz' -o -name 'dear-angel-*.tar.gz.sha256' \) \
    -mtime "+${BACKUP_RETENTION_DAYS}" -delete
)

case "${1:-daemon}" in
  once)
    backup_once
    ;;
  daemon)
    backup_once
    touch /tmp/backup-ready
    while true; do
      sleep "${BACKUP_INTERVAL_SECONDS}"
      if ! backup_once; then
        echo "[backup] El intento programado falló; se reintentará en el siguiente intervalo." >&2
      fi
    done
    ;;
  *)
    echo "Uso: backup.sh [once|daemon]" >&2
    exit 64
    ;;
esac
