[CmdletBinding()]
param(
  [Parameter(Mandatory = $true)]
  [string]$BackupFile,

  [switch]$ConfirmRestore
)

$ErrorActionPreference = 'Stop'
if (-not $ConfirmRestore) {
  throw 'La restauracion reemplaza la base y los archivos actuales. Repite con -ConfirmRestore.'
}

$workspace = Split-Path -Parent $PSScriptRoot
$backupRoot = [IO.Path]::GetFullPath((Join-Path $workspace 'backups'))
$resolved = [IO.Path]::GetFullPath((Resolve-Path -LiteralPath $BackupFile).Path)
if (-not $resolved.StartsWith($backupRoot + [IO.Path]::DirectorySeparatorChar, [StringComparison]::OrdinalIgnoreCase)) {
  throw 'El archivo debe estar dentro de la carpeta backups del proyecto.'
}
if (-not $resolved.EndsWith('.tar.gz', [StringComparison]::OrdinalIgnoreCase)) {
  throw 'Selecciona un respaldo .tar.gz.'
}

$name = [IO.Path]::GetFileName($resolved)
Set-Location -LiteralPath $workspace

# Verifica integridad y compatibilidad antes de detener cualquier servicio. La
# restauracion vuelve a verificar dentro del contenedor justo antes de mutar.
docker compose --profile tools run --rm --no-deps -e "BACKUP_FILE=/backups/$name" restore verify
if ($LASTEXITCODE -ne 0) { throw 'El respaldo no supero la verificacion de integridad.' }

$managedServices = @('web', 'api', 'worker', 'backup')
$runningServices = @(
  docker compose ps --services --status running
) | Where-Object { $managedServices -contains $_ }
if ($LASTEXITCODE -ne 0) { throw 'No se pudo consultar el estado actual de los servicios.' }
$restartingServices = @(
  docker ps --filter 'label=com.docker.compose.project=dear-angel' --filter 'status=restarting' --format '{{.Label "com.docker.compose.service"}}'
) | Where-Object { $managedServices -contains $_ }
if ($LASTEXITCODE -ne 0) { throw 'No se pudo consultar servicios en reinicio.' }
$runningServices = @($runningServices + $restartingServices | Select-Object -Unique)
$restoreAttempted = $false
$restoreSucceeded = $false
$operationError = $null
try {
  docker compose stop @managedServices
  if ($LASTEXITCODE -ne 0) { throw 'No se pudieron detener los servicios administrados.' }
  $restoreAttempted = $true
  docker compose --profile tools run --rm -e "BACKUP_FILE=/backups/$name" -e 'ALLOW_RESTORE=true' restore
  if ($LASTEXITCODE -ne 0) { throw 'La restauracion no pudo completarse.' }
  $restoreSucceeded = $true
}
catch {
  $operationError = $_
}

$shouldRestart = (-not $restoreAttempted) -or $restoreSucceeded
if ($shouldRestart) {
  if ($runningServices.Count -gt 0) {
    docker compose up -d --no-build @runningServices
    if ($LASTEXITCODE -ne 0) {
      $restartMessage = 'No se pudieron relanzar todos los servicios que estaban activos.'
      if ($null -ne $operationError) {
        throw "$($operationError.Exception.Message) Ademas, $restartMessage"
      }
      throw $restartMessage
    }
  }
}
else {
  Write-Warning 'La restauracion quedo incompleta. Web, API, worker y respaldos permanecen detenidos para no servir datos inconsistentes.'
}

if ($null -ne $operationError) {
  throw $operationError
}
