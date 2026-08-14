param(
  [switch]$SkipBuild
)

$ErrorActionPreference = 'Stop'
$rehearsalProject = 'dear-angel-rehearsal'
$rehearsalServices = @('postgres', 'redis', 'minio', 'api', 'worker', 'web')
$rehearsalFiles = @('-f', 'compose.yaml', '-f', 'docker/compose.rehearsal.yaml')
$originalStopped = $false

function Invoke-Compose {
  param([string[]]$Arguments)

  & docker compose @Arguments
  if ($LASTEXITCODE -ne 0) {
    throw "docker compose falló: $($Arguments -join ' ')"
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

  throw "$Name no alcanzó estado saludable."
}

try {
  Write-Output 'Deteniendo temporalmente la instalación principal...'
  Invoke-Compose -Arguments @(
    '--profile', 'stable-preview', 'stop',
    'stable-preview', 'backup', 'web', 'api', 'worker', 'minio', 'redis', 'postgres'
  )
  $originalStopped = $true

  $upArguments = @($rehearsalFiles) + @('-p', $rehearsalProject, 'up', '-d')
  if ($SkipBuild) { $upArguments += '--no-build' } else { $upArguments += '--build' }
  $upArguments += $rehearsalServices

  Write-Output "Creando instalación aislada: $rehearsalProject"
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
    if ($LASTEXITCODE -ne 0) { throw 'La prueba end-to-end de la instalación limpia falló.' }
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
    "Limpiando sólo el ensayo validado: {0} contenedores, {1} volúmenes." -f
      $rehearsalContainers.Count, $rehearsalVolumes.Count
  )
  $downArguments = @($rehearsalFiles) + @(
    '-p', $rehearsalProject, 'down', '--volumes', '--remove-orphans'
  )
  Invoke-Compose -Arguments $downArguments

  if ($originalStopped) {
    Write-Output 'Restableciendo la instalación principal y el enlace estable...'
    Invoke-Compose -Arguments @('--profile', 'stable-preview', 'up', '-d', '--no-build')
    Wait-HttpHealth -Name 'web principal' -Url 'http://127.0.0.1:3000/api/health'
  }
}
