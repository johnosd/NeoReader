# Bug Verification: `npm run android:run` falha no Windows (`'gradlew' is not recognized`)

<!--
  Preenchido pela fase Test do sdd-bugfix — read-only, nunca edita código.
  Nunca marque "verified" se a reprodução não foi de fato executada; use
  "partial"/"not-run" e diga isso explicitamente. Superestimar aqui é pior
  que não verificar.
-->

- **Slug**: npm-run-androidrun-falha-gradlew-not
- **Testado**: 2026-08-27
- **Assessment**: ./assessment.md
- **Fix**: ./fix.md
- **Result**: verified

## Summary

Reprodução original confirmada ponta a ponta com um device real conectado (`RXCX103NMVZ` via adb, instalado em `SM-S911B - 16`): `npm run android:run` completou build, `cap sync android`, `gradlew.bat installDebug` (**BUILD SUCCESSFUL**, "Installed on 1 device") e abriu o app via `adb shell monkey` (**Events injected: 1**) — sem nenhum erro de `'gradlew' is not recognized`. O caminho de erro (sem device) também foi validado antes disso. Bug corrigido e verificado nos dois cenários.

## Checks Performed

| Checagem | Comando / Ação | Resultado | Notas |
| --- | --- | --- | --- |
| Reprodução (pós-fix) — fim a fim num device real | `npm run android:run` com device `RXCX103NMVZ` conectado | pass | Build + `cap sync android` + `gradlew.bat installDebug` (BUILD SUCCESSFUL, "Installed on 1 device" em `SM-S911B - 16`) + `adb shell monkey` abrindo o app (Events injected: 1). Nenhum erro de shell. Caminho feliz completo confirmado. |
| Reprodução (pós-fix) — caminho de erro do novo script | `powershell -File scripts/run-android.ps1` sem device conectado (checagem anterior, feita antes de conectar o device) | pass | Falhou com mensagem clara em português ("Nenhum dispositivo Android conectado pelo adb.") **antes** de tocar no Gradle — nunca chega a reproduzir o erro original do `cmd.exe`. Confirma que a resolução de device roda antes do passo que causava o bug. |
| Sintaxe do script | `[System.Management.Automation.Language.Parser]::ParseFile(...)` sobre `scripts/run-android.ps1` | pass | Sintaxe válida (mesma checagem da fase Fix, reconfirmada). |
| Testes novos/atualizados | — | not-run | Nenhum teste foi adicionado (não há suíte automatizada pra scripts de build/deploy Android neste projeto, conforme já previsto no assessment). |
| Suite de regressão | `npm test` (rodada na fase Fix, não repetida aqui por não ter relação com este bug) | — | Ver `test.md` do bug `bookmarkdrivesyncintegration-beforeall-hooktimeout-flaky-vit` para o resultado da suíte completa. |
| Lint | `npm run lint` | pass | Sem erros. |
| Build | `npm run build` | pass | `tsc -b && vite build` completo sem erros, 1991 módulos transformados (rodado tanto isolado quanto como parte do `npm run android:run`). |

## Output Excerpts

```
> powershell -ExecutionPolicy Bypass -File scripts/run-android.ps1  (sem device)
Nenhum dispositivo Android conectado pelo adb.
    + CategoryInfo          : OperationStopped: (...) [], RuntimeException
    + FullyQualifiedErrorId : Nenhum dispositivo Android conectado pelo adb.
```

```
> npm run android:run  (com device RXCX103NMVZ conectado)
...
> Task :app:installDebug
Installing APK 'app-debug.apk' on 'SM-S911B - 16' for :app:debug
Installed on 1 device.

BUILD SUCCESSFUL in 1m 20s
228 actionable tasks: 24 executed, 204 up-to-date
...
data="com.johnny.neoreader"
data="android.intent.category.LAUNCHER"
Events injected: 1
```

## Residual Risks

- O parâmetro `-Device` (pra cenário de múltiplos devices conectados) não foi exercitado — só os caminhos de zero device e de exatamente um device.
- Verificado num único modelo de device (`SM-S911B`, Android por trás do `adb`); comportamento do `gradlew.bat`/`adb shell monkey` em emuladores ou outras versões de Android não foi testado, mas não há motivo pra esperar diferença — o script não depende de nada específico desse modelo.

## Recommendation

Fechar — verificado ponta a ponta com um device real: `npm run android:run` completa build, install e abertura do app sem nenhum erro de shell. O caminho de erro (sem device) também segue correto. Bug resolvido.
