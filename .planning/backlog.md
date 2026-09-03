# Backlog

Painel único de ideias futuras e status de features/bugs geridas pelo
sistema sdd-*. Mantido automaticamente por update-feature-status.ps1 e
update-bug-status.ps1.

## Ideias Futuras

- `[Bug]` Bucket "Optimization" (0%) do alerta de qualidade técnica do Play Console (release 20/1.0.16) — cobertura de shrink/obfuscate/optimize do R8 no DEX nativo. `minifyEnabled true`/`shrinkResources true` já ligados desde a versionCode 2, mas `android/app/proguard-rules.pro` tem `-keep class com.getcapacitor.** { *; }` genérico demais, isentando praticamente todo o código nativo (majoritariamente runtime do Capacitor) da otimização real. Achado durante a investigação do bug de memória (2026-09-01, ver `sdd/bugs/alerta-play-console-uso-memoria-acima/`), tratado como fora de escopo daquele fix. Enforcement do Google só em fev/2027, sem urgência.
- `[Perf]` `foliate-js` (modo scroll contínuo do leitor) nunca libera capítulos já lidos do DOM/memória durante uma sessão de leitura longa — `#trimDistantViews` só evicta seções à frente do capítulo atual, nunca pra trás (comentário da própria lib: removê-las pra trás quebraria a posição de scroll). Investigado em 2026-09-01 (`sdd/bugs/alerta-play-console-uso-memoria-acima/assessment.md`). Duas abordagens possíveis: patchar `#trimDistantViews` pra evictar pra trás também (arriscado) ou chamar `view.book?.destroy?.()` como rede de segurança ao trocar de livro/sair do leitor (mais seguro, mitigação parcial). Projeto já tem infra de patch de vendor lib sem fork (`vite.config.ts`, plugin `harden-foliate-iframe-sandbox`) reaproveitável.

## Features

| Slug | Título | Status | Progresso | Última Atualização |
| --- | --- | --- | --- | --- |
| 001-audiobook-background-playback | Audiobook (TTS) sem interrupção com tela apagada ou app em segundo plano | Convergida | 49/49 tasks | 2026-08-27 |
| 002-biblioteca-dominio-publico | Biblioteca de Domínio Público (Standard Ebooks) | Convergida | 40/41 tasks | 2026-08-28 |
| 003-opds-catalogos | Suporte a Catálogos OPDS (Públicos e Self-Hosted) | Convergida | 87/87 tasks | 2026-09-01 |
| 004-settings-categorias | Reorganizar Tela de Settings em Categorias Navegáveis | Convergida | 50/50 tasks | 2026-09-02 |
| 005-sync-drive-inline | Renovação Silenciosa do Token do Google Drive e Sincronização Inline pelo Ícone de Bookmark | Convergida | 27/27 tasks | 2026-09-02 |
| 006-virtualizacao-biblioteca | Virtualização da tela de Biblioteca (grid e lista) | Convergida | 30/30 tasks | 2026-09-03 |
| 007-redimensionamento-capas | Redimensionamento e recompressão de capas de EPUB no import | Convergida | 19/19 tasks | 2026-09-03 |
| 008-migracao-speechify-simba-3 | Migração Speechify simba-english/simba-multilingual → simba-3.2/simba-3.0 | Implementada | 20/20 tasks | 2026-09-03 |

## Bugs

| Slug | Título | Fase Atual | Veredito/Status | Próximo Passo | Última Atualização |
| --- | --- | --- | --- | --- | --- |
| alerta-play-console-uso-memoria-acima | Uso de memória acima do threshold do Play Console | Test | verified (com ressalva explícita — ver seção Result abaixo) | Concluído | 2026-09-01 |
| bookmarkdrivesyncintegration-beforeall-hooktimeout-flaky-vit | Timeouts flaky no Vitest sob carga (hookTimeout/testTimeout) | Test | partial | Concluído (com ressalva) ou reabrir Assess | 2026-09-01 |
| npm-run-androidrun-falha-gradlew-not | `npm run android:run` falha no Windows (`'gradlew' is not recognized`) | Test | verified | Concluído | 2026-09-01 |
| tela-sincronizacao-na-nuvem-sem-opcao | Sincronização na Nuvem sem opção de conectar/reconectar fora do caso "token expirado" | Test | verified | Concluído | 2026-09-02 |
| reconectar-google-drive-nao-recupera-bookmarks | Reconectar Google Drive não recupera bookmarks sem tentativa prévia registrada | Test | verified | Concluído | 2026-09-02 |
| vitestconfigts-usa-pooloptions-depreciado-no-vitest | `vitest.config.ts` usa `test.poolOptions`, removido no Vitest 4 | Test | verified | Concluído | 2026-09-03 |
