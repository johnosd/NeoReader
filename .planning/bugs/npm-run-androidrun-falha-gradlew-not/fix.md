# Bug Fix: `npm run android:run` falha no Windows (`'gradlew' is not recognized`)

<!--
  Preenchido pela fase Fix do sdd-bugfix — a ÚNICA fase que edita
  código-fonte. Nunca edite assessment.md; qualquer desvio do que ele previu
  vai em "Deviations from Assessment" abaixo, não como reescrita silenciosa.
-->

- **Slug**: npm-run-androidrun-falha-gradlew-not
- **Corrigido**: 2026-08-27
- **Assessment**: ./assessment.md
- **Status**: applied

## Summary

`android:run` parou de depender de `npx cap run android` (que a `@capacitor/cli@8.3.0` chama internamente como `'./gradlew'` sem extensão, quebrando no Windows) e passou a chamar um novo script PowerShell que roda `gradlew.bat installDebug` diretamente e abre o app via `adb shell monkey`, igual ao workaround manual já validado pelo usuário.

## Changes

| Arquivo | Mudança | Notas |
| --- | --- | --- |
| `scripts/run-android.ps1` | added | Resolve o device via `adb` (aceita `-Device <serial>` se houver mais de um conectado, mesmo padrão de `scripts/capture-android-diagnostics.ps1`), roda `gradlew.bat installDebug` em `android/` e depois `adb shell monkey -p com.johnny.neoreader -c android.intent.category.LAUNCHER 1`. |
| `package.json` | modified | Script `android:run` (linha 9) troca `npx cap run android` por `powershell -ExecutionPolicy Bypass -File scripts/run-android.ps1`, seguindo o mesmo padrão já usado pelos scripts `android:logs:*`. |
| `README.md` | modified | Seção "Build Android" (~linhas 383-390): "Fluxo manual" trocado de `npx cap run android` (quebrado no Windows) para o equivalente com `gradlew.bat` + `adb shell monkey`, com nota explicando o motivo. |

## Tests Added or Updated

- Nenhum teste automatizado adicionado — conforme previsto no assessment, não há suíte de testes pra scripts de build/deploy Android no projeto. Validação é `npm run build` (garante que nada em TS/bundling quebrou) + checagem de sintaxe do PowerShell + verificação manual end-to-end na fase Test.

## Local Verification

- Comando rodado: `npm run build` → passou sem erros (`tsc -b && vite build`, build de produção completo).
- Comando rodado: `[System.Management.Automation.Language.Parser]::ParseFile(...)` sobre `scripts/run-android.ps1` → sintaxe válida.
- Checagem manual: não rodei `npm run android:run` fim a fim contra um device Android real nesta fase (ação que instala/abre o app num device físico) — deixado explicitamente para a fase Test, que já existe pra isso.

## Deviations from Assessment

Nenhum desvio da remediação proposta. Resolvi a "Open Question" do assessment (múltiplos devices conectados) adicionando o parâmetro `-Device` ao novo script, replicando um padrão já existente no repo (`scripts/capture-android-diagnostics.ps1`) em vez de perguntar ao usuário — mesma convenção de tratamento de erro (lança exceção clara se 0 ou >1 devices sem `-Device` explícito).

## Follow-ups

- Rodar a fase Test com um device Android real conectado pra confirmar o fluxo fim a fim (`npm run android:run` instala e abre o app sem erro de shell).
