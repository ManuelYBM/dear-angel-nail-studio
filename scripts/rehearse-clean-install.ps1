param(
  [switch]$SkipBuild
)

$ErrorActionPreference = 'Stop'
$rehearsalProject = 'dear-angel-rehearsal'
$rehearsalServices = @('postgres', 'redis', 'minio', 'api', 'worker', 'web')
$rehearsalFiles = @('-f', 'compose.yaml', '-f', 'docker/compose.rehearsal.yaml')
$runningServices = @()

function Invoke-Compose {
  param([string[]]$Arguments)

  & docker compose @Arguments
  if ($LASTEXITCODE -ne 0) {
    throw "docker compose fallo: $($Arguments -join ' ')"
  }
}

function Wait-HttpHealth {
  param(
    [string]$Name,
    [string]$Url,
    [int]$Attempts = 60
  )

  foreach ($attempt in 1..$Attempts) {
    try {
      $response = Invoke-WebRequest -Uri $Url -UseBasicParsing -TimeoutSec 4
      if ($response.StatusCode -eq 200) {
        Write-Output "HEALTH`tOK`t$Name"
        return
      }
    } catch {
      if ($attempt -eq $Attempts) { throw }
    }
    Start-Sleep -Seconds 3
  }

  throw "$Name no alcanzo estado saludable."
}

try {
  if (-not (Get-Command node -ErrorAction SilentlyContinue) -or
      -not (Get-Command npm -ErrorAction SilentlyContinue)) {
    throw 'El ensayo requiere Node.js y npm en el equipo anfitrion.'
  }
  if (-not (Test-Path -LiteralPath (Join-Path $PSScriptRoot '..\node_modules\@prisma\client'))) {
    Write-Output 'Instalando dependencias del checkout limpio...'
    & npm ci
    if ($LASTEXITCODE -ne 0) { throw 'npm ci no pudo instalar las dependencias.' }
  }
  & npm run db:generate
  if ($LASTEXITCODE -ne 0) { throw 'No se pudo generar Prisma Client.' }

  $managedServices = @(
    'backup', 'web', 'api', 'worker', 'minio', 'redis', 'postgres'
  )
  $runningServices = @(
    & docker compose ps --services --status running
  ) | Where-Object { $managedServices -contains $_ }
  if ($LASTEXITCODE -ne 0) { throw 'No se pudo consultar la instalacion principal.' }
  $restartingServices = @(
    & docker compose ps --services --status restarting
  ) | Where-Object { $managedServices -contains $_ }
  if ($LASTEXITCODE -ne 0) { throw 'No se pudo consultar servicios en reinicio.' }
  $runningServices = @($runningServices + $restartingServices | Select-Object -Unique)

  Write-Output 'Deteniendo temporalmente la instalacion principal...'
  Invoke-Compose -Arguments (@('stop') + $managedServices)

  $upArguments = @($rehearsalFiles) + @('-p', $rehearsalProject, 'up', '-d')
  if ($SkipBuild) { $upArguments += '--no-build' } else { $upArguments += '--build' }
  $upArguments += $rehearsalServices

  Write-Output "Creando instalacion aislada: $rehearsalProject"
  Invoke-Compose -Arguments $upArguments

  Wait-HttpHealth -Name 'API limpia' -Url 'http://127.0.0.1:3001/api/health/ready'
  Wait-HttpHealth -Name 'worker limpio' -Url 'http://127.0.0.1:3002/health'
  Wait-HttpHealth -Name 'web limpia' -Url 'http://127.0.0.1:3000/api/health'

  $previousDemoEnabled = $env:DEMO_DATA_ENABLED
  $env:DEMO_DATA_ENABLED = 'true'
  try {
    & node scripts/seed-demo.mjs
    if ($LASTEXITCODE -ne 0) { throw 'No fue posible cargar los datos demostrativos.' }

    & node scripts/e2e.mjs
    if ($LASTEXITCODE -ne 0) { throw 'La prueba end-to-end de la instalacion limpia fallo.' }
  } finally {
    $env:DEMO_DATA_ENABLED = $previousDemoEnabled
  }

  Write-Output "REHEARSAL CLEAN INSTALL`tOK"
} finally {
  $rehearsalContainers = @(
    & docker ps -a --filter "label=com.docker.compose.project=$rehearsalProject" --format '{{.ID}}'
  )
  $rehearsalVolumes = @(
    & docker volume ls --filter "label=com.docker.compose.project=$rehearsalProject" --format '{{.Name}}'
  )
  Write-Output (
    "Limpiando solo el ensayo validado: {0} contenedores, {1} volumenes." -f
      $rehearsalContainers.Count, $rehearsalVolumes.Count
  )
  $downArguments = @($rehearsalFiles) + @(
    '-p', $rehearsalProject, 'down', '--volumes', '--remove-orphans'
  )
  Invoke-Compose -Arguments $downArguments

  if ($runningServices.Count -gt 0) {
    Write-Output 'Restableciendo unicamente los servicios que estaban activos...'
    Invoke-Compose -Arguments (
      @('up', '-d', '--no-build') + $runningServices
    )
    if ($runningServices -contains 'web') {
      Wait-HttpHealth -Name 'web principal' -Url 'http://127.0.0.1:3000/api/health'
    }
  }
}
