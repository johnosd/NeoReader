# Instala e abre o app no device/emulador Android conectado.
#
# Substitui `npx cap run android`: a @capacitor/cli@8.3.0 chama o Gradle
# wrapper como './gradlew' sem resolver a extensão '.bat' no Windows, o que
# quebra com "'gradlew' is not recognized". Aqui chamamos gradlew.bat
# diretamente e replicamos o passo de abrir o app via adb monkey.
param(
  [string]$Device = ""
)

$ErrorActionPreference = "Stop"

$adb = (Get-Command adb -ErrorAction Stop).Source
$root = Split-Path -Parent $PSScriptRoot
$androidDir = Join-Path $root "android"
$package = "com.johnny.neoreader"

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

Push-Location $androidDir
try {
  & .\gradlew.bat installDebug
  if ($LASTEXITCODE -ne 0) {
    throw "gradlew.bat installDebug falhou com codigo $LASTEXITCODE"
  }
} finally {
  Pop-Location
}

& $adb -s $Device shell monkey -p $package -c android.intent.category.LAUNCHER 1
