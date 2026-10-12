# Bug Fix: Re-download OPDS falha após excluir o livro

- **Slug**: opds-redownload-apos-exclusao
- **Corrigido**: 2026-10-12
- **Assessment**: ./assessment.md
- **Status**: applied

## Plano (registrado em vez de confirmação — execução autorizada pelo usuário)

- `deleteBook` inclui `db.opdsDownloadedEntries` na transação e apaga os vínculos por `bookId`.
- `recordDownload` vira upsert por `[catalogId+entryId]` dentro de transação rw.
- Coordenador ganha `forgetOpdsDownloadsForBook(bookId)`; `deleteBook` chama após a transação.
- Sem mudança de schema Dexie (índice `bookId` já existe na v19).
- Testes unitários nos 3 módulos + rerodar o probe R06.

## Summary

Vínculos OPDS agora saem junto com o livro, o registro do download é
idempotente (cobre órfãos já existentes no banco) e o estado em memória deixa
de dizer "já baixado" para um livro excluído.

## Changes

| Arquivo | Mudança | Notas |
| --- | --- | --- |
| `src/db/books.ts` | modified | só `deleteBook` (+ import): tabela na transação, delete por `bookId`, `forgetOpdsDownloadsForBook(id)` após a transação |
| `src/db/opdsDownloadedEntries.ts` | modified | `recordDownload` faz get+update/add numa transação rw |
| `src/services/opds/OpdsDownloadCoordinator.ts` | modified | nova `forgetOpdsDownloadsForBook(bookId)`; emite só se algo mudou |

`OpdsDownloadService.ts` não precisou mudar (commit 53a25e9 preservado).

## Tests Added or Updated

- `src/__tests__/db/books.deleteBook.test.ts::remove o vínculo OPDS e libera o estado em memória do download`
- `src/__tests__/db/opdsDownloadedEntries.test.ts::registrar de novo a mesma entry atualiza o vínculo em vez de duplicar` (mock ganhou `update`/`transaction`)
- `src/__tests__/services/opds/OpdsDownloadCoordinator.test.ts::forgetOpdsDownloadsForBook volta pra idle só as entries daquele livro`

## Local Verification

- `npx vitest run src/__tests__/db/books.deleteBook.test.ts src/__tests__/db/opdsDownloadedEntries.test.ts src/__tests__/services/opds/` → 8 arquivos, 71 testes passando (após corrigir a ordem de um assert no teste novo do coordenador).
- `npx vitest run --config reports/code-review-2026-10-10/vitest.review.config.ts reports/code-review-2026-10-10/data.probe.ts -t R06` → o probe (que afirma o comportamento defeituoso) agora FALHA com "promise resolved undefined instead of rejecting": com Dexie real + fake-indexeddb o re-download não dá mais ConstraintError.
- `npx tsc -p tsconfig.app.json --noEmit` → sem erros.
- `npx eslint` nos 6 arquivos alterados → sem avisos.

## Deviations from Assessment

Nenhuma.

## Follow-ups

- Build e suite completa ficam para o orquestrador (vários agentes em paralelo no mesmo working tree).
