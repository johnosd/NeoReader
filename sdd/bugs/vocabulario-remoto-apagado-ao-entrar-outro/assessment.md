# Bug Assessment: Vocabulário remoto apagado ao entrar em outro dispositivo

- **Slug**: vocabulario-remoto-apagado-ao-entrar-outro
- **Criado**: 2026-10-12
- **Origem**: `reports/code-review-2026-10-10.md`, achado R01 (P1); reprodução em `reports/code-review-2026-10-10/data.probe.ts` (teste "R01")
- **Veredito**: valid
- **Severidade**: high

## Report

> **R01 — P1 — Vocabulário remoto pode ser apagado ao entrar em outro dispositivo.**
> O efeito de login agenda imediatamente a sincronização. `syncVocabulary` lê a
> tabela local, monta um snapshot e substitui o arquivo remoto existente. Não lê
> nem mescla seu conteúdo. Existe `restoreVocabularyFromDrive`, mas não é
> chamada no fluxo de produção.
>
> **Cenário:** A possui palavras sincronizadas. O usuário Pro entra em B com
> tabela vazia e Drive autorizado. O upload de B envia `items: []`, removendo as
> palavras do arquivo remoto.
>
> **Aceitação:** login em B preserva palavras de A; inclusões offline em ambos
> sobrevivem; exclusão intencional propaga sem ressuscitar; falha de restauração
> impede sobrescrita destrutiva mantendo uso local.

## Symptom

Ao fazer login num dispositivo com vocabulário local vazio (reinstalação, celular
novo), o app publica `items: []` no Drive e apaga o backup de vocabulário do
usuário Pro. Esperado: o backup remoto ser restaurado/preservado.

## Reproduction

1. Arquivo `neoreader-vocabulary-v1.json` no appDataFolder com itens (device A).
2. Device B com tabela `vocabulary` vazia, usuário Pro, Drive autorizado.
3. Login → `App.tsx` (efeito em `signedInUid`, ~l.124) chama `scheduleVocabularyDriveSync()`.
4. `syncVocabulary` → `list()` acha o arquivo → `updateJson(id, { items: [] })` sem nunca chamar `getJson`.

Reproduzido pelo teste R01 do probe (rede simulada, serviço e payload reais):
o remoto termina `items: []` e `getJson` não é chamado.

## Suspected Code Paths

- `src/services/VocabularyDriveSyncService.ts:68-77` — `syncVocabulary` publica o snapshot local via `updateJson` sem ler o remoto.
- `src/services/VocabularyDriveSyncService.ts:96-138` — `restoreVocabularyFromDrive` (merge remoto→local por `vocabSyncKey`) existe mas não tem chamador em produção.
- `src/App.tsx:124` — dispara o sync no login (gatilho, não a causa).
- `src/db/vocabulary.ts` — `addVocabItem`/`deleteVocabItem` também disparam o sync; qualquer adição em B também apagaria o remoto (exceto o item novo).

## Root Cause Hypothesis

Confiança: high. O sync é "last writer wins" em nível de arquivo inteiro: o
estado local é tratado como verdade absoluta, sem leitura nem reconciliação do
remoto. Num dispositivo não hidratado, local vazio = remoto vazio.

## Proposed Remediation

**Preferida (mínima, sem mudar schema):** reconciliação de 3 vias dentro de
`syncVocabulary`, antes de publicar:

1. Se o arquivo remoto existe, `getJson` dele. Falha de leitura ou formato
   inválido (`items` não é array) → aborta **sem escrever** (status de erro,
   uso local segue normal).
2. Mantém uma **baseline local** por conta/banco (localStorage,
   `neoreader:vocab-drive-baseline:<db.name>`) com as `vocabSyncKey`s da última
   publicação bem-sucedida deste dispositivo.
3. Item remoto ausente localmente:
   - não está na baseline → é de outro dispositivo (ou o device nunca sincronizou)
     → restaura no local (`bulkAdd`, `bookId: 0`, como o restore existente);
   - está na baseline → este dispositivo publicou e depois excluiu → exclusão
     intencional, não restaura.
4. Publica a união resultante (tabela local após o restore) e só então grava a
   nova baseline.

Isso cobre: login em B preserva A; inclusões offline em ambos sobrevivem;
exclusão feita **neste** dispositivo propaga sem ressuscitar; falha de leitura
não sobrescreve. Baseline ausente (instalação nova, storage limpo, upgrade) cai
no lado seguro: restaura tudo (pior caso = ressuscitar, nunca perder).

**Alternativas:**
- Chamar `restoreVocabularyFromDrive` antes do sync no login — não resolve: ele
  engole erros (falha de restauração seguida de sync vazio continua destrutiva) e
  qualquer `addVocabItem` antes do restore também apaga o remoto.
- Merge incondicional (união sempre) — simples, mas exclusões nunca propagam
  (item excluído volta no próximo sync).
- Tombstones no arquivo remoto + política de conflito + escrita condicional
  (ETag/`If-Match`) — é a solução completa pedida pelo relatório; exige mudar
  o formato remoto (schema v2) e o client do Drive. Fica como follow-up.

**Files likely to change:**
- `src/services/VocabularyDriveSyncService.ts`
- `src/services/VocabularyDriveSyncModel.ts` (helpers puros de merge/mapeamento)
- `src/__tests__/services/VocabularyDriveSyncService.test.ts` (novo)

**Tests to add or update:**
- Local vazio + remoto com itens → itens restaurados no local e remoto publicado com a união (reprodução R01 invertida).
- Local e remoto com itens distintos (adições offline em ambos) → união dos dois lados.
- Item na baseline e ausente no local (exclusão local) → não ressuscita e sai do remoto.
- `getJson` rejeita → `updateJson` não é chamado.
- Remoto com formato inválido → `updateJson` não é chamado.
- Sem arquivo remoto → `createJson` com o local (comportamento atual preservado).

## Risks & Considerations

- **Exclusão feita em outro dispositivo ressuscita**: A exclui X e publica; B
  ainda tem X localmente → B republica X. Sem tombstones remotos não há como
  distinguir "A excluiu" de "B adicionou". Não é perda de dados; follow-up.
- **Corrida read-then-write** entre dois dispositivos publicando ao mesmo tempo
  ainda pode perder a adição de um deles (janela de segundos). Follow-up: escrita
  condicional por versão/ETag no `GoogleDriveAppDataService`.
- **Baseline em localStorage**: se for apagada, o efeito é só restaurar itens
  excluídos (seguro). A chave usa `db.name`, que já é por conta.
- Itens restaurados ficam com `bookId: 0` (sem livro vinculado), igual ao
  `restoreVocabularyFromDrive` existente — não aparecem no highlight por livro.
  Limitação preexistente do modelo remoto (identidade por `bookTitle`).
- `vocabSyncKey` usa `bookTitle::sourceText::targetLang`; duplicatas locais com a
  mesma chave continuam sendo publicadas como hoje (fora de escopo).
- Não tocar em bookmarks/TTS/OPDS (outros bugs em paralelo).

## Open Questions

- Nenhuma bloqueante. Tombstones/conflito/escrita condicional ficam como follow-up
  explícito (ver Risks).
