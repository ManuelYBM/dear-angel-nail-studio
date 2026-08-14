[CmdletBinding()]
param(
  [Parameter(Mandatory = $true)]
  [string]$BackupFile,

  [switch]$ConfirmRestore
)

$ErrorActionPreference = 'Stop'
if (-not $ConfirmRestore) {
  throw 'La restauración reemplaza la base y los archivos actuales. Repite con -ConfirmRestore.'
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
docker compose --profile stable-preview stop stable-preview web api worker backup
try {
  docker compose --profile tools run --rm -e "BACKUP_FILE=/backups/$name" -e 'ALLOW_RESTORE=true' restore
  if ($LASTEXITCODE -ne 0) { throw 'La restauración no pudo completarse.' }
}
finally {
  docker compose --profile stable-preview up -d api worker backup web stable-preview
}
