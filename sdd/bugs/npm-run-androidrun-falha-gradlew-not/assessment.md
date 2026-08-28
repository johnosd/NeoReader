# Bug Assessment: `npm run android:run` falha no Windows (`'gradlew' is not recognized`)

<!--
  Preenchido pela fase Assess do sdd-bugfix. Este arquivo é o CONTRATO que a
  fase Fix trabalha em cima — ela fica travada aos arquivos listados em
  "Files likely to change" a menos que descubra evidência nova (o que precisa
  ser registrado em fix.md, nunca reescrito aqui).
-->

- **Slug**: npm-run-androidrun-falha-gradlew-not
- **Criado**: 2026-08-27
- **Origem**: `.planning/backlog.md` (entrada `[Bug]`, achado em 2026-08-26 na feature `001-audiobook-background-playback`)
- **Veredito**: valid
- **Severidade**: medium

## Report

> `npm run android:run` (`npx cap run android`) falha no Windows com `'gradlew' is not recognized as an internal or external command` — a Capacitor CLI não resolve `gradlew`/`gradlew.bat` corretamente nesse ambiente, embora rodar `gradlew.bat` diretamente dentro de `android/` funcione normalmente. Workaround usado: `cd android && .\gradlew.bat installDebug` + `adb shell monkey -p com.johnny.neoreader -c android.intent.category.LAUNCHER 1` pra abrir.

## Symptom

`npm run android:run` quebra no passo `npx cap run android` no Windows com o erro de shell `'gradlew' is not recognized as an internal or external command`, embora `android/gradlew.bat` exista e funcione perfeitamente quando chamado diretamente.

## Reproduction

1. No Windows, rodar `npm run android:run` na raiz do projeto.
2. O build web e `cap sync android` completam normalmente.
3. No passo `npx cap run android`, o processo falha com `'gradlew' is not recognized as an internal or external command, operable program or batch file.`
4. Rodar manualmente `cd android; .\gradlew.bat installDebug` funciona sem erro.

## Suspected Code Paths

- `node_modules/@capacitor/cli/dist/android/run.js:20` — chama `runCommand('./gradlew', gradleArgs, { cwd: config.android.platformDirAbs })` com o comando **hardcoded sem extensão** e sem branch por plataforma (não há `process.platform === 'win32' ? 'gradlew.bat' : './gradlew'`).
- `node_modules/@ionic/utils-subprocess/dist/index.js:144` — `Subprocess.spawn()` repassa esse comando pro `cross-spawn`.
- `node_modules/cross-spawn/lib/parse.js:27-60` — no Windows, o `cross-spawn` tenta resolver a extensão via `which.sync` + fallback `cmd.exe`; esse mecanismo não resolve `./gradlew` (sem extensão) de forma confiável nesse ambiente, produzindo exatamente a mensagem de erro do `cmd.exe` reportada no sintoma.
- `package.json:9` — script `"android:run": "npm run build && npx cap sync android && npx cap run android"`, sem nenhuma flag/env que contorne o problema.
- Confirmado: `android/gradlew` e `android/gradlew.bat` **ambos existem** normalmente — não é arquivo faltando nem PATH do Windows mal configurado.
- `@capacitor/cli` instalado: `8.3.0` (`package.json:34`).

## Root Cause Hypothesis

O bug está na `@capacitor/cli@8.3.0` (dependência de terceiros), não no código do projeto: `cap run android` invoca `./gradlew` sem resolver a extensão `.bat` no Windows, e a cadeia `@ionic/utils-subprocess` → `cross-spawn` não compensa isso de forma confiável nesse ambiente. Não é possível corrigir isso patchando o CLI diretamente sem fragilidade a updates do pacote — a remediação viável é o projeto parar de depender de `cap run android` no Windows e replicar o workaround manual (que já funciona) dentro do próprio script `android:run`. **Confiança: high.**

## Proposed Remediation

**Preferida**: substituir a etapa `npx cap run android` do script `android:run` por um script PowerShell dedicado (`scripts/run-android.ps1`, seguindo o mesmo padrão já usado por `android:logs:diagnostics:run` em `package.json:14`) que roda `cd android; .\gradlew.bat installDebug` e depois `adb shell monkey -p com.johnny.neoreader -c android.intent.category.LAUNCHER 1` — o workaround manual já validado pelo usuário, só automatizado. `npm run android:run` continua fazendo `npm run build && npx cap sync android` antes de chamar esse script.

**Alternativas** (opcional):
- Patch pós-install em `node_modules/@capacitor/cli/dist/android/run.js` (o projeto já tem precedente disso em `scripts/patch-capacitor-tts-proguard.mjs`, referenciado em `package.json:17`) trocando `'./gradlew'` por `'./gradlew.bat'` no Windows — mais próximo do fluxo original do Capacitor (mantém `npx cap run android` funcionando por completo, incluindo detecção de device/emulador), mas frágil a updates de versão do `@capacitor/cli` e exige revalidar o patch a cada bump de versão.

**Files likely to change**:
- `package.json` (script `android:run`)
- `scripts/run-android.ps1` (novo)
- `README.md` (já documenta um workaround manual similar para `bundleRelease`, ~linhas 414-426 — atualizar/alinhar com o novo script)

**Tests to add or update**:
- Não há suíte automatizada de scripts de build/deploy Android no projeto; validação é manual — rodar `npm run android:run` num device/emulador Windows real e confirmar que o app instala e abre sem erro de shell.

## Risks & Considerations

- O novo script para de usar a detecção automática de device/emulador do `cap run` (que já não funcionava no Windows mesmo assim) — precisa continuar assumindo um único device conectado via `adb`, igual ao workaround manual já em uso.
- Se o time migrar para macOS/Linux no futuro, o script PowerShell não se aplica — mas o script `android:run` atual já é Windows-first (usa `powershell -ExecutionPolicy Bypass` em outros comandos do mesmo `package.json`), então é consistente com a convenção existente.
- Mudança é local ao workflow de dev/build, não afeta o app em produção nem o comportamento no device.

## Open Questions

- [NEEDS CLARIFICATION: confirmar que só existe um device/emulador Android conectado por vez no fluxo de dev do usuário — se houver múltiplos, o novo script precisa aceitar um parâmetro de device id, assim como o `adb shell monkey` já assume implicitamente hoje no workaround manual.]
