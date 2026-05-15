param(
  [string]$Device = "",
  [string]$Package = "com.johnny.neoreader",
  [int]$Seconds = 0,
  [switch]$Launch,
  [int]$DiagnosticsIntervalSeconds = 10,
  [switch]$ThreadDump,
  [switch]$SkipDiagnostics
)

$ErrorActionPreference = "Stop"

$adb = (Get-Command adb -ErrorAction Stop).Source
$root = Split-Path -Parent $PSScriptRoot
$logDir = Join-Path $root "logs"
New-Item -ItemType Directory -Force -Path $logDir | Out-Null

if ($DiagnosticsIntervalSeconds -lt 1) {
  $DiagnosticsIntervalSeconds = 10
}

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
$fullLog = Join-Path $logDir "android-import-$timestamp-full.log"
$filteredLog = Join-Path $logDir "android-import-$timestamp-filtered.log"
$diagnosticsLog = Join-Path $logDir "android-import-$timestamp-diagnostics.log"
$pattern = @(
  "NeoReaderLibrary",
  "EPUB import",
  "Native EPUB import",
  "Native EPUB chunk",
  "Chunk invalido",
  "Book import failed",
  "Capacitor/Console",
  "AndroidRuntime",
  "Choreographer",
  "Skipped .* frames",
  "Davey",
  "GC freed",
  "Input dispatching timed out",
  "tombstoned",
  "readFileChunk",
  "FileNotFoundException",
  "SecurityException",
  "DocumentsUI",
  "ContentResolver",
  "content://",
  "epub"
) -join "|"

function Add-Section {
  param(
    [string]$Path,
    [string]$Title
  )

  Add-Content -LiteralPath $Path -Value ""
  Add-Content -LiteralPath $Path -Value "===== $Title ====="
}

function Add-CommandOutput {
  param(
    [string]$Path,
    [string]$Title,
    [scriptblock]$Command
  )

  Add-Section -Path $Path -Title $Title
  try {
    & $Command 2>&1 | Out-File -LiteralPath $Path -Append -Encoding utf8
  } catch {
    Add-Content -LiteralPath $Path -Value $_.Exception.Message
  }
}

function Get-AppPid {
  $pidOutput = (& $adb -s $Device shell pidof -s $Package 2>&1 | Out-String).Trim()
  if ($pidOutput -match "^\d+$") {
    return $pidOutput
  }

  return ""
}

function Write-DiagnosticSnapshot {
  param([string]$Label)

  $pidText = Get-AppPid
  Add-Section -Path $diagnosticsLog -Title "snapshot $Label $(Get-Date -Format o)"
  Add-Content -LiteralPath $diagnosticsLog -Value "device=$Device"
  Add-Content -LiteralPath $diagnosticsLog -Value "package=$Package"
  Add-Content -LiteralPath $diagnosticsLog -Value "pid=$pidText"

  Add-CommandOutput -Path $diagnosticsLog -Title "window focus / anr" -Command {
    & $adb -s $Device shell dumpsys window |
      Select-String -Pattern "mCurrentFocus|mFocusedApp|Input dispatching timed out"
  }

  Add-CommandOutput -Path $diagnosticsLog -Title "cpuinfo" -Command {
    & $adb -s $Device shell dumpsys cpuinfo |
      Select-String -Pattern "johnny|TOTAL|webview|media|externalstorage|DocumentsUI"
  }

  if ($pidText) {
    Add-CommandOutput -Path $diagnosticsLog -Title "top pid $pidText" -Command {
      & $adb -s $Device shell top -b -n 1 -p $pidText
    }
  }

  Add-CommandOutput -Path $diagnosticsLog -Title "meminfo $Package" -Command {
    & $adb -s $Device shell dumpsys meminfo $Package |
      Select-String -Pattern "TOTAL|Native Heap|Dalvik Heap|Graphics|Private Other|App Summary|Java Heap|Native Heap|Code|Stack"
  }
}

function Request-ThreadDump {
  $pidText = Get-AppPid
  Add-Section -Path $diagnosticsLog -Title "thread dump request $(Get-Date -Format o)"
  if (-not $pidText) {
    Add-Content -LiteralPath $diagnosticsLog -Value "App process not running."
    return
  }

  Add-Content -LiteralPath $diagnosticsLog -Value "Requesting SIGQUIT for pid=$pidText via run-as."
  & $adb -s $Device shell run-as $Package kill -3 $pidText 2>&1 |
    Out-File -LiteralPath $diagnosticsLog -Append -Encoding utf8
  Start-Sleep -Seconds 6

  Add-CommandOutput -Path $diagnosticsLog -Title "thread dump logcat markers" -Command {
    & $adb -s $Device logcat -d |
      Select-String -Pattern "Signal Catcher|Wrote stack traces|tombstoned|$Package|DALVIK THREADS|Cmd line: $Package"
  }
}

& $adb -s $Device logcat -c

if ($Launch) {
  & $adb -s $Device shell monkey -p $Package -c android.intent.category.LAUNCHER 1 | Out-Null
}

Write-Host "Capturando logcat do dispositivo $Device."
Write-Host "Reproduza a importacao de EPUB agora."
Write-Host "Log completo: $fullLog"
Write-Host "Log filtrado:  $filteredLog"
if (-not $SkipDiagnostics) {
  Write-Host "Diagnosticos:  $diagnosticsLog"
}
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
    $startedAt = Get-Date
    if (-not $SkipDiagnostics) {
      Write-DiagnosticSnapshot -Label "start"
    }

    while ($job.State -eq "Running") {
      $elapsed = [int]((Get-Date) - $startedAt).TotalSeconds
      $remaining = $Seconds - $elapsed
      if ($remaining -le 0) {
        break
      }

      $sleepSeconds = [Math]::Min($DiagnosticsIntervalSeconds, $remaining)
      Start-Sleep -Seconds $sleepSeconds

      if (-not $SkipDiagnostics) {
        $elapsed = [int]((Get-Date) - $startedAt).TotalSeconds
        Write-DiagnosticSnapshot -Label "t+$elapsed`s"
      }
    }

    if ($ThreadDump -and -not $SkipDiagnostics) {
      Request-ThreadDump
    }
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
if (-not $SkipDiagnostics) {
  Write-Host "Diagnosticos:  $diagnosticsLog"
}
