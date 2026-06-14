param(
  [string]$Device = "",
  [string]$Package = "com.johnny.neoreader",
  [int]$Seconds = 0,
  [switch]$Launch,
  [switch]$Clear,
  [string]$Filter = "diagnostics"
)

$ErrorActionPreference = "Stop"

$adb = (Get-Command adb -ErrorAction Stop).Source
$root = Split-Path -Parent $PSScriptRoot
$logDir = Join-Path $root "logs"
New-Item -ItemType Directory -Force -Path $logDir | Out-Null

if ($Device -match "^\d+$" -and $Seconds -eq 0) {
  $Seconds = [int]$Device
  $Device = ""
}

if (-not $Device) {
  $devices = @(
    & $adb devices |
      Select-Object -Skip 1 |
      Where-Object { $_ -match "\sdevice$" } |
      ForEach-Object { ($_ -split "\s+")[0] }
  )

  if ($devices.Count -eq 0) {
    throw "Nenhum dispositivo Android conectado pelo adb."
  }

  if ($devices.Count -gt 1) {
    throw "Mais de um dispositivo conectado. Informe -Device <serial>. Dispositivos: $($devices -join ', ')"
  }

  $Device = $devices[0]
}

$timestamp = Get-Date -Format "yyyyMMdd-HHmmss"
$fullLog = Join-Path $logDir "android-diagnostics-$timestamp-full.log"
$filteredLog = Join-Path $logDir "android-diagnostics-$timestamp-filtered.log"

$diagnosticsPattern = @(
  "NeoReaderEvent",
  "NeoReaderImport",
  "Capacitor/Console",
  "AndroidRuntime",
  "FATAL EXCEPTION",
  "\bANR\b",
  "Input dispatching timed out",
  "Choreographer",
  "Skipped .* frames",
  "Davey",
  "\bGC\b",
  "low memory",
  "OutOfMemoryError",
  "tombstoned",
  "StrictMode",
  $Package
) -join "|"

$neoreaderPattern = @(
  "NeoReaderEvent",
  "NeoReaderImport",
  "Capacitor/Console",
  $Package
) -join "|"

switch ($Filter) {
  "all" { $pattern = "." }
  "neoreader" { $pattern = $neoreaderPattern }
  default { $pattern = $diagnosticsPattern }
}

if ($Clear) {
  & $adb -s $Device logcat -c
}

if ($Launch) {
  & $adb -s $Device shell monkey -p $Package -c android.intent.category.LAUNCHER 1 | Out-Null
}

Write-Host "Capturando logcat do dispositivo $Device."
Write-Host "Pacote: $Package"
Write-Host "Filtro: $Filter"
Write-Host "Log completo: $fullLog"
Write-Host "Log filtrado:  $filteredLog"
if ($Seconds -gt 0) {
  Write-Host "A captura vai parar automaticamente em $Seconds segundos."
} else {
  Write-Host "Pressione Ctrl+C para parar a captura."
}

$capture = {
  param($AdbPath, $Serial, $FullLogPath, $FilteredLogPath, $FilterPattern)

  & $AdbPath -s $Serial logcat -v threadtime 2>&1 |
    Tee-Object -FilePath $FullLogPath |
    Select-String -Pattern $FilterPattern |
    ForEach-Object { $_.Line } |
    Tee-Object -FilePath $FilteredLogPath
}

if ($Seconds -gt 0) {
  $job = Start-Job -ScriptBlock $capture -ArgumentList $adb, $Device, $fullLog, $filteredLog, $pattern
  try {
    Start-Sleep -Seconds $Seconds
  } finally {
    Stop-Job $job -ErrorAction SilentlyContinue
    Receive-Job $job -ErrorAction SilentlyContinue
    Remove-Job $job -Force -ErrorAction SilentlyContinue
  }
} else {
  & $capture $adb $Device $fullLog $filteredLog $pattern
}

Write-Host "Captura finalizada."
Write-Host "Log completo: $fullLog"
Write-Host "Log filtrado:  $filteredLog"
Write-Host "Analise sugerida:"
Write-Host "npm run diagnostics:analyze -- `"$filteredLog`""
