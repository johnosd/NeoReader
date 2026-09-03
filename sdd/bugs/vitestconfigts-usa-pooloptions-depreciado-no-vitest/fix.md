# Bug Fix: `vitest.config.ts` usa `test.poolOptions`, removido no Vitest 4

<!--
  Preenchido pela fase Fix do sdd-bugfix — a ÚNICA fase que edita
  código-fonte. Nunca edite assessment.md; qualquer desvio do que ele previu
  vai em "Deviations from Assessment" abaixo, não como reescrita silenciosa.
-->

- **Slug**: vitestconfigts-usa-pooloptions-depreciado-no-vitest
- **Corrigido**: 2026-09-03
- **Assessment**: ./assessment.md
- **Status**: applied

## Summary

Migrado `test.poolOptions.threads.maxThreads` para a opção top-level `test.maxWorkers` em `vitest.config.ts`, seguindo a migração 1:1 documentada pelo Vitest 4 (pool rework) — elimina o warning `DEPRECATED` sem mudar o comportamento de concorrência dos testes.

## Changes

| Arquivo | Mudança | Notas |
| --- | --- | --- |
| `vitest.config.ts` | modified | Removido bloco `poolOptions: { threads: { maxThreads: ... } }`; adicionado `maxWorkers: Math.max(2, Math.floor(os.cpus().length / 2))` direto em `test`. Comentário explicativo original mantido. |

## Tests Added or Updated

- Nenhum — conforme previsto no assessment, é migração mecânica de config de tooling, sem teste automatizado aplicável.

## Local Verification

- `npm test` → antes do fix: bloco `DEPRECATED` no topo do output, 106 arquivos / 775 testes passaram (2 skipped). Depois do fix: **sem** o bloco `DEPRECATED`, mesma contagem (106 arquivos / 775 testes passaram, 2 skipped).
- `npm run build` → passou sem erros (`tsc -b` + build de produção); únicos warnings são pré-existentes (chunk size, plugin timings), sem relação com a mudança.

## Deviations from Assessment

Nenhum — mudança aplicada exatamente como proposto no assessment.

## Follow-ups

- Nenhum necessário. `test:watch` usa o mesmo `vitest.config.ts`, então também deixa de emitir o warning (não testado interativamente, mas a config é compartilhada).
