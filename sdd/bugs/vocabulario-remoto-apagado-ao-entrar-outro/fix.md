# Bug Fix: Vocabulário remoto apagado ao entrar em outro dispositivo

- **Slug**: vocabulario-remoto-apagado-ao-entrar-outro
- **Corrigido**: 2026-10-12
- **Assessment**: ./assessment.md
- **Status**: applied

## Plano (registrado em vez de confirmado — execução autorizada pelo usuário)

- Ler o arquivo remoto antes de publicar; falha de leitura ou formato inválido aborta sem escrever.
- Merge de 3 vias por `vocabSyncKey` com baseline local (chaves publicadas no último sync deste device).
- Restaurar no local o que só existe no remoto e não está na baseline; publicar a união.
- Gravar a baseline só depois da escrita confirmada no Drive.
- Testes de serviço com IndexedDB falso e Drive em memória cobrindo os critérios de aceitação alcançáveis sem tombstones.

## Summary

`syncVocabulary` passou a ler e mesclar o arquivo remoto antes de publicar, em
vez de sobrescrevê-lo com a tabela local. Um device com vocabulário vazio agora
restaura o backup no login em vez de apagá-lo; falha ao ler o remoto não escreve
nada.

## Changes

| Arquivo | Mudança | Notas |
| --- | --- | --- |
| `src/services/VocabularyDriveSyncService.ts` | modified | `getJson` + validação + restore (`bulkAdd`) antes do `updateJson`; baseline em localStorage (`neoreader:vocab-drive-baseline:<db.name>`) lida/gravada com try/catch; `restoredCount` no log de sucesso |
| `src/services/VocabularyDriveSyncModel.ts` | modified | helpers puros `isRemoteVocabFile`, `normalizeRemoteVocabItem`, `fromRemoteVocabItem`, `selectRemoteItemsToRestore` (merge de 3 vias; itens remotos parciais são normalizados, só itens sem `sourceText` são ignorados; duplicados não são restaurados duas vezes) |
| `src/__tests__/services/VocabularyDriveSyncService.test.ts` | added | 8 testes com `fake-indexeddb` e Drive em memória |

`App.tsx` não precisou mudar: o gatilho de login continua o mesmo, agora seguro.
`restoreVocabularyFromDrive` foi mantida intacta (sem chamador; candidata a remoção).

## Tests Added or Updated

- `VocabularyDriveSyncService.test.ts::device novo com tabela vazia restaura o remoto em vez de apagá-lo` — reprodução R01 invertida.
- `::adições offline nos dois lados sobrevivem (publica a união)`
- `::exclusão feita neste device propaga e não ressuscita` — baseline impede a ressurreição.
- `::item adicionado por outro device depois do último sync é restaurado`
- `::item remoto com campos faltando é restaurado (não some do Drive) e não duplica` — mesmo payload do probe R01.
- `::falha ao ler o remoto não sobrescreve o arquivo`
- `::remoto com formato inválido não é sobrescrito`
- `::sem arquivo remoto cria o arquivo com o vocabulário local` — comportamento antigo preservado.

## Local Verification

- `npx vitest run src/__tests__/services/VocabularyDriveSyncService.test.ts src/__tests__/db/vocabulary.test.ts src/__tests__/screens/SettingsSyncScreen.test.tsx src/__tests__/App.test.tsx` → 4 arquivos, 37 testes passando (após a 2ª iteração).
- Prova de regressão: com o `VocabularyDriveSyncService.ts` do `HEAD` no lugar (restaurado logo depois), os novos testes falham 5/7 — os 2 que passam são os de exclusão local e criação sem remoto, que o código antigo já atendia.
- `npx tsc -p tsconfig.app.json --noEmit` → exit 0 (obs.: esse tsconfig exclui `src/__tests__`).
- `npx eslint` nos 3 arquivos → exit 0.
- `npm run build` / `npm test` completos: não rodados por restrição de coordenação (outros agentes no mesmo working tree).

## Deviations from Assessment

- **2ª iteração do Fix (disparada pelo probe original)**: a primeira versão
  descartava itens remotos sem `bookTitle`/`targetLang` como "malformados" — e,
  como o publish é a tabela local, eles sumiam do Drive. O probe R01 (remoto
  `{ items: [{ sourceText }] }`) continuava terminando em `items: []`. Corrigido
  normalizando campos ausentes para `''` e calculando a chave sobre o item
  normalizado (evita restaurar em loop). Ainda dentro dos arquivos previstos.
  Itens sem `sourceText` continuam descartados (não há conteúdo a preservar).

## Follow-ups

- **Tombstones remotos** (schema v2 do arquivo): exclusão feita em OUTRO device ainda ressuscita quando este device tem o item localmente. Não é perda de dados.
- **Escrita condicional** (ETag/`If-Match` no `GoogleDriveAppDataService`): dois devices publicando no mesmo instante ainda podem perder a adição de um deles (janela read→write).
- Itens restaurados ficam com `bookId: 0` (não aparecem no highlight por livro) — limitação preexistente; poderia religar por `bookTitle` a um livro local.
- Remover ou reaproveitar `restoreVocabularyFromDrive` (código morto em produção).
- Validar em device real: reinstalar com usuário Pro e conferir no logcat `vocabulary.sync.success` com `restoredCount > 0`.
