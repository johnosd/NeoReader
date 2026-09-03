# Bug Assessment: `vitest.config.ts` usa `test.poolOptions`, removido no Vitest 4

<!--
  Preenchido pela fase Assess do sdd-bugfix. Este arquivo é o CONTRATO que a
  fase Fix trabalha em cima — ela fica travada aos arquivos listados em
  "Files likely to change" a menos que descubra evidência nova (o que precisa
  ser registrado em fix.md, nunca reescrito aqui).
-->

- **Slug**: vitestconfigts-usa-pooloptions-depreciado-no-vitest
- **Criado**: 2026-09-03
- **Origem**: `.planning/backlog.md` (entrada `[Bug]`, achado durante `sdd-execute` de `003-opds-catalogos`, 2026-08-31)
- **Veredito**: valid
- **Severidade**: low

## Report

> `vitest.config.ts` usa `test.poolOptions`, removido no Vitest 4 — gera warning de depreciação em toda rodada de teste (`npx vitest run`). Não bloqueia nada (suíte roda normal), fora do escopo de qualquer feature em andamento. Migrar pra `test.maxWorkers`/opção top-level equivalente.

## Symptom

Toda execução de `npm test` / `npx vitest run` imprime `DEPRECATED 'test.poolOptions' was removed in Vitest 4. All previous 'poolOptions' are now top-level options.` antes de rodar os testes. A suíte roda e passa normalmente — é só ruído no output, não um comportamento incorreto.

## Reproduction

1. Rodar `npm test` na raiz do projeto (Vitest instalado: `4.1.4`, confirmado via `npx vitest --version`).
2. O bloco `DEPRECATED` aparece no topo do output, antes de `RUN v4.1.4 ...`.
3. Confirmado nesta sessão: 106 arquivos de teste / 775 testes passam normalmente apesar do warning — não é flaky nem bloqueante.

## Suspected Code Paths

- `vitest.config.ts:17-21` — bloco `poolOptions: { threads: { maxThreads: ... } }` dentro de `test`, API removida no pool rework do Vitest 4.
- `node_modules/vitest` (`vitest@4.1.4`, ver `package.json`) — emite o warning em `resolveConfig.ts` sempre que detecta a chave `poolOptions` no config resolvido.

## Root Cause Hypothesis

O projeto fixou `vitest.config.ts` numa API que existia no Vitest 3.x (`test.poolOptions.threads.maxThreads`, adicionada propositalmente pra limitar concorrência e evitar os timeouts flaky documentados em `sdd/bugs/bookmarkdrivesyncintegration-beforeall-hooktimeout-flaky-vit/`) mas o pacote instalado já é Vitest 4, que promoveu essas opções pro nível superior de `test` e passou a apenas emitir warning (não erro) quando encontra a chave antiga — por isso a suíte continua funcionando, só com ruído. Confirmado na documentação oficial de migração (Context7, `vitest-dev/vitest@v4.1.6`, guia `pool-rework`): `maxThreads`/`maxForks` viraram `maxWorkers` como opção top-level; `poolOptions` foi removido por completo. **Confiança: high.**

## Proposed Remediation

**Preferida**: em `vitest.config.ts`, remover o bloco `poolOptions: { threads: { maxThreads: ... } }` e mover o cálculo de `maxThreads` para a opção top-level `test.maxWorkers`, mantendo o comentário existente sobre o motivo (evitar timeouts flaky com a suíte completa em paralelo). Resultado equivalente:
```ts
maxWorkers: Math.max(2, Math.floor(os.cpus().length / 2)),
```

**Alternativas** (opcional):
- Nenhuma — é uma migração mecânica 1:1 documentada pelo próprio Vitest, sem trade-off de comportamento (o pool padrão `threads` permanece o mesmo; só a chave de config muda de lugar).

**Files likely to change**:
- `vitest.config.ts`

**Tests to add or update**:
- Nenhum teste novo — a correção é validada rodando `npm test` e confirmando ausência do bloco `DEPRECATED` no output, com a suíte inteira passando (mesma contagem de arquivos/testes de antes).

## Risks & Considerations

- Baixíssimo risco: mudança de config de tooling, não afeta código de produção nem comportamento de nenhum teste individual.
- Vale conferir se `test:watch` (`vitest` sem `run`) e `test:debug-epubs` (se usarem a mesma config) também deixam de emitir o warning.

## Open Questions

Nenhuma.
