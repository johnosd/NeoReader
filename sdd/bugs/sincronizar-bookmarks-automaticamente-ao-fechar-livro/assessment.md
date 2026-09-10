# Bug Assessment: Sincronizar bookmarks automaticamente ao fechar o livro

- **Slug**: sincronizar-bookmarks-automaticamente-ao-fechar-livro
- **Criado**: 2026-09-10
- **Origem**: texto colado (usuário, na conversa)
- **Veredito**: valid
- **Severidade**: medium

## Report

"Toda vez que eu fecho um livro, eu percebo que na parte de bookmarks, o
bookmark que eu criei, está vermelho. Aí eu clico e ele sincroniza. Será
que não poderíamos colocar uma sincronização já automática assim que a
pessoa fecha o livro caso tenha algum bookmark não sincronizado?"

## Symptom

Observado: depois de criar um bookmark durante a leitura e fechar o
livro (voltar da tela do leitor), o bookmark aparece na aba de
Marcações (`BookDetailsScreen`) com o ícone vermelho de "não
sincronizado" — exigindo um toque manual pra sincronizar (esse toque em
si já funciona hoje, corrigido pelo bugfix
`bookmark-nao-sincroniza-ao-clicar-no`).
Esperado (pedido do usuário): se houver algum bookmark do livro ainda
não sincronizado no momento em que o leitor é fechado, a sincronização
deveria disparar automaticamente nesse momento, sem exigir o toque
manual.

## Reproduction

Não reproduzido ao vivo nesta rodada — fundamentado por leitura de
código com confiança alta (ver Root Cause Hypothesis). Passos
esperados pra reproduzir manualmente:

1. Abrir um livro, criar um bookmark.
2. Fechar o livro logo em seguida (botão voltar) antes de alguns
   segundos se passarem.
3. Abrir a aba de Marcações do livro (`BookDetailsScreen`) — o
   bookmark aparece vermelho (não sincronizado) até um toque manual.

## Suspected Code Paths

- `src/db/bookmarks.ts:31,47,58,69` — `addBookmark`/`restoreBookmark`/
  `softDeleteBookmark`/`updateBookmarkColor` já chamam
  `scheduleBookmarkDriveSync(bookId)` de forma fire-and-forget (sem
  `await`) toda vez que um bookmark é criado/alterado. Ou seja, o sync
  **já é acionado na criação** — o gap não é "nunca sincroniza", é "pode
  não terminar a tempo".
- `src/services/BookmarkDriveSyncService.ts:44-51` (`scheduleBookmarkDriveSync`)
  — dedupe por `inFlightBookIds`/`rerunBookIds`, e só pula se o status
  cacheado global for `permission-error` (linha 46). Seguro de chamar
  de novo a qualquer momento — não duplica trabalho, não sobrescreve
  estado mais novo (`markSnapshotsSynced`/`markSnapshotsFailed`
  comparam `effectiveTimestamp` antes de gravar).
- `src/services/BookmarkDriveSyncService.ts:54-137` (`syncBookBookmarks`)
  — `await BillingService.waitForEntitlements()` antes de qualquer
  chamada de rede; combinado com a latência real da API do Drive
  (list + create/update), a sincronização disparada na criação do
  bookmark tem uma janela real de não terminar antes do usuário
  navegar pra longe do leitor e abrir a aba de Marcações — especialmente
  no padrão de uso relatado ("marco a página final e já fecho o
  livro").
- `src/screens/ReaderScreen.tsx:385-389` (`bookmarks`/`activeBookmarks`)
  — já existe uma `useLiveQuery` reativa com o estado atual de
  `syncedAt`/`syncError` de cada bookmark do livro, pronta pra checar
  se há algo não sincronizado sem query nova.
- `src/screens/ReaderScreen.tsx:913-916` (`handleBack`) — hoje só chama
  `flushCurrentProgress()` e `onBack()`. É o ponto natural de "fechar o
  livro" (botão voltar do chrome e botão físico Android, via
  `useCapacitorBackButton` na linha 919-925) — não existe hoje nenhuma
  tentativa de sync aqui.
- Não existe hoje nenhum sync periódico/em background fora dos pontos
  de mutação explícitos (`addBookmark` etc.), `BookmarkDriveRestoreService`
  e o toque manual em `BookDetailsScreen`/`SettingsSyncScreen` — busquei
  em `src/hooks/` e não achei nenhum hook de sync agendado.

## Root Cause Hypothesis

**Confiança: high.** O sync de bookmark já é disparado no momento certo
(criação/edição/exclusão), mas é fire-and-forget e depende de uma
chamada de rede real (Google Drive API) com latência não-trivial. Não
existe nenhuma tentativa adicional de sync no momento em que o usuário
sai do livro — só quando ele entra manualmente na aba de Marcações e
toca no ícone. Resultado: numa janela comum de uso (criar bookmark →
fechar o livro em seguida → checar Marcações), é bem provável que o
sync original ainda esteja em andamento ou tenha terminado só depois
que o usuário já olhou a tela — daí a percepção de "nunca sincroniza
sozinho, só quando eu clico".

## Proposed Remediation

**Preferida**: Em `handleBack` (`src/screens/ReaderScreen.tsx:913-916`),
antes de chamar `onBack()`, checar se `bookmarks` (a lista já reativa
via `useLiveQuery`, **não** `activeBookmarks` — bookmarks soft-deletados
também precisam sincronizar a exclusão) tem algum item com
`syncedAt == null`. Se sim, chamar
`scheduleBookmarkDriveSync(book.id!)` (fire-and-forget, mesmo padrão já
usado em `db/bookmarks.ts` — não bloquear a navegação de volta
esperando o sync terminar). `scheduleBookmarkDriveSync` já contém toda
a lógica de segurança necessária (dedupe, skip se `permission-error`
cacheado, no-op silencioso se não for usuário Pro) — não precisa
nenhuma lógica nova além da chamada em si.

**Alternativas** (opcional):
- Disparar o mesmo sync também em `useCapacitorAppStateChange` quando
  `isActive` vira `false` (app indo pra background) — cobriria o caso
  de o usuário minimizar o app em vez de tocar em voltar. Não incluído
  na remediação preferida porque o relato do usuário fala
  especificamente de "fechar o livro" (sair do leitor), e é escopo
  extra que pode ser adicionado depois se fizer falta — mudança mínima
  primeiro.

**Files likely to change**:
- `src/screens/ReaderScreen.tsx` — import de `scheduleBookmarkDriveSync`
  (`services/BookmarkDriveSyncService`) + `handleBack`.

**Tests to add or update**:
- `src/__tests__/screens/ReaderScreen.test.tsx` — o mock de
  `@/components/reader/ReaderChrome` (linha 240-246) só expõe
  `onTtsToggle` hoje; precisa expor `onBack` também (renderizar um
  botão clicável ligado à prop `onBack`) pra dar pra disparar
  `handleBack` num teste.
- Novo teste: livro com um bookmark `syncedAt: null` → `handleBack`
  (clicar no botão voltar mockado) → `scheduleBookmarkDriveSync`
  chamado com o `book.id`.
- Novo teste: livro só com bookmarks já sincronizados (`syncedAt` com
  data) → `handleBack` → `scheduleBookmarkDriveSync` **não** chamado
  (evita chamada de API desnecessária a cada saída do leitor).
- Novo teste: livro sem nenhum bookmark → `handleBack` →
  `scheduleBookmarkDriveSync` não chamado.

## Risks & Considerations

- `scheduleBookmarkDriveSync` já é seguro de chamar repetidamente
  (dedupe interno) — o único custo real de "chamar de mais" é uma
  checagem de rede supérflua ocasional (ex: sync que terminou 1ms antes
  do checkpoint rodar), não um bug funcional.
- Não altera nenhum comportamento de `BookmarkDriveSyncService.ts` —
  mudança fica isolada no ponto de disparo (`ReaderScreen.tsx`), sem
  tocar a lógica de sync em si (já corrigida e testada pelo bugfix
  anterior).
- Fire-and-forget: se o sync falhar (ex: offline no momento de fechar o
  livro), o usuário não recebe nenhum feedback disso ao sair do leitor
  — mas esse já é o comportamento aceito hoje pro sync automático na
  criação do bookmark (silencioso, só visível depois na aba de
  Marcações); não é regressão, é consistente com o padrão existente.

## Open Questions

Nenhuma bloqueante.
