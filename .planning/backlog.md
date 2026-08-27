# Backlog

Painel único de ideias futuras e status de features geridas pelo sistema
sdd-*. Mantido automaticamente por update-feature-status.ps1.

## Ideias Futuras

- `[Bug]` `npm run android:run` (`npx cap run android`) falha no Windows com `'gradlew' is not recognized as an internal or external command` — a Capacitor CLI não resolve `gradlew`/`gradlew.bat` corretamente nesse ambiente, embora rodar `gradlew.bat` diretamente dentro de `android/` funcione normalmente. Workaround usado: `cd android && .\gradlew.bat installDebug` + `adb shell monkey -p com.johnny.neoreader -c android.intent.category.LAUNCHER 1` pra abrir. Origem: feature `001-audiobook-background-playback`, achado em 2026-08-26 ao validar a US1 em device real.
- `[Bug]` `src/__tests__/services/BookmarkDriveSyncIntegration.test.ts` — o `beforeAll` (dynamic imports de `fake-indexeddb/auto` + `@/db/database` + services de sync) estoura o hookTimeout (10s, e ainda estoura em 20s) quando a suíte completa do Vitest roda em paralelo — passa normalmente isolado. Parece contenção de recursos entre workers, não bug de lógica do teste; investigar `vitest.config.ts` (pool de workers) ou mover esses imports pra fora do `beforeAll`. Origem: feature `001-audiobook-background-playback`, achado em 2026-08-26 ao rodar `npm test` completo.

## Features

| Slug | Título | Status | Progresso | Última Atualização |
| --- | --- | --- | --- | --- |
| 001-audiobook-background-playback | Audiobook (TTS) sem interrupção com tela apagada ou app em segundo plano | Em Execução | 31/46 tasks | 2026-08-26 |
