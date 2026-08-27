# Backlog

Painel único de ideias futuras e status de features geridas pelo sistema
sdd-*. Mantido automaticamente por update-feature-status.ps1.

## Ideias Futuras

- `[Bug]` `npm run android:run` (`npx cap run android`) falha no Windows com `'gradlew' is not recognized as an internal or external command` — a Capacitor CLI não resolve `gradlew`/`gradlew.bat` corretamente nesse ambiente, embora rodar `gradlew.bat` diretamente dentro de `android/` funcione normalmente. Workaround usado: `cd android && .\gradlew.bat installDebug` + `adb shell monkey -p com.johnny.neoreader -c android.intent.category.LAUNCHER 1` pra abrir. Origem: feature `001-audiobook-background-playback`, achado em 2026-08-26 ao validar a US1 em device real.
- `[Bug]` `src/__tests__/services/BookmarkDriveSyncIntegration.test.ts` — o `beforeAll` (dynamic imports de `fake-indexeddb/auto` + `@/db/database` + services de sync) estoura o hookTimeout (10s, e ainda estoura em 20s) quando a suíte completa do Vitest roda em paralelo — passa normalmente isolado. Parece contenção de recursos entre workers, não bug de lógica do teste; investigar `vitest.config.ts` (pool de workers) ou mover esses imports pra fora do `beforeAll`. Origem: feature `001-audiobook-background-playback`, achado em 2026-08-26 ao rodar `npm test` completo. **Atualização 2026-08-27**: mesma classe de flakiness (timeout de 5s) apareceu também em `SettingsScreen.test.tsx` ("explica o que cada API key habilita nas integracoes") e `BookDetailsScreen.test.tsx` (2 testes) numa rodada de `npm test` completo sob carga total — todos passam normalmente quando o arquivo é rodado isolado. Reforça que é contenção de recursos entre workers do Vitest sob carga, não bug de teste específico.

## Features

| Slug | Título | Status | Progresso | Última Atualização |
| --- | --- | --- | --- | --- |
| 001-audiobook-background-playback | Audiobook (TTS) sem interrupção com tela apagada ou app em segundo plano | Convergida | 49/49 tasks | 2026-08-27 |
