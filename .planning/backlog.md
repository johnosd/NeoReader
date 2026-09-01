# Backlog

Painel único de ideias futuras e status de features geridas pelo sistema
sdd-*. Mantido automaticamente por update-feature-status.ps1.

## Ideias Futuras

- `[Bug]` `vitest.config.ts` usa `test.poolOptions`, removido no Vitest 4 — gera warning de depreciação em toda rodada de teste (`npx vitest run`). Não bloqueia nada (suíte roda normal), fora do escopo de qualquer feature em andamento. Achado durante `sdd-execute` de `003-opds-catalogos` (2026-08-31). Migrar pra `test.maxWorkers`/opção top-level equivalente, ver https://vitest.dev/guide/migration#pool-rework.

## Features

| Slug | Título | Status | Progresso | Última Atualização |
| --- | --- | --- | --- | --- |
| 001-audiobook-background-playback | Audiobook (TTS) sem interrupção com tela apagada ou app em segundo plano | Convergida | 49/49 tasks | 2026-08-27 |
| 002-biblioteca-dominio-publico | Biblioteca de Domínio Público (Standard Ebooks) | Convergida | 40/41 tasks | 2026-08-28 |
| 003-opds-catalogos | Suporte a Catálogos OPDS (Públicos e Self-Hosted) | Convergida | 87/87 tasks | 2026-09-01 |
