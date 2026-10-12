# Bug Assessment: Re-download OPDS falha após excluir o livro

- **Slug**: opds-redownload-apos-exclusao
- **Criado**: 2026-10-12
- **Origem**: reports/code-review-2026-10-10.md, seção "R06" (reprodução em reports/code-review-2026-10-10/data.probe.ts)
- **Veredito**: valid
- **Severidade**: medium

## Report

R06 — P2 — `deleteBook` não limpa `opdsDownloadedEntries`. A consulta
(`findDownloadedBookId`) detecta que o livro acabou e retorna `null`, mas o
vínculo permanece sob o índice único `[catalogId+entryId]`. O registro do novo
download usa `add` → `ConstraintError`. O serviço importa antes de gravar o
vínculo; a UI mostra falha apesar de o livro já ter sido salvo.
Aceitação: excluir e baixar novamente funciona na mesma sessão e após
reiniciar; retry não duplica vínculo; UI/banco concordam sobre sucesso.

## Symptom

Usuário baixa um livro de um catálogo OPDS, exclui da Biblioteca e baixa de
novo: o livro é importado, mas `recordDownload` lança `ConstraintError`, o
item fica em estado de erro e o vínculo continua apontando pro livro antigo.
Esperado: re-download conclui com sucesso e o item vira "abrir".

## Reproduction

1. `addBook` → `recordDownload(5, 'same-entry', firstId)` → `deleteBook(firstId)`.
2. `findDownloadedBookId(5, 'same-entry')` → `null` (correto).
3. `addBook` → `recordDownload(5, 'same-entry', secondId)` → rejeita com
   `ConstraintError` (probe `data.probe.ts`, teste R06 — reproduzido no relatório).

## Suspected Code Paths

- `src/db/books.ts:40` (`deleteBook`) — transação não inclui `db.opdsDownloadedEntries`.
- `src/db/opdsDownloadedEntries.ts:4` (`recordDownload`) — `add` sob índice único `&[catalogId+entryId]` (database.ts:417).
- `src/services/opds/OpdsDownloadService.ts:99` — importa o livro antes de `recordDownload`; falha do vínculo vira erro na UI.
- `src/services/opds/OpdsDownloadCoordinator.ts` — estado em memória `success`+`bookId` sobrevive à exclusão; os hooks só reconciliam quando o estado é `idle`, então a mesma sessão continua mostrando "já baixado" para um livro ausente (e "abrir" não faz nada).

## Root Cause Hypothesis

Confiança: high. O vínculo OPDS não faz parte da limpeza em cascata do
`deleteBook`, e o registro não é idempotente. Os dois juntos fazem o índice
único rejeitar o segundo vínculo. O coordenador em memória não é invalidado
na exclusão.

## Proposed Remediation

**Preferida** (defesa em profundidade, sem mudar schema):
1. `deleteBook`: incluir `db.opdsDownloadedEntries` na transação e apagar
   `where('bookId').equals(id)` (índice `bookId` já existe).
2. `recordDownload`: upsert — se já existe linha para `[catalogId+entryId]`,
   atualiza `bookId`/`downloadedAt` (cobre bancos que já têm vínculo órfão de
   versões anteriores e retries).
3. Coordenador: nova função `forgetOpdsDownloadsForBook(bookId)` que volta
   para `idle` os estados `success` com aquele `bookId`; chamada pelo
   `deleteBook` após a transação.

**Alternativas**:
- Só upsert: resolve o ConstraintError mas deixa lixo órfão no banco.
- Só limpeza no delete: não conserta bancos com órfãos já existentes.

**Files likely to change**:
- `src/db/books.ts` (apenas `deleteBook`)
- `src/db/opdsDownloadedEntries.ts`
- `src/services/opds/OpdsDownloadCoordinator.ts`

**Tests to add or update**:
- `src/__tests__/db/opdsDownloadedEntries.test.ts`: recordDownload repetido atualiza em vez de duplicar.
- `src/__tests__/db/books.deleteBook.test.ts`: apaga vínculos OPDS e invalida o coordenador.
- `src/__tests__/services/opds/OpdsDownloadCoordinator.test.ts`: `forgetOpdsDownloadsForBook`.

## Risks & Considerations

- `books.ts` importar o coordenador (camada service) — já há precedente
  (`NativeLibraryImportService`); o coordenador não tem dependências pesadas.
- Upsert não-atômico (get + update/add) — corrida só com dois downloads da
  mesma entry, que o coordenador já bloqueia (`beginOpdsDownload`). Rodar
  dentro de uma transação rw para garantir atomicidade.

## Open Questions

- Nenhuma.
