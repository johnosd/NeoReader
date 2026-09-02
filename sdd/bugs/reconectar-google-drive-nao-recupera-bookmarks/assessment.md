# Bug Assessment: Reconectar Google Drive não recupera bookmarks sem tentativa prévia registrada

- **Slug**: `reconectar-google-drive-nao-recupera-bookmarks`
- **Criado**: 2026-09-02
- **Origem**: texto colado — achado ao vivo pelo usuário testando no device o fix do bug irmão `tela-sincronizacao-na-nuvem-sem-opcao` ("deu certo mas o bookmark ainda esta pending/offline. o restante esta com connected").
- **Veredito**: valid
- **Severidade**: medium

## Report

> deu certo mas o bookmark ainda esta pending/offline.
> o restante esta com connected

Contexto: usuário tocou em "Conectar Google Drive" (fix do bug
`tela-sincronizacao-na-nuvem-sem-opcao`, que corrigiu o botão não aparecer).
O fluxo de reautorização completou — Progresso e Vocabulário foram pra
"Conectado" — mas Bookmarks ficou preso em "Pendente/offline" mesmo depois
da reconexão bem-sucedida.

## Symptom

Depois de reconectar o Google Drive com sucesso, o status de sync de
**Bookmarks** não sai de `pending-offline`, enquanto **Progresso** e
**Vocabulário** chegam em `connected` normalmente. Esperado: os 3 tipos
deveriam se recuperar igualmente depois de uma reconexão bem-sucedida.

## Reproduction

1. Usuário Pro com pelo menos 1 bookmark cujo `syncError` está `null`/
   `undefined` — ex.: um bookmark criado/editado enquanto o status de sync
   estava `permission-error` (a criação nunca chega a tentar de verdade,
   ver Root Cause).
2. Reconectar o Google Drive (botão "Conectar Google Drive", fix anterior).
3. **Esperado**: bookmark(s) desse livro sincronizam e o status vira
   `connected`.
4. **Observado**: nada acontece com bookmarks — status permanece
   `pending-offline` indefinidamente, até o usuário criar/editar/apagar
   manualmente um bookmark (o que dispara sync só pra aquele `bookId`
   específico).

Não reproduzi manualmente no device (fase Assess é read-only) — a
reprodução é determinística por leitura de código (ver Suspected Code
Paths) e já foi observada ao vivo pelo usuário.

## Suspected Code Paths

- `src/screens/SettingsSyncScreen.tsx:138-141` (dentro de
  `handleReconnectDrive`) — só re-agenda bookmarks com `syncError != null`:
  ```ts
  const failedBookmarks = await db.bookmarks.filter((b) => b.syncError != null).toArray()
  const bookmarkBookIds = [...new Set(failedBookmarks.map((b) => b.bookId))]
  for (const bookId of bookmarkBookIds) scheduleBookmarkDriveSync(bookId)
  ```
  Compare com o bloco de **progress** logo abaixo (linhas 143-146), que
  re-agenda **todos** os `bookId`s com registro de progresso, sem filtrar
  por erro prévio:
  ```ts
  const progressRecords = await db.progress.toArray()
  const progressBookIds = [...new Set(progressRecords.map((p) => p.bookId))]
  for (const bookId of progressBookIds) scheduleProgressDriveSync(bookId)
  ```
  Essa assimetria é a causa direta do sintoma.
- `src/services/BookmarkDriveSyncService.ts:44-46` (`scheduleBookmarkDriveSync`)
  — sai cedo (`return`) se `getCachedBookmarkDriveSyncStatus().code === 'permission-error'`,
  **antes** de chamar `syncBookBookmarks`. Enquanto o token estava inválido,
  qualquer chamada disparada por CRUD de bookmark (`src/db/bookmarks.ts:31,47,58,69`)
  foi descartada nesse guard sem nunca rodar — logo, sem nunca chegar em
  `markSnapshotsFailed` (`BookmarkDriveSyncService.ts:184-196`), que é o
  único lugar que grava `syncError` num bookmark. Um bookmark criado nesse
  período nasce com `syncError: null` (`src/db/bookmarks.ts:26`) e nunca
  ganha um valor — fica permanentemente invisível pro filtro da linha 139.
- `src/services/BookmarkDriveSyncService.ts:110` (`syncBookBookmarks`) —
  confirma que, uma vez chamada de fato, a função sempre marca `'connected'`
  no sucesso, mesmo com a lista de bookmarks vazia (sem early-return por
  lista vazia, diferente de progress — ver Risks). Ou seja: o problema não
  é a função de sync em si, é que ela nunca chega a ser chamada pros
  `bookId`s certos depois do reconnect.
- Confirmado que não existe nenhum outro gatilho automático em background
  que resincronize bookmarks "esquecidos" com o tempo (só CRUD explícito de
  bookmark, ou reimportar aquele livro específico via
  `BookImportService.ts` → `BookmarkDriveRestoreService.ts`, que só ajuda
  se já existir arquivo remoto pra aquele livro).

## Root Cause Hypothesis

**Confiança: high.** `handleReconnectDrive` trata bookmarks de forma
assimétrica em relação a progress: só tenta recuperar bookmarks que **já
tentaram e falharam** (têm `syncError` gravado), não bookmarks que **nunca
chegaram a tentar** porque o guard de `permission-error` em
`scheduleBookmarkDriveSync` descartou a chamada original silenciosamente,
sem nunca marcar erro algum. O padrão correto já existe no mesmo arquivo,
2 blocos abaixo, pra progress: re-agendar incondicionalmente todos os
`bookId`s com registro local, sem depender de erro prévio.

## Proposed Remediation

**Preferida**: Em `handleReconnectDrive`, trocar o filtro por
`syncError != null` por uma coleta incondicional de todos os `bookId`s
distintos com bookmark local (`db.bookmarks.toArray()`), espelhando
exatamente o padrão já usado pro bloco de progress logo abaixo. Isso
resolve tanto o caso "bookmark com erro registrado" (comportamento já
existente, preservado) quanto o caso "bookmark nunca tentado" (o bug
relatado).

**Alternativas** (opcional):
- Remover o guard de `permission-error` em `scheduleBookmarkDriveSync`
  (linha 46) pra que CRUD de bookmark durante um token inválido já grave
  `syncError` (via a tentativa real de sync falhando), em vez de descartar
  silenciosamente. Rejeitada por ora: mudaria o comportamento de todo
  disparo de sync de bookmark (não só o fluxo de reconexão), incluindo
  potencialmente gerar mais chamadas de rede fadadas a falhar enquanto o
  token está mesmo inválido — escopo maior que o necessário pro sintoma
  relatado, e a correção preferida já resolve o caso relatado sem esse
  risco.

**Files likely to change**:
- `src/screens/SettingsSyncScreen.tsx`
- `src/__tests__/screens/SettingsSyncScreen.test.tsx`

**Tests to add or update**:
- Novo teste: `handleReconnectDrive` chama `scheduleBookmarkDriveSync` (ou
  equivalente observável) pra um `bookId` que tem bookmark local **sem**
  `syncError` registrado — hoje isso não aconteceria; depois do fix, deve
  acontecer, espelhando o teste que provavelmente já existe (ou deveria
  existir) pra confirmar o mesmo comportamento em progress.

## Risks & Considerations

- A mudança preferida re-sincroniza bookmarks que já estavam `connected`
  (não só os com erro) toda vez que o usuário reconectar — mesma
  característica que o bloco de progress já tem hoje (aceito, é o padrão
  já em produção). Custo: algumas chamadas de rede extras no reconnect, não
  um problema de correção.
- `syncBookBookmarks` sempre marca `'connected'` mesmo com lista vazia de
  bookmarks (sem early-return, diferente de progress que retorna cedo se
  `!progress`) — isso é comportamento pré-existente, não alterado por este
  fix, e não é a causa do sintoma relatado (o problema é a função nunca ser
  chamada, não o que ela faz quando é chamada).
- Fora de escopo: revisar o guard de `permission-error` em
  `scheduleBookmarkDriveSync` (ver Alternativas) — fica só como observação,
  não é necessário pro sintoma relatado.

## Open Questions

Nenhuma — escopo e causa raiz claros o bastante pra seguir direto pra fase
Fix.
