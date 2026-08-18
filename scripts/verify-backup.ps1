[CmdletBinding()]
param(
  [Parameter(Mandatory = $true)]
  [string]$BackupFile
)

$ErrorActionPreference = 'Stop'
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
docker compose --profile tools run --rm -e "BACKUP_FILE=/backups/$name" restore verify
if ($LASTEXITCODE -ne 0) { throw 'El respaldo no paso la verificacion.' }
