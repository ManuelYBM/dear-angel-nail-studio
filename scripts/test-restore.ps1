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
  throw 'Los destinos aislados no pasaron la validacion de seguridad.'
}

$name = [IO.Path]::GetFileName($resolved)
Set-Location -LiteralPath $workspace
docker compose up -d postgres minio
if ($LASTEXITCODE -ne 0) { throw 'No fue posible iniciar PostgreSQL y MinIO.' }
$databaseUser = (docker compose exec -T postgres printenv POSTGRES_USER).Trim()
$databaseName = (docker compose exec -T postgres printenv POSTGRES_DB).Trim()
if (-not $databaseUser -or -not $databaseName) { throw 'No se pudo leer la configuracion de PostgreSQL.' }
$manifestOutput = docker compose --profile tools run --rm -e "BACKUP_FILE=/backups/$name" restore manifest
if ($LASTEXITCODE -ne 0) { throw 'No se pudo leer el manifiesto verificado del respaldo.' }
$manifest = ($manifestOutput -join "`n") | ConvertFrom-Json
if ($manifest.formatVersion -lt 2) {
  throw 'El respaldo usa un manifiesto antiguo sin conteos verificables. Genera uno nuevo.'
}

try {
  docker compose exec -T postgres createdb -U $databaseUser $testDatabase
  if ($LASTEXITCODE -ne 0) { throw 'No fue posible crear la base aislada.' }

  docker compose --profile tools run --rm -e "BACKUP_FILE=/backups/$name" -e 'ALLOW_RESTORE=true' -e "PGDATABASE=$testDatabase" -e "MINIO_BUCKET=$testBucket" restore
  if ($LASTEXITCODE -ne 0) { throw 'La restauracion aislada no pudo completarse.' }

  $restoredUsers = (docker compose exec -T postgres psql -U $databaseUser -d $testDatabase -tA -c 'SELECT count(*) FROM users;').Trim()
  $restoredMigrations = (docker compose exec -T postgres psql -U $databaseUser -d $testDatabase -tA -c 'SELECT count(*) FROM _prisma_migrations WHERE finished_at IS NOT NULL;').Trim()
  $restoredObjects = (docker compose run --rm --entrypoint /opt/dear-angel/bucket-tool.sh backup count $testBucket).Trim()

  if ([int]$manifest.storageObjectCount -ne [int]$restoredObjects) {
    throw "Se restauraron $restoredObjects objetos y el respaldo declara $($manifest.storageObjectCount)."
  }

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
