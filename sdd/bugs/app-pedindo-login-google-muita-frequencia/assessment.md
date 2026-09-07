# Bug Assessment: App pede consentimento do Google repetidamente (Drive)

- **Slug**: app-pedindo-login-google-muita-frequencia
- **Criado**: 2026-09-07
- **Atualizado**: 2026-09-07 (revisado após evidência do usuário — ver "Revisão")
- **Origem**: texto colado (entrada `[bug]` do `.planning/backlog.md`) + screenshot do device
- **Veredito**: valid
- **Severidade**: high

## Report

> app pendindo muitas vezes para logar no google. se a autenticação se perde
> muito rapido deveriamos tentar limitar, pois solicitar para logar muitas
> vezes degrada a experiencia do usuario.

Evidência adicional fornecida pelo usuário (device real, conta Pro):

1. Aparece "Choose a saved sign-in for NeoReader" (folha do Credential Manager).
2. Após selecionar a conta, aparece "NeoReader wants access to your Google
   Account" — tela de **consentimento OAuth**, com o aviso
   "NeoReader already has some access — See the 1 service that NeoReader has
   some access to", e os botões Cancel / Continue.

## Revisão (o que mudou na segunda passada)

A primeira versão deste assessment apontava como causa primária um
`accessToken` nulo devolvido pelo plugin no ramo "acesso já concedido". O
screenshot **descarta** essa hipótese como causa do sintoma observado: a tela
de consentimento estar aparecendo significa que `hasResolution()` retorna
`true`, ou seja, o fluxo passa pelo caminho de resolução — que **propaga o
`accessToken` corretamente**. A causa do `accessToken` nulo continua existindo
como defeito latente (ver causa C), mas não é o que o usuário está sofrendo.

A causa primária confirmada é outra, e está documentada pelo Google.

## Symptom

No Android, com usuário Pro, a tela de consentimento OAuth do Google
("NeoReader wants access to your Google Account") reaparece repetidamente
durante o uso normal — mesmo já tendo sido concedida antes, e mesmo com a
própria tela dizendo que o app "already has some access". O esperado é
consentir uma vez e nunca mais ver essa tela, com o acesso ao Drive renovado
em silêncio (ou degradando sem UI até o usuário pedir reconexão em Settings).

## Reproduction

Ambiente: Android, device real, usuário **Pro** (confirmado — sync do Drive é
gated por `hasDriveSyncEntitlement`).

1. Fazer login com Google e conceder o escopo `drive.appdata`.
2. Confirmar sync funcionando (Settings → Sincronização na Nuvem = conectado).
3. Fechar e reabrir o app (ou aguardar > 55 min — TTL do cache local).
4. Disparar qualquer `schedule*DriveSync`: ler um livro (progresso), criar um
   bookmark, adicionar palavra ao vocabulário.
5. A folha de conta + a tela de consentimento aparecem sem ação do usuário.
6. Aceitar e repetir o passo 4 → aparecem de novo.

Caminho que mais amplifica: importar uma pasta com N livros
(`BookImportService` em lote) — cada livro chama `restoreBookmarksAfterImport`,
que não respeita nenhum guard de permissão.

## Suspected Code Paths

Plugin nativo (`@capacitor-firebase/authentication@8.2.0`):

- `.../handlers/GoogleAuthProviderHandler.java:346-350` — **causa raiz**:
  `AuthorizationRequest.builder().requestOfflineAccess(default_web_client_id, true)`.
  O `true` é `forceCodeForRefreshToken`, hardcoded, sem opção de configuração.
- `.../GoogleAuthProviderHandler.java:354-366` — `hasResolution()` → lança o
  intent de consentimento. É a tela do screenshot.
- `.../GoogleAuthProviderHandler.java:180` — o ramo **legado**
  (`useCredentialManager: false`) usa `.requestServerAuthCode(clientId)`, a
  sobrecarga de 1 argumento, cujo `forceCodeForRefreshToken` é `false`.
  Essa é a base da remediação preferida.
- `.../GoogleAuthProviderHandler.java:266-295` — defeito latente (causa C):
  no ramo sem resolução, `handleSuccessfulSignIn(call, cred, idToken, null,
  null, null, null)` passa `accessToken = null` (5º parâmetro).

App:

- `src/services/FirebaseAuthService.ts:165-185` (`refreshDriveToken`) — chama
  `signInWithGoogle()`, que hoje **sempre** abre UI. O comentário nas linhas
  157-162 afirma o contrário; a premissa é falsa.
- `src/services/FirebaseAuthService.ts:176` —
  `rememberGoogleDriveAccessToken(result.credential?.accessToken)` grava
  `null` sem checar, apagando token válido (causa C).
- `src/services/FirebaseAuthService.ts:177-179` — `catch {}` vazio: o
  cancelamento do usuário não deixa rastro, então nada aprende com a recusa.
- `src/services/GoogleDriveAppDataService.ts:177-193` (`resolveAccessToken`) e
  `:155-165` (retry de `permission-denied`) — chamam `refreshAccessToken()`
  (= prompt) automaticamente, a partir de requests de background.
- `src/services/BookmarkDriveRestoreService.ts:50-99` — não checa
  `permission-error` e, na linha 74, faz `setBookmarkDriveSyncStatus('pending-offline')`,
  **zerando** o guard que os `schedule*` usavam para se conter.
- `src/services/BookImportService.ts:474,558,809-841` — chama a restauração
  acima uma vez por livro, em loop.
- `src/services/ProgressDriveSyncService.ts:29-38,58`,
  `src/services/VocabularyDriveSyncService.ts:34-41,58`,
  `src/services/BookmarkDriveSyncService.ts:44-52,90` — mesmo padrão: guard
  checado no `schedule*`, mas cada execução sobrescreve o status para
  `pending-offline` antes do request.
- `src/db/progress.ts:56`, `src/db/bookmarks.ts:31,47,58,69`,
  `src/db/vocabulary.ts:7,13`, `src/App.tsx:117` — os gatilhos de background.

## Root Cause Hypothesis

**(A) PRIMÁRIA — o plugin força re-consentimento em toda autorização.
Confiança: high (fonte do plugin lido + documentação oficial do Google).**

`GoogleAuthProviderHandler.requestAuthorizationResult` monta a requisição com
`requestOfflineAccess(webClientId, /* forceCodeForRefreshToken = */ true)`,
hardcoded. A documentação do Google para esse flag (idêntico ao de
`GoogleSignInOptions.Builder.requestServerAuthCode`) diz textualmente:

> "If true, the granted code can be exchanged for an access token and a
> refresh token. The first time you retrieve a code, a refresh_token will be
> granted automatically. **Subsequent requests will require additional user
> consent.** Use false by default; only use true if your server has suffered
> some failure and lost the user's refresh token."

É exatamente o comportamento relatado: a primeira concessão passa, **toda
autorização seguinte exige consentimento adicional**. Por isso
`authorizationResult.hasResolution()` continua retornando `true` para sempre,
o intent de consentimento é lançado, e o usuário vê a tela do screenshot —
inclusive o texto "NeoReader already has some access", que é o Google
reconhecendo que o escopo já foi concedido enquanto ainda pede consentimento
de novo, por causa do flag.

A ironia agravante: o `serverAuthCode` que esse flag existe para renovar
**nunca é usado pelo app**. O NeoReader paga o custo integral (consentimento
a cada renovação) sem colher nenhum benefício (não há troca de auth code por
refresh token; ver `handleSuccessfulSignIn` → o app só lê
`result.credential?.accessToken`).

**(B) AMPLIFICADORA — a renovação interativa é disparada por background, sem
limite. Confiança: high (fonte do app).**

`resolveAccessToken` chama `refreshDriveToken()` sozinho a partir de sync de
progresso, bookmark, vocabulário e restauração pós-import — nenhuma dessas é
ação do usuário. Os guards existentes não seguram:

1. `restoreBookBookmarksFromDrive` não checa `permission-error` e ainda reseta
   o status para `pending-offline`, reabrindo a porta que os `schedule*`
   tinham fechado;
2. cada `sync*` faz esse mesmo reset antes do request;
3. o coalescing `inFlightDriveTokenRefresh` só cobre chamadas **simultâneas** —
   sequenciais passam livres;
4. o cancelamento é engolido por `catch {}` vazio, sem cooldown nem contagem.

Sem (B), (A) causaria um consentimento por hora. Com (B), causa um a cada
ação de background que ocorra sem token — que é o "muitas vezes" do report.

**(C) LATENTE — token válido apagado por `null`. Confiança: high (fonte lido),
mas não é o que dispara o sintoma atual.**

No ramo em que `hasResolution()` for `false`, o plugin resolve com
`accessToken = null` e `rememberGoogleDriveAccessToken(null)` apaga o token
persistido. Hoje esse ramo não é alcançado (por causa de (A)); se (A) for
corrigido sem corrigir (C), o bug reaparece em outra forma. Corrigir junto.

**(D) CONTEXTO — consentimento OAuth não verificado.** O screenshot mostra
"Learn why you're not seeing links to NeoReader's Privacy Policy or Terms of
Service", o que indica que a tela de consentimento no Google Cloud Console
está sem Privacy Policy / ToS preenchidos. Se o app estiver em publishing
status "Testing", os refresh tokens expiram em 7 dias e o consentimento é
pedido de novo periodicamente por conta disso também. Não é a causa do loop,
mas é uma segunda fonte de re-consentimento e piora a percepção de confiança.
Verificar no Console — é configuração, não código.

## Verificação de versões do plugin (2026-09-07)

Projeto usa `@capacitor-firebase/authentication@8.2.0`; a última publicada é
**8.5.1** (02/09/2026). Baixei o tarball publicado do npm e li o fonte —
**o upgrade não corrige nenhuma das causas**:

| Item | 8.2.0 (atual) | 8.5.1 (última) |
|---|---|---|
| `requestOfflineAccess(clientId, true)` hardcoded | sim (linha 348) | **sim** (linha 353) |
| `forceCodeForRefreshToken` configurável | não | **não** |
| `accessToken` nulo no ramo sem resolução | sim (linha 279) | **sim** (linha 279) |
| Opções Android de `SignInWithGoogleOptions` | só `useCredentialManager` | **só `useCredentialManager`** |
| Ramo legado `requestServerAuthCode(clientId)` 1-arg (force=false) | sim | **sim** (linha 180) |

Única mudança Android relevante em 8.5.1 (changelog:
"fix(android): use the Google button flow with Credential Manager"):
`GetGoogleIdOption` → `GetSignInWithGoogleOption`. Isso troca a folha de
seleção de conta pelo fluxo do botão "Sign in with Google" — que é
explicitamente o fluxo **sempre interativo**, sem possibilidade de
auto-select. Ou seja, para este bug o upgrade seria neutro na causa (A) e
possivelmente **pior** na experiência da folha de conta.

**Conclusão:** não vale subir de versão por causa deste bug (subir por outros
motivos é decisão separada). `useCredentialManager: false` continua sendo a
remediação, e é a única alavanca disponível sem fork do plugin.

## Proposed Remediation

**Preferida** — três camadas:

1. **Parar de forçar re-consentimento** (`src/services/FirebaseAuthService.ts`).
   Passar `useCredentialManager: false` nas chamadas `signInWithGoogle` que
   pedem o escopo do Drive (`refreshDriveToken` e `signInWithGoogleRedirect`).
   Esse ramo usa `GoogleSignInOptions.Builder.requestServerAuthCode(clientId)`
   — sobrecarga de 1 argumento, `forceCodeForRefreshToken = false` — e obtém o
   access token via `GoogleAuthUtil.getToken(...)` em `handleOnActivityResult`.
   Resultado: sem tela de consentimento em renovações, e com `accessToken` de
   verdade. Comentar no código **por que** a opção deprecada foi escolhida.
   - _Verificado (2026-09-07):_ upgrade do plugin **não resolve** — ver
     "Verificação de versões" abaixo. `useCredentialManager: false` é a única
     alavanca disponível sem fork do plugin.

2. **Nunca apagar um token válido com `null`** (`FirebaseAuthService.ts`).
   Em `refreshDriveToken`, só chamar `rememberGoogleDriveAccessToken` quando
   `result.credential?.accessToken` for string não vazia; caso contrário
   manter o token atual e registrar a falha. Fecha a causa (C).

3. **Renovação interativa só por ação explícita do usuário + rate limit**
   (o pedido literal do report):
   - `GoogleDriveAppDataService.resolveAccessToken` e o retry de
     `permission-denied` **deixam de chamar** `refreshAccessToken()` por conta
     própria — lançam `missing-token` / `permission-denied` e deixam os stores
     irem para `permission-error`. Um flag opcional
     (`allowInteractiveRefresh`) permite que só o botão "Reconectar" de
     `SettingsSyncScreen` force o prompt.
   - Cooldown persistido em `refreshDriveToken`
     (ex.: `neoreader:drive-reauth-cooldown-until`): bloqueia nova tentativa
     interativa por N minutos após falha/cancelamento, com teto por sessão.
     Substituir o `catch {}` vazio por registro do motivo.
   - `restoreBookBookmarksFromDrive` passa a respeitar o guard
     `permission-error` (early return) e a **não** resetar o status para
     `pending-offline` antes de saber que há token.
   - Nos imports em lote, resolver o token uma vez antes do loop; sem token,
     pular a restauração dos N livros de uma vez (registrando no diagnóstico)
     em vez de tentar por livro.

   Mesmo com (1) resolvido, esta camada continua necessária: é o que garante
   que o app nunca mais interrompa o usuário sem ele ter pedido, qualquer que
   seja o comportamento futuro do plugin.

**Alternativas** (descartadas para este bug):
- Usar de fato o `serverAuthCode` e implementar troca por `refresh_token`.
  É a solução correta de longo prazo — acaba com o prompt de vez, inclusive o
  horário — mas exige backend (ou guardar client secret no app, o que não se
  faz) e vira **feature**, não bugfix. Se for o caminho desejado, deve virar
  spec via `sdd-specify`.
- Aumentar `DRIVE_TOKEN_TTL_MS`: não resolve nada — o limite de 1h é do
  Google, não do cache local.

**Files likely to change**:
- `src/services/FirebaseAuthService.ts`
- `src/services/GoogleDriveAppDataService.ts`
- `src/services/BookmarkDriveRestoreService.ts`
- `src/services/BookImportService.ts`
- `src/services/ProgressDriveSyncService.ts`
- `src/services/VocabularyDriveSyncService.ts`
- `src/services/BookmarkDriveSyncService.ts`
- `src/screens/SettingsSyncScreen.tsx`
- `src/__tests__/services/FirebaseAuthService.test.ts`
- `src/__tests__/services/GoogleDriveAppDataService.test.ts`
- `src/__tests__/services/BookmarkDriveRestoreService.test.ts` (se existir; senão criar)

**Tests to add or update**:
- `refreshDriveToken` chama `signInWithGoogle` com `useCredentialManager: false`
  e com o escopo `drive.appdata`.
- `refreshDriveToken` **não** apaga o token em cache quando o plugin devolve
  `accessToken` nulo/vazio.
- `refreshDriveToken` respeita o cooldown: segunda chamada dentro da janela
  não chama `signInWithGoogle`.
- `GoogleDriveAppDataService` com token ausente lança `missing-token` **sem**
  chamar `refreshAccessToken` quando o refresh interativo não é permitido.
- `GoogleDriveAppDataService` com 401 não chama `refreshAccessToken` no modo
  não-interativo (o teste atual cobre o retry — ajustar, não remover).
- `restoreBookBookmarksFromDrive` retorna cedo com status `permission-error`,
  sem tocar no Drive e sem resetar o status.
- Import em lote com token ausente faz no máximo uma tentativa de resolução,
  não uma por livro.

## Risks & Considerations

- **`useCredentialManager: false` usa API deprecada.** O `GoogleSignIn` legado
  ainda funciona no `play-services-auth` atual, mas o Google está migrando
  tudo para Credential Manager. É uma dívida assumida conscientemente: o
  Credential Manager desta versão do plugin é inutilizável para escopos
  incrementais. Precisa de validação em device real e de comentário no código.
- **Interação com o bug conhecido do Google Sign-In no AAB de release**
  (aberto em 2026-05-14): trocar o caminho de sign-in mexe justamente na área
  daquele bug. Validar tanto em debug quanto em **AAB de release** antes de
  fechar. Não misturar as duas investigações, mas não ignorar a sobreposição.
- **Regressão silenciosa de sync.** Tirar o refresh automático faz o sync
  parar sozinho quando o token expira, em vez de pedir login. É exatamente o
  que o report pede, mas o usuário precisa notar o estado em Settings — senão
  vira reclamação de "sync parou de funcionar". O item "Reconectar" já existe
  em `SettingsSyncScreen`; avaliar se falta um aviso dispensável.
- **Testes existentes assumem o comportamento antigo.**
  `GoogleDriveAppDataService.test.ts` cobre o retry-once via
  `refreshAccessToken`; `FirebaseAuthService.test.ts:156` cobre o coalescing.
  Atualizar, não deletar.
- **Feature 005** (`005-sync-drive-inline`, "Renovação Silenciosa do Token do
  Google Drive") foi construída sobre a premissa falsa de que
  `signInWithGoogle` é silencioso. Fechar este bug exige atualizar a
  documentação dessa feature.
- **A causa (A) é confirmada por documentação, não por device.** A fase Test
  deve confirmar empiricamente com logcat
  (`npm run android:logs:diagnostics:run`) que, após o fix, uma renovação
  ocorre sem a tela de consentimento e devolve `accessToken` não nulo.

## Open Questions

- [RESOLVIDO] O prompt é a folha do Credential Manager seguida da tela de
  consentimento OAuth — não a `LoginScreen` do app. Confirmado por screenshot.
- [RESOLVIDO] O usuário é Pro no device afetado. Confirmado.
- [RESOLVIDO] Nenhuma versão mais nova ajuda. 8.5.1 (a última) mantém
  `requestOfflineAccess(..., true)` hardcoded e o `accessToken` nulo, e não
  expõe nenhuma opção nova. Ver "Verificação de versões do plugin".
- [NEEDS CLARIFICATION: qual o publishing status do consentimento OAuth no
  Google Cloud Console (Testing vs. In production), e Privacy Policy / ToS
  estão preenchidos? Ver causa (D) — configuração, fora do escopo do código,
  mas pode ser uma segunda fonte de re-consentimento.]
- [NEEDS CLARIFICATION: aceitar o fluxo OAuth com `refresh_token` de verdade
  (fim definitivo do prompt, inclusive o horário) como feature futura via
  `sdd-specify`, ou fica só o que este bugfix entrega?]
