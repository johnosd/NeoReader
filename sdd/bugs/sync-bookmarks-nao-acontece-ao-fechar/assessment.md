# Bug Assessment: Sync de bookmarks não acontece ao fechar a tela de leitura

<!--
  Preenchido pela fase Assess do sdd-bugfix. Este arquivo é o CONTRATO que a
  fase Fix trabalha em cima — ela fica travada aos arquivos listados em
  "Files likely to change" a menos que descubra evidência nova (o que precisa
  ser registrado em fix.md, nunca reescrito aqui).
-->

- **Slug**: sync-bookmarks-nao-acontece-ao-fechar
- **Criado**: 2026-09-11
- **Origem**: texto colado (usuário, via `/sdd-bugfix`)
- **Veredito**: valid
- **Severidade**: medium

## Report

> ainda quando fecho a tela de leitura de um livro, se tem um bookmark
> criado, não está sendo feito o sync dos bookmarks

O "ainda" é o dado mais importante do report: em `677a91e` (2026-09-10,
"fix: sincroniza bookmarks pendentes automaticamente ao fechar o livro") já
foi feita uma tentativa de corrigir exatamente este sintoma, e foi
"confirmado no device real" na ocasião (bug rastreado em
`sdd/bugs/sincronizar-bookmarks-automaticamente-ao-fechar-livro/`, veredito
final `verified`). O usuário está reportando que, mesmo assim, o problema
persiste.

## Contexto: bugs relacionados já rastreados

Duas entradas do painel `## Bugs` em `.planning/backlog.md` são diretamente
relevantes e elevam a confiança deste assessment:

- **`sincronizar-bookmarks-automaticamente-ao-fechar-livro`** (2026-09-10,
  `verified`) — é o fix que este report está, na prática, reabrindo. O
  próprio `test.md` dele já registrava como **risco residual não testado**:
  "Comportamento com Drive desconectado (sem token) não foi testado no
  device nesta rodada" — exatamente o cenário que a hipótese abaixo aponta
  como causa provável.
- **`bookmark-nao-sincroniza-ao-clicar-no`** (2026-09-08, fix `applied`,
  fase Test nunca rodada) — bug **irmão**, mesma causa raiz, lugar
  diferente: o ícone de sync manual em `BookDetailsScreen` também ficava
  mudo quando o status cacheado era `permission-error`, porque só
  reagendava o sync sem nunca renovar o token do Drive. Foi **reproduzido
  ao vivo no device (RXCX103NMVZ) via `adb logcat`**, com o erro real
  capturado: `GoogleDriveAppDataError` / `missing-token` / "Google Drive
  access token unavailable". O fix aplicado lá (checar
  `getCachedBookmarkDriveSyncStatus()` e chamar
  `refreshDriveToken({ userInitiated: true })` antes de reagendar) é o
  mesmo padrão que falta em `ReaderScreen.handleBack` — ver Root Cause.

Ou seja: este não é um cenário hipotético novo — é a **mesma classe de
defeito**, já confirmada com logs reais de device em um call site irmão há
3 dias, só que ainda não corrigida no call site do fechamento da tela de
leitura. Isso é o suficiente para elevar o veredito de "likely valid,
needs reproduction" para **valid**, mesmo sem uma nova reprodução ao vivo
específica para o fechamento do leitor.

## Symptom

Usuário cria um bookmark durante a leitura e fecha a tela do leitor; o
bookmark não é sincronizado com o Google Drive (nem imediatamente, nem
depois). Esperado: o bookmark deveria sincronizar sozinho, como já acontece
(supostamente) para highlights/progresso.

## Reproduction

1. Ser usuário Pro com Google Drive já conectado em algum momento.
2. Abrir um livro, criar um bookmark.
3. Fechar a tela de leitura (back físico ou botão de voltar do chrome) logo
   depois.
4. Verificar em Configurações > Sync (ou no arquivo no Google Drive
   appData) se o bookmark foi marcado como sincronizado.

[NEEDS CLARIFICATION: como o usuário está verificando "não sincronizou"? Pela
badge de status em `SettingsSyncScreen`, inspecionando o Drive diretamente,
ou via reinstalação/restore? Não bloqueia o veredito (ver Contexto acima),
mas ajuda a fase Test a validar o cenário certo.]

## Suspected Code Paths

- `src/screens/ReaderScreen.tsx:949-960` (`handleBack`) — chama
  `scheduleBookmarkDriveSync(book.id!)` como "segunda chance" ao fechar,
  mas **sem** checar `getCachedBookmarkDriveSyncStatus().code ===
  'permission-error'` antes. Esse é exatamente o guard que
  `src/screens/BookDetailsScreen.tsx:187-208` e
  `src/screens/SettingsSyncScreen.tsx:128-165` já tratam explicitamente com
  comentários dedicados — ver Root Cause abaixo.
- `src/services/BookmarkDriveSyncService.ts:44-52`
  (`scheduleBookmarkDriveSync`) — linha 46:
  `if (getCachedBookmarkDriveSyncStatus().code === 'permission-error')
  return Promise.resolve()`. Retorna silenciosamente, sem log de erro, sem
  exceção — do ponto de vista de quem chama, é indistinguível de "não havia
  nada pendente".
- `src/services/BookmarkDriveSyncStatus.ts:60-67`
  (`classifyBookmarkDriveSyncError`) — qualquer falha de sync classificada
  como `missing-token`/`permission-denied` marca o status global
  (module-level, não por-bookmark) como `permission-error`, e ele **não se
  autorrecupera** (comentário em `BookDetailsScreen.tsx:192-194`: "Token do
  Drive ausente/expirado (...) nunca se resolve só reagendando o sync").
- `src/db/bookmarks.ts:6-70` (`addBookmark`, `restoreBookmark`,
  `softDeleteBookmark`, `updateBookmarkColor`) — os 4 pontos de mutação de
  bookmark chamam `scheduleBookmarkDriveSync` direto, com o mesmo problema:
  nenhum deles faz o "reset + reconnect dance" que `BookDetailsScreen` e
  `SettingsSyncScreen` fazem. Ou seja, se o status já está em
  `permission-error`, **nenhuma** mutação de bookmark em lugar nenhum do
  app tenta sincronizar de novo automaticamente — só o toque manual em
  Configurações > Sync ou no ícone de sync em `BookDetailsScreen` resolve.

## Root Cause Hypothesis

**Confiança: high** (elevada de medium por causa do bug irmão
`bookmark-nao-sincroniza-ao-clicar-no`, que reproduziu exatamente este
padrão — status `permission-error` bloqueando retry silenciosamente — ao
vivo no device, com logs reais). A tentativa de correção de `677a91e` cobre apenas o
caso "sync ainda está em voo / falhou por motivo transitório" — ela chama
`scheduleBookmarkDriveSync` de novo, mas essa função tem um early-return
para o status `permission-error` (linha 46 de
`BookmarkDriveSyncService.ts`) que **descarta a chamada silenciosamente**.
Esse guard já é um problema conhecido e documentado no próprio código: tanto
`BookDetailsScreen.handleSyncBookmarksTap` (`BookDetailsScreen.tsx:187-208`)
quanto `SettingsSyncScreen.handleReconnectDrive`
(`SettingsSyncScreen.tsx:128-165`) precisaram de lógica dedicada — resetar o
status para `pending-offline` e, se necessário, disparar
`refreshDriveToken({ userInitiated: true })` — só pra conseguir tentar de
novo depois de um `permission-error`. O `handleBack` do `ReaderScreen` (e os
4 helpers de `db/bookmarks.ts`) não fazem nada disso: se o status global já
estiver em `permission-error` (token do Google Drive expirado/ausente —
segundo o comentário em `BookDetailsScreen.tsx:192-194`, isso não é raro e
não se autocorrige), toda tentativa de sync de bookmark, em qualquer lugar
do app exceto os dois pontos citados, é um no-op silencioso.

Isso explica o "ainda": o fix de `677a91e` só resolve a corrida entre
"sync disparado pela criação do bookmark ainda em voo" e "fechar a tela
antes dele terminar" — não resolve o caso (provavelmente mais comum na
prática) em que o token do Drive já não é mais válido.

**Hipótese alternativa (confiança: low)**, caso a resposta ao
`[NEEDS CLARIFICATION]` acima revele que o status de sync do usuário está
`connected`/`pending-offline` (não `permission-error`) no momento do teste:
seria uma corrida de fato — `handleBack` lê `bookmarks` (via
`useLiveQuery`) numa closure que pode estar um render atrás do
`db.bookmarks.add()` disparado pela criação do bookmark, mas isso não
deveria importar na prática porque `addBookmark`
(`src/db/bookmarks.ts:17-32`) já dispara `scheduleBookmarkDriveSync`
diretamente, independente do que `handleBack` decida. Essa hipótese é mais
fraca porque não explica por que o fix de ontem, testado no device, teria
parado de funcionar.

## Proposed Remediation

**Decidido com o usuário** (não abrir `refreshDriveToken({ userInitiated:
true })` a partir do fechamento do leitor — comentário em
`SettingsSyncScreen.tsx:130-131` deixa explícito que isso só é permitido a
partir de uma ação explícita do usuário em Configurações/ícone de sync, e
fechar o leitor não é essa ação):

**Preferida**: em `handleBack` (`ReaderScreen.tsx`), quando houver
bookmark pendente (`bookmarks.some(b => !b.syncedAt)`) **e**
`getCachedBookmarkDriveSyncStatus().code === 'permission-error'`, não
chamar `scheduleBookmarkDriveSync` (seria no-op garantido) — em vez disso,
disparar um aviso discreto e não bloqueante avisando que o bookmark está
salvo localmente e precisa reconectar o Google Drive em Configurações.
Fora desse caso (`connected`/`pending-offline`/qualquer outro), mantém o
comportamento atual (chama `scheduleBookmarkDriveSync` normalmente).

Como `ReaderScreen` desmonta assim que `onBack()` é chamado, o aviso não
pode ser um toast local do próprio `ReaderScreen` — precisa sobreviver à
transição de tela. `App.tsx` já tem esse padrão pronto: estado
`externalImportError` + `<Toast>` renderizado em
`renderWithExternalImportFeedback` (linhas 263-279), visível por cima de
qualquer tela da pilha. Reaproveitar o mesmo mecanismo:
- `App.tsx`: novo estado `bookmarkSyncNotice: string | null` + um segundo
  bloco `<Toast tone="warning">` em `renderWithExternalImportFeedback`.
- `ReaderScreen.tsx`: nova prop `onBookmarkSyncBlocked: () => void`,
  chamada em `handleBack` no caso `permission-error` acima, antes de
  `onBack()`.
- Nova mensagem i18n (pt-BR/en/es) reaproveitando o tom de
  `settings.bookmarkSync.description.permissionError` (já existe nas 3
  linguagens) — ex. `reader.bookmarkSyncPendingNotice`.

**Alternativas**:
- Trocar o guard sticky de `permission-error` em
  `scheduleBookmarkDriveSync` por uma tentativa real é mais arriscado: o
  comentário em `BookDetailsScreen.tsx:192-194` avisa que isso já causou o
  bug "app pedindo login do Google com muita frequência" antes — não tocar
  nesse guard.
- Confiar só no ícone vermelho já existente em `BookDetailsScreen` (sem
  toast novo) foi descartado pelo usuário — ele quer o aviso no momento de
  fechar, não só ao abrir Marcações depois.

**Files likely to change**:
- `src/screens/ReaderScreen.tsx` (`handleBack` + `ReaderScreenProps`)
- `src/App.tsx` (`renderWithExternalImportFeedback`, novo estado, nova prop
  passada pro `case 'reader'`)
- `src/i18n/messages.ts` (nova chave nas 3 linguagens)

**Tests to add or update**:
- `src/__tests__/screens/ReaderScreen.test.tsx` — caso "com bookmark
  pendente e status permission-error, chama onBookmarkSyncBlocked em vez
  de scheduleBookmarkDriveSync" + caso "com bookmark pendente e status
  connected/pending-offline, chama scheduleBookmarkDriveSync normalmente
  (sem onBookmarkSyncBlocked)".
- `src/__tests__/App.test.tsx` — se houver cobertura de navegação/props do
  `case 'reader'`, confirmar que `onBookmarkSyncBlocked` está fiada
  corretamente ao novo estado + `<Toast>`.

## Risks & Considerations

- Não reproduzido em device real ainda nesta rodada — a hipótese principal é
  bem fundamentada no próprio código (padrão já resolvido em 2 outros
  lugares), mas só confirma com log real (`bookmark.sync.*` via
  `DiagnosticsLogger`, capturável com `npm run
  android:logs:diagnostics:run` / skill `android-debug`).
- Qualquer mudança que abra `refreshDriveToken({ userInitiated: true })` fora
  de `SettingsSyncScreen` viola um invariante que o próprio código documenta
  — evitar.

## Open Questions

- [NEEDS CLARIFICATION: como o usuário confirma que o bookmark "não
  sincronizou" — badge de status, Drive direto, ou restore após
  reinstalar?]
- [NEEDS CLARIFICATION: o app já pediu para reconectar o Google Drive
  recentemente / existe algum erro de permissão visível em Configurações >
  Sync no momento do teste?]
