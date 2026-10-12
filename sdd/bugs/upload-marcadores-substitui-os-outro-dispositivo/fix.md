# Bug Fix: Upload de marcadores substitui os de outro dispositivo

- **Slug**: `upload-marcadores-substitui-os-outro-dispositivo`
- **Corrigido**: 2026-10-12
- **Assessment**: ./assessment.md
- **Status**: applied

## Plano (registrado em vez de confirmado — execução autorizada sem pausa pelo usuário)

- Extrair o merge por `syncKey` + timestamp efetivo (com tombstones) e os validadores do arquivo remoto de `BookmarkDriveRestoreService` para `BookmarkDriveMerge.ts` (evita import circular restore ↔ sync).
- `BookmarkDriveSyncClient` ganha `getJson`; `GoogleDriveAppDataService` já implementa, nada muda nele.
- Em `syncBookBookmarks`, se o arquivo remoto existir: `getJson` → valida schema/hash → merge no banco local → relê o banco (união reconciliada) → publica.
- Falha de leitura, schema desconhecido ou hash divergente lançam erro antes de qualquer escrita; os bookmarks ficam com `syncError` e o retry existente tenta de novo.
- Testes: unit (lê antes de escrever; não escreve se leitura falhar/schema desconhecido) + integração com fake-indexeddb (dois aparelhos, exclusão × edição, retry sem duplicar).
- Concorrência de escrita (ETag/If-Match) fica como follow-up.

## Summary

O upload de marcadores agora lê e reconcilia o arquivo do Drive antes de publicar, usando a mesma lógica de merge do restore (extraída para um módulo compartilhado). O remoto passa a ser a união reconciliada dos aparelhos, tombstones são preservados, e qualquer falha na leitura aborta o sync sem sobrescrever.

## Changes

| Arquivo | Mudança | Notas |
| --- | --- | --- |
| `src/services/BookmarkDriveMerge.ts` | added | `mergeRemoteBookmarksIntoLocal`, `isSupportedRemoteBookmarkFile`, `isRemoteBookmark` — movidos do restore sem mudança de comportamento |
| `src/services/BookmarkDriveRestoreService.ts` | modified | passa a importar o merge/validadores do novo módulo; remove as cópias locais |
| `src/services/BookmarkDriveSyncService.ts` | modified | `getJson` na interface; read → validate → merge → reler → upload; log `remoteMergedCount` |
| `src/__tests__/services/BookmarkDriveSyncService.test.ts` | modified | mock do client com `getJson`; 3 testes novos |
| `src/__tests__/services/BookmarkDriveSyncIntegration.test.ts` | modified | 3 testes novos de dois aparelhos + helper `readRemote` |

## Tests Added or Updated

- `BookmarkDriveSyncService.test.ts::le o remoto antes de atualizar arquivo existente (bug R03)` — `getJson` é chamado antes de `updateJson`.
- `BookmarkDriveSyncService.test.ts::nao sobrescreve o remoto quando a leitura falha (bug R03)` — falha em `getJson` não escreve e marca `syncError`.
- `BookmarkDriveSyncService.test.ts::nao sobrescreve remoto com schema desconhecido (bug R03)` — schema futuro não é destruído.
- `BookmarkDriveSyncIntegration.test.ts::preserva marcador de outro aparelho ao publicar o local (bug R03)` — cenário do relatório (A cria X, B cria Y): remoto e local de B terminam com X e Y; retry sem mudanças não duplica.
- `BookmarkDriveSyncIntegration.test.ts::exclusao remota mais recente vence edicao local antiga e nao ressuscita (bug R03)`.
- `BookmarkDriveSyncIntegration.test.ts::edicao local mais recente vence tombstone remoto antigo (bug R03)`.

## Local Verification

- `npx vitest run src/__tests__/services/BookmarkDriveSyncService.test.ts src/__tests__/services/BookmarkDriveSyncIntegration.test.ts src/__tests__/services/BookmarkDriveRestoreService.test.ts src/__tests__/services/BookmarkDriveSyncTriggers.test.ts src/__tests__/services/BookmarkDriveSyncModel.test.ts` → 5 arquivos, 38 testes passando.
- Prova de que os testes travam o bug: com `BookmarkDriveSyncService.ts` temporariamente revertido para `HEAD` (e restaurado em seguida), 5 dos 6 testes novos falham (o de "edição local vence tombstone antigo" passa também no código antigo, como esperado — ele cobre não-regressão do merge).
- `npx tsc -p tsconfig.app.json --noEmit` → exit 0.
- `npx eslint` nos 5 arquivos alterados → exit 0.
- Probe `R03` (`reports/code-review-2026-10-10/data.probe.ts`) agora falha (a probe afirma o bug): o client sintético dela não tem `getJson`, então o sync aborta sem escrever e `remote-only` permanece no remoto — o comportamento seguro desejado.

## Deviations from Assessment

- Nenhuma de escopo. `GoogleDriveAppDataService` não foi alterado (já tinha `getJson`). `src/db/bookmarks.ts` e `BookmarkDriveSyncModel.ts` não precisaram mudar.

## Follow-ups

- Concorrência de escrita: ainda existe janela entre `getJson` e `updateJson` em que dois aparelhos publicando ao mesmo tempo podem perder a alteração do primeiro. Solução: upload condicional por ETag/`If-Match` (ou `version`) no `GoogleDriveAppDataService`, compartilhado com vocabulário (R01) — fazer junto com o R01.
- Pull sem alteração local: um aparelho só recebe marcadores novos de outro quando ele próprio sincroniza (ou reimporta). Para "aparecer nos dois lados" sem ação, falta um pull ao abrir o livro/resume — isso é feature, não fix.
- A probe R03 do relatório afirma o comportamento antigo; ela não é gate de regressão (os testes acima são).
