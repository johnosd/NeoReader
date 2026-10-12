# Bug Assessment: Upload de marcadores substitui os de outro dispositivo

- **Slug**: `upload-marcadores-substitui-os-outro-dispositivo`
- **Criado**: 2026-10-12
- **Origem**: `reports/code-review-2026-10-10.md` — seção "R03 — P1 — Marcadores de outro dispositivo são substituídos"; reprodução em `reports/code-review-2026-10-10/data.probe.ts` (teste `R03`).
- **Veredito**: valid
- **Severidade**: high

## Report

> O upload constrói o arquivo somente com a tabela local e executa `updateJson`. A interface desse fluxo nem inclui leitura do JSON. A restauração na importação não resolve alterações posteriores de outro dispositivo.
>
> **Cenário:** A e B já importaram o livro. A cria X. B, ainda com snapshot antigo, cria Y e publica seu conjunto local; X desaparece do remoto. O mecanismo também pode remover informações de exclusão necessárias à reconciliação.
>
> **Correção:** mesclar por identidade e timestamp, incluindo exclusões, preservar alterações pendentes e tratar concorrência na escrita.
>
> **Aceitação:** dois dispositivos adicionam sem reimportar; ambos os marcadores aparecem nos dois lados. Cobrir exclusão versus edição, publicação simultânea, offline e retry sem duplicação.

## Symptom

Ao sincronizar os marcadores de um livro, o app publica no Drive apenas o que está na tabela local, sobrescrevendo o arquivo remoto (last-writer-wins). Marcadores (e tombstones) criados por outro aparelho depois da importação somem do remoto. Esperado: o remoto ser a união reconciliada dos dois aparelhos.

## Reproduction

1. Livro com `fileHash` já importado em A e B (restore da importação já rodou nos dois).
2. A cria o marcador X → `syncBookBookmarks` publica `{X}`.
3. B (sem X localmente) cria Y → `syncBookBookmarks` publica `{Y}` via `updateJson` sem ler o remoto.
4. Remoto agora = `{Y}`; X perdido. Se A reimportar, X só sobrevive porque ainda está no banco de A — mas o tombstone de uma exclusão feita em A também poderia ter sido apagado.

Reprodução automatizada: probe `R03` em `reports/code-review-2026-10-10/data.probe.ts` (remoto com `remote-only` vira só `local` após o sync; passa = bug presente).

## Suspected Code Paths

- `src/services/BookmarkDriveSyncService.ts:62-145` (`syncBookBookmarks`) — monta `createRemoteBookmarkFile` só com `db.bookmarks` local e chama `updateJson` direto.
- `src/services/BookmarkDriveSyncService.ts:25-29` (`BookmarkDriveSyncClient`) — interface sem `getJson`; o fluxo nem tem como ler o remoto.
- `src/services/BookmarkDriveRestoreService.ts:153-218` (`mergeBookmarks`) — já implementa o merge correto por `syncKey` + timestamp efetivo (`deletedAt ?? updatedAt ?? createdAt`) com tombstones, mas só é usado em `restoreBookBookmarksFromDrive`, chamado apenas na importação (`src/services/BookImportService.ts:905`).

## Root Cause Hypothesis

Confiança: high. O sync foi desenhado como "push" puro, assumindo que o restore da importação deixa o local como superconjunto do remoto. Isso só vale no instante da importação; qualquer alteração posterior em outro aparelho é descartada pelo próximo push de um aparelho com snapshot antigo. A lógica de reconciliação existe, mas está acoplada ao fluxo de restore.

## Proposed Remediation

**Preferida**: no `syncBookBookmarks`, quando o arquivo remoto existir, ler o JSON (`getJson`), validar (schema + hash) e rodar o mesmo merge do restore contra o banco local (aplica no local o que é novo/mais recente no remoto, incluindo tombstones). Depois reler a tabela local (agora = união reconciliada) e publicar. Qualquer falha na leitura/validação do remoto aborta o sync sem escrever (marca os bookmarks como falha, retry posterior). Extrair o merge + validadores para um módulo compartilhado (ex. `BookmarkDriveMerge.ts`) para evitar import circular (`Restore` já importa `scheduleBookmarkDriveSync` de `Sync`).

**Alternativas**:
- Mesclar só em memória (sem aplicar no local) — publica a união, mas o aparelho B não passa a ver X; pior e diverge do restore.
- Upload condicional por ETag/versão (`If-Match`) — resolve a corrida entre leitura e escrita, mas exige mudar `GoogleDriveAppDataService` (compartilhado com vocabulário/R01). Fica como follow-up.

**Files likely to change**:
- `src/services/BookmarkDriveSyncService.ts`
- `src/services/BookmarkDriveRestoreService.ts` (passa a importar o merge extraído)
- `src/services/BookmarkDriveMerge.ts` (novo — merge + validadores extraídos do restore)

**Tests to add or update**:
- `src/__tests__/services/BookmarkDriveSyncService.test.ts` — mock do client ganha `getJson`; casos: falha em `getJson` não chama `updateJson`; schema não suportado não sobrescreve.
- `src/__tests__/services/BookmarkDriveSyncIntegration.test.ts` (fake-indexeddb) — dois aparelhos: remoto com X + local com Y → remoto final com X e Y e X aplicado no local; tombstone remoto mais recente apaga localmente e continua no remoto; probe R03 com expectativa invertida.

## Risks & Considerations

- Ainda há janela de corrida entre `getJson` e `updateJson` (dois aparelhos publicando ao mesmo tempo) — sem ETag não é eliminável. Muito menor que o bug atual (perda determinística).
- Sync passa a fazer 1 GET extra por livro sincronizado.
- O merge aplica dados remotos no banco local durante o sync — a UI de marcadores pode ver itens novos aparecerem (desejado).
- Arquivo remoto com schema futuro/desconhecido: abortar em vez de sobrescrever (evita apagar dados de versão mais nova do app).
- Pull sem alteração local: B só recebe X quando sincronizar algo (ou reimportar); o retry só agenda livros com pendência local. Não é escopo deste fix.

## Open Questions

- Nenhuma bloqueante.
