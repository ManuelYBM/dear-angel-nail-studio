[CmdletBinding()]
param()

$ErrorActionPreference = 'Stop'
$workspace = Split-Path -Parent $PSScriptRoot
Set-Location -LiteralPath $workspace

New-Item -ItemType Directory -Path (Join-Path $workspace 'backups') -Force | Out-Null
docker compose up -d --build backup
if ($LASTEXITCODE -ne 0) { throw 'No se pudo iniciar el servicio de respaldos.' }
docker compose exec -T backup /opt/dear-angel/backup.sh once
if ($LASTEXITCODE -ne 0) { throw 'No se pudo generar el respaldo.' }

Get-ChildItem -LiteralPath (Join-Path $workspace 'backups') -Filter 'dear-angel-*.tar.gz' |
  Sort-Object LastWriteTime -Descending |
  Select-Object -First 1 FullName, Length, LastWriteTime
