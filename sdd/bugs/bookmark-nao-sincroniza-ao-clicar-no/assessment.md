# Bug Assessment: Bookmark não sincroniza ao clicar no ícone (fica vermelho)

- **Slug**: bookmark-nao-sincroniza-ao-clicar-no
- **Criado**: 2026-09-08
- **Origem**: texto colado (usuário)
- **Veredito**: valid
- **Severidade**: high

## Report

> eu acabei de ler um livro e criei um bookmark, ele aparece na lista de
> bookmark em vermelho como se não tivesse sido sincronizado, cliquei no
> icone e não aconteceu nada (ele deveria sincronizar quando clicasse) meu
> device esta conectado inpecione ele e corrija esse problema

## Symptom

Na aba "Marcações" de `BookDetailsScreen`, o bookmark aparece com o ícone
`CloudOff` vermelho (erro de sync). Ao tocar no ícone — que deveria
resincronizar o bookmark no Google Drive — nada muda visivelmente: o ícone
continua vermelho depois do toque.

## Reproduction

Reproduzido ao vivo no device conectado (RXCX103NMVZ) via `adb logcat`
filtrado por `Capacitor/Console` enquanto o usuário tocava o ícone:

1. Usuário toca o ícone de sync vermelho do bookmark do livro 85.
2. App dispara `bookmark.sync.start` → `bookmark.sync.failure` em ~11-137ms,
   3 vezes seguidas (o usuário tocou múltiplas vezes tentando).
3. Toda tentativa falha com o mesmo erro:
   ```
   errorName: GoogleDriveAppDataError
   errorMessage: "Google Drive access token unavailable. Reconnect Google
                  with https://www.googleapis.com/auth/drive.appdata."
   details.syncError: "missing-token"
   ```
4. O ícone permanece vermelho porque `bookmark.syncError` nunca é limpo —
   cada nova tentativa falha exatamente pelo mesmo motivo.

## Suspected Code Paths

- `src/screens/BookDetailsScreen.tsx:167-178` (`handleSyncBookmarksTap`) —
  reseta o status pra `pending-offline` e chama `scheduleBookmarkDriveSync`
  direto, sem nunca tentar obter um token novo do Drive.
- `src/services/BookmarkDriveSyncService.ts:44-52,54-137` —
  `scheduleBookmarkDriveSync`/`syncBookBookmarks` fazem a chamada HTTP ao
  Drive usando o token já em memória; não têm (e não devem ter) lógica de
  renovação de token.
- `src/services/GoogleDriveAppDataService.ts:52-57,170-182` — comentário
  explícito: "Este serviço NUNCA renova o token sozinho... Sem token, falha
  com 'missing-token'/'permission-denied'... o usuário reconecta pelo botão
  em Settings quando quiser."
- `src/services/FirebaseAuthService.ts:198-256` (`refreshDriveToken`) — única
  função capaz de obter um token novo; comentário explícito: "só deve ser
  chamada a partir de uma ação explícita do usuário (`userInitiated: true`)
  — nunca de sync em background."
- `src/screens/SettingsSyncScreen.tsx:128-165` (`handleReconnectDrive`) —
  **único ponto do app hoje que chama `refreshDriveToken({ userInitiated:
  true })`**, comentado como "Único ponto do app autorizado a abrir a tela
  de login/consentimento do Google para o Drive".
- `sdd/specs/005-sync-drive-inline/spec.md:60-64` (FR-005, US2 Cenário 3) —
  requisito original que o comportamento atual viola.
- `sdd/specs/005-sync-drive-inline/plan.md:306-367` ("Cuidados para
  Retomada" + "Revisão pós-implementação") — documenta que a "renovação
  silenciosa" que sustentava esse requisito foi removida em 2026-09-07 e
  nunca compensada em `BookDetailsScreen.tsx`.
- `sdd/bugs/app-pedindo-login-google-muita-frequencia/fix.md:78-97` — bugfix
  que removeu o retry-once; Follow-ups já registra "sync para em silêncio"
  como pendência em aberto.
- `src/__tests__/screens/BookDetailsScreen.test.tsx:862-883` — o teste
  existente ("tocar no icone reseta o status e agenda a sincronizacao do
  livro") só verifica que `scheduleBookmarkDriveSync`/`setBookmarkDriveSyncStatus`
  foram chamados; o mock de `scheduleBookmarkDriveSync` sempre resolve com
  sucesso, então não pega o caso real (token ausente) reproduzido no device.

## Root Cause Hypothesis

**Confiança: high** (comportamento confirmado com logs reais do device, não
só leitura de código). O ícone de sync do bookmark em `BookDetailsScreen`
só reseta o status em cache e repete a mesma chamada de sync — mas quando o
motivo real da falha é token do Google Drive ausente/expirado
(`missing-token`/`permission-denied`, classificado como `permission-error`),
repetir a chamada está fadado a falhar de novo, sempre, porque nada nesse
caminho jamais obtém um token novo. A única rotina do app que sabe renovar
esse token (`refreshDriveToken`) só é acionada em
`SettingsSyncScreen.handleReconnectDrive` — o ícone dentro de
`BookDetailsScreen` nunca chama essa função. Resultado: pro usuário, tocar
no ícone "não faz nada" (na real, dispara 1 tentativa fadada a falhar em
milissegundos, sem qualquer sinal visual do motivo) — exatamente o sintoma
relatado.

**Contexto histórico que explica como isso surgiu** (achado em
`sdd/specs/005-sync-drive-inline/`, não é especulação):

- A spec `005-sync-drive-inline` (convergida em 2026-09-02) tinha FR-005 +
  User Story 2, Acceptance Scenario 3: tocar no ícone de um bookmark
  pendente/erro devia "abrir o fluxo completo de autenticação (com o
  seletor de conta/consentimento visível)" quando necessário — exatamente o
  comportamento que falta hoje.
- Isso funcionava então porque a US1 da mesma feature colocava um
  retry-once com "renovação silenciosa" dentro de
  `GoogleDriveAppDataService` — QUALQUER chamada ao Drive (inclusive a
  disparada pelo toque no ícone) tentava renovar o token sozinha antes de
  falhar.
- O bugfix `sdd/bugs/app-pedindo-login-google-muita-frequencia/` (aplicado
  em 2026-09-07) descobriu que essa "renovação silenciosa" partia de uma
  premissa falsa (o plugin sempre abre UI de consentimento) e REMOVEU esse
  retry-once por completo — `refreshDriveToken` passou a exigir
  `{ userInitiated: true }` e só é chamada por
  `SettingsSyncScreen.handleReconnectDrive`.
- Ninguém atualizou `BookDetailsScreen.handleSyncBookmarksTap` pra chamar
  `refreshDriveToken({ userInitiated: true })` diretamente — mesmo o toque
  no ícone sendo, ele também, uma ação explícita do usuário que satisfaz
  esse contrato. O próprio `fix.md` desse bugfix já registrou isso como
  Follow-up não resolvido: *"Considerar UI que torne `permission-error`
  mais visível: agora o sync para em silêncio até o usuário ir em
  Settings."*
- Ou seja: este não é um gap novo — é uma regressão silenciosa de
  FR-005/US2-Cenário-3 da feature 005, introduzida como efeito colateral
  aceito (mas não corrigido) de um bugfix posterior, e documentada como
  dívida pendente em `sdd/specs/005-sync-drive-inline/plan.md` ("Cuidados
  para Retomada").

## Proposed Remediation

**Preferida**: Em `handleSyncBookmarksTap` (`BookDetailsScreen.tsx`), antes
de resetar o status e chamar `scheduleBookmarkDriveSync`, checar o código de
status cacheado (`getCachedBookmarkDriveSyncStatus()`, já exportado por
`BookmarkDriveSyncStatus.ts`). Se for `'permission-error'`, chamar
`refreshDriveToken({ userInitiated: true })` primeiro — o toque no ícone já
é a ação explícita do usuário que essa função exige. Só prosseguir com o
reset de status + `scheduleBookmarkDriveSync` se o outcome for
`'refreshed'`; caso contrário (usuário cancelou o consentimento, ou o
provedor não devolveu token), não fazer nada além de encerrar o spinner —
igual ao que `handleReconnectDrive` já faz em `SettingsSyncScreen.tsx`. Para
qualquer outro tipo de erro (ex.: offline transitório), manter o
comportamento atual (reset + retry direto), sem abrir a tela de
consentimento à toa.

**Alternativas** (opcional):
- Em vez de disparar `refreshDriveToken` direto do ícone, redirecionar o
  usuário para `SettingsSyncScreen` quando o status for `permission-error`.
  Mais simples/seguro (só 1 lugar abre a UI nativa), mas não atende o
  "deveria sincronizar quando clicasse" que o usuário espera — vira "abre
  outra tela pra eu resolver", pior UX.

**Files likely to change**:
- `src/screens/BookDetailsScreen.tsx` — `handleSyncBookmarksTap` + imports
  (`refreshDriveToken` de `FirebaseAuthService`,
  `getCachedBookmarkDriveSyncStatus` de `BookmarkDriveSyncStatus`).

**Tests to add or update**:
- `src/__tests__/screens/BookDetailsScreen.test.tsx` — atualizar o mock de
  `@/services/BookmarkDriveSyncStatus` pra incluir
  `getCachedBookmarkDriveSyncStatus`; adicionar mock de
  `@/services/FirebaseAuthService` (`refreshDriveToken`).
- Novo teste: status cacheado `'permission-error'` + toque no ícone →
  `refreshDriveToken({ userInitiated: true })` é chamado antes de
  `scheduleBookmarkDriveSync`; se `refreshDriveToken` resolve `'failed'`/
  `'no-token'`/`'rate-limited'`, `scheduleBookmarkDriveSync` NÃO é chamado.
- Atualizar o teste existente ("tocar no icone reseta o status e agenda a
  sincronizacao do livro", linha 862) pra cobrir explicitamente o caso sem
  `permission-error` cacheado (comportamento atual preservado).

## Risks & Considerations

- `refreshDriveToken({ userInitiated: true })` sempre abre UI nativa de
  conta/consentimento do Google (documentado em `FirebaseAuthService.ts`).
  Isso só deve disparar quando o status cacheado for realmente
  `permission-error` — nunca para falhas transitórias (offline, HTTP 5xx),
  senão vira uma tela de consentimento inesperada por um erro de rede.
- `getCachedBookmarkDriveSyncStatus()` é um status **global** (não por
  bookmark/livro) — se outro livro tiver deixado o status em
  `permission-error`, tocar o ícone deste livro também dispara reconexão.
  Isso é consistente com o que `SettingsSyncScreen` já faz (mesmo status
  global), então não é um comportamento novo, mas vale confirmar que é
  aceitável.
- Não mexe em `ProgressDriveSyncService`/`VocabularyDriveSyncService` — o
  escopo do bug é só o ícone de bookmark; manter mudança mínima.

## Open Questions

Nenhuma bloqueante — evidência de device já confirma causa raiz com
confiança alta.
