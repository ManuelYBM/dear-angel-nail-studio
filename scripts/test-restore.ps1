[CmdletBinding()]
param(
  [string]$BackupFile
)

$ErrorActionPreference = 'Stop'
$workspace = Split-Path -Parent $PSScriptRoot
$backupRoot = [IO.Path]::GetFullPath((Join-Path $workspace 'backups'))
if (-not $BackupFile) {
  $BackupFile = (Get-ChildItem -LiteralPath $backupRoot -Filter 'dear-angel-*.tar.gz' |
    Sort-Object LastWriteTime -Descending |
    Select-Object -First 1).FullName
}
if (-not $BackupFile) { throw 'No existe un respaldo para ensayar.' }
$resolved = [IO.Path]::GetFullPath((Resolve-Path -LiteralPath $BackupFile).Path)
if (-not $resolved.StartsWith($backupRoot + [IO.Path]::DirectorySeparatorChar, [StringComparison]::OrdinalIgnoreCase)) {
  throw 'El archivo debe estar dentro de la carpeta backups del proyecto.'
}

$suffix = [Guid]::NewGuid().ToString('N').Substring(0, 12)
$testDatabase = "dear_angel_restore_test_$suffix"
$testBucket = "dear-angel-restore-test-$suffix"
if ($testDatabase -notmatch '^dear_angel_restore_test_[a-f0-9]{12}$' -or
    $testBucket -notmatch '^dear-angel-restore-test-[a-f0-9]{12}$') {
  throw 'Los destinos aislados no pasaron la validación de seguridad.'
}

$name = [IO.Path]::GetFileName($resolved)
Set-Location -LiteralPath $workspace
docker compose up -d postgres minio
if ($LASTEXITCODE -ne 0) { throw 'No fue posible iniciar PostgreSQL y MinIO.' }
$databaseUser = (docker compose exec -T postgres printenv POSTGRES_USER).Trim()
$databaseName = (docker compose exec -T postgres printenv POSTGRES_DB).Trim()
if (-not $databaseUser -or -not $databaseName) { throw 'No se pudo leer la configuración de PostgreSQL.' }

try {
  docker compose exec -T postgres createdb -U $databaseUser $testDatabase
  if ($LASTEXITCODE -ne 0) { throw 'No fue posible crear la base aislada.' }

  docker compose --profile tools run --rm -e "BACKUP_FILE=/backups/$name" -e 'ALLOW_RESTORE=true' -e "PGDATABASE=$testDatabase" -e "MINIO_BUCKET=$testBucket" restore
  if ($LASTEXITCODE -ne 0) { throw 'La restauración aislada no pudo completarse.' }

  $sourceUsers = (docker compose exec -T postgres psql -U $databaseUser -d $databaseName -tA -c 'SELECT count(*) FROM users;').Trim()
  $restoredUsers = (docker compose exec -T postgres psql -U $databaseUser -d $testDatabase -tA -c 'SELECT count(*) FROM users;').Trim()
  $restoredMigrations = (docker compose exec -T postgres psql -U $databaseUser -d $testDatabase -tA -c 'SELECT count(*) FROM _prisma_migrations WHERE finished_at IS NOT NULL;').Trim()
  $restoredObjects = (docker compose run --rm --entrypoint /opt/dear-angel/bucket-tool.sh backup count $testBucket).Trim()

  if ($sourceUsers -ne $restoredUsers) {
    throw "La base restaurada contiene $restoredUsers usuarios y el origen $sourceUsers."
  }
  if ([int]$restoredMigrations -lt 13) { throw 'El historial de migraciones restaurado está incompleto.' }
  if ([int]$restoredObjects -lt 1) { throw 'El almacenamiento restaurado está vacío.' }

  [pscustomobject]@{
    Database = $testDatabase
    Users = [int]$restoredUsers
    AppliedMigrations = [int]$restoredMigrations
    RestoredObjects = [int]$restoredObjects
    Status = 'OK'
  }
}
finally {
  docker compose exec -T postgres psql -U $databaseUser -d postgres -c "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = '$testDatabase';" | Out-Null
  docker compose exec -T postgres dropdb -U $databaseUser --if-exists $testDatabase | Out-Null
  docker compose run --rm --entrypoint /opt/dear-angel/bucket-tool.sh backup remove $testBucket | Out-Null
}
