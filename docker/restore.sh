#!/usr/bin/env bash
set -Eeuo pipefail

: "${PGHOST:=postgres}"
: "${PGPORT:=5432}"
: "${PGDATABASE:=dear_angel}"
: "${PGUSER:=dear_angel}"
: "${MINIO_ENDPOINT:=minio}"
: "${MINIO_PORT:=9000}"
: "${MINIO_BUCKET:=dear-angel-private}"
: "${MINIO_USE_SSL:=false}"

export PGHOST PGPORT PGDATABASE PGUSER

archive="${BACKUP_FILE:-}"
if [[ -z "${archive}" || ! -f "${archive}" ]]; then
  echo "BACKUP_FILE debe señalar un respaldo existente dentro de /backups." >&2
  exit 64
fi
case "${archive}" in
  /backups/dear-angel-*.tar.gz) ;;
  *)
    echo "El respaldo debe permanecer dentro de /backups y usar el nombre esperado." >&2
    exit 64
    ;;
esac

verify_archive() (
  local work_dir
  if [[ ! -f "${archive}.sha256" ]]; then
    echo "Falta el checksum externo ${archive}.sha256." >&2
    return 1
  fi
  (cd "$(dirname "${archive}")" && sha256sum -c "$(basename "${archive}.sha256")")
  if tar -tzf "${archive}" | grep -Eq '(^/|(^|/)\.\.(/|$))'; then
    echo "El archivo contiene rutas inseguras." >&2
    return 1
  fi
  work_dir="$(mktemp -d /tmp/dear-angel-verify-XXXXXX)"
  trap 'rm -rf -- "${work_dir}"' EXIT
  tar -xzf "${archive}" -C "${work_dir}"
  (cd "${work_dir}" && sha256sum -c CHECKSUMS.txt)
  pg_restore --list "${work_dir}/database.dump" >/dev/null
  test -f "${work_dir}/manifest.json"
  echo "[restore] Respaldo íntegro y compatible."
)

case "${1:-restore}" in
  verify)
    verify_archive
    exit 0
    ;;
  manifest)
    verify_archive >&2
    tar -xOzf "${archive}" ./manifest.json
    exit 0
    ;;
esac

if [[ "${ALLOW_RESTORE:-false}" != "true" ]]; then
  echo "La restauración requiere ALLOW_RESTORE=true." >&2
  exit 77
fi

verify_archive
work_dir="$(mktemp -d /tmp/dear-angel-restore-XXXXXX)"
trap 'rm -rf -- "${work_dir}"' EXIT
tar -xzf "${archive}" -C "${work_dir}"

echo "[restore] Restaurando PostgreSQL..."
pg_restore --no-owner --no-acl --file "${work_dir}/database.sql" \
  "${work_dir}/database.dump"
{
  printf 'DROP SCHEMA IF EXISTS public CASCADE;\n'
  printf 'CREATE SCHEMA public AUTHORIZATION :"db_user";\n'
  cat "${work_dir}/database.sql"
} | psql -X --single-transaction --set ON_ERROR_STOP=1 --set "db_user=${PGUSER}" \
  --dbname "${PGDATABASE}"

protocol="http"
if [[ "${MINIO_USE_SSL}" == "true" ]]; then protocol="https"; fi
echo "[restore] Restaurando almacenamiento privado..."
mc alias set target "${protocol}://${MINIO_ENDPOINT}:${MINIO_PORT}" \
  "${MINIO_ACCESS_KEY}" "${MINIO_SECRET_KEY}" >/dev/null
mc mb --ignore-existing "target/${MINIO_BUCKET}" >/dev/null
mc mirror --quiet --overwrite --remove "${work_dir}/minio" "target/${MINIO_BUCKET}"
echo "[restore] Restauración completada."
