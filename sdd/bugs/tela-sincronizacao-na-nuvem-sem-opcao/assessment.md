# Bug Assessment: Sincronização na Nuvem sem opção de conectar/reconectar fora do caso "token expirado"

- **Slug**: `tela-sincronizacao-na-nuvem-sem-opcao`
- **Criado**: 2026-09-02
- **Origem**: texto colado — reportado pelo usuário durante teste manual da feature `004-settings-categorias` ("nao esta ... deveria ter... somente o cloud sync esta sem opção para fazer login novamente"), registrado como `[Bug]` em `.planning/backlog.md` → Ideias Futuras em 2026-09-02.
- **Veredito**: valid
- **Severidade**: medium

## Report

> deu certo, somente o cloud sync esta sem opção para fazer login novamente

Confirmado em conversa: é a mesma limitação já registrada no backlog — "Tela
'Sincronização na Nuvem' só mostra um botão de reconectar
(`settings.cloudSync.reconnect.title`) quando o status de sync é
especificamente `permission-error` (token do Drive expirado) — se o usuário
nunca conectou o Google Drive ou está noutro status (`pending-offline`,
`pro-required`), não existe nenhuma ação visível de 'conectar'/'fazer
login' na tela, só o badge de status."

## Symptom

Na categoria "Sincronização na Nuvem" (`SettingsSyncScreen.tsx`), o usuário
vê o status de sync de bookmarks/progresso/vocabulário, mas não tem nenhuma
ação pra autorizar o acesso ao Google Drive a menos que o status já tenha
virado `permission-error` (isto é, só depois de uma tentativa de sync já ter
falhado por token ausente/negado). Um usuário Pro que nunca sincronizou
nada (ou cuja última tentativa falhou por outro motivo, ex.: rede) fica
travado em `pending-offline`, sem nenhum botão — só o badge "Pendente/
offline".

## Reproduction

1. Logar como usuário Pro (entitlement `NeoReader Pro` ativo) numa conta que
   nunca autorizou o escopo `drive.appdata` (ou cujo `localStorage` foi
   limpo, zerando o token salvo em cache).
2. Abrir Configurações → Sincronização na Nuvem.
3. **Esperado**: alguma ação visível pra autorizar/conectar o Google Drive.
4. **Observado**: os 3 itens (Bookmarks, Progresso, Vocabulário) aparecem
   com o badge "Pendente/offline" (`code: 'pending-offline'`), sem nenhuma
   linha de ação abaixo — `hasPermissionError` (linha 116-119 de
   `SettingsSyncScreen.tsx`) é `false` porque nenhum dos 3 status é
   literalmente `'permission-error'`.

Não precisei reproduzir manualmente no device pra confirmar — a lógica é
determinística e visível direto no código (linhas citadas abaixo); o
usuário já reproduziu isso ao vivo durante o teste manual da feature
`004-settings-categorias`.

## Suspected Code Paths

- `src/screens/SettingsSyncScreen.tsx:116-119` — `hasPermissionError` é o
  único gate que controla se a linha de ação aparece; só cobre
  `permission-error`, não `pending-offline`.
- `src/screens/SettingsSyncScreen.tsx:185-194` — o `ListItem` de ação
  (`handleReconnectDrive`) só renderiza quando `hasPermissionError` é
  `true`.
- `src/services/FirebaseAuthService.ts:157-169` — `refreshDriveToken()`, a
  função por trás do botão, já funciona corretamente pra qualquer estado
  (primeira autorização ou reautorização) — chama
  `FirebaseAuthentication.signInWithGoogle({ scopes: [GOOGLE_DRIVE_APPDATA_SCOPE] })`,
  o mesmo código-caminho do login inicial. No Android nativo
  (`GoogleAuthProviderHandler.java`, `requestAuthorizationResult`), o
  consent screen só aparece se o escopo ainda não foi concedido — caso já
  tenha sido, retorna direto sem UI. Ou seja: **a função já cobre os dois
  casos (conectar pela primeira vez e reautorizar) sem nenhuma mudança
  necessária nela**.
- `src/services/DriveDataSyncStatus.ts:8-12` e
  `src/services/BookmarkDriveSyncStatus.ts:4-8` — o enum de status
  (`'pro-required' | 'pending-offline' | 'permission-error' | 'connected'`)
  não distingue "nunca tentou sincronizar" de "tentou e falhou por motivo
  não classificado como permissão" — ambos caem em `pending-offline`. Não é
  o bug em si, mas explica por que não dá pra restringir a ação só ao caso
  "nunca conectou": tecnicamente não há como diferenciar isso de outro erro
  transiente hoje.
- `src/hooks/useBookmarkDriveSyncStatus.ts:15-21` (e o par em
  `useProgressDriveSyncStatus.ts`/`useVocabularyDriveSyncStatus.ts`) —
  confirma que `pending-offline` só é possível pra usuário Pro
  (`isPro !== true` sempre retorna `'pro-required'` direto) — logo, alargar
  o gate pra incluir `pending-offline` não vaza a ação pra usuário Free.

## Root Cause Hypothesis

**Confiança: high.** O mecanismo de autorização (`refreshDriveToken`) já
funciona pra qualquer estado — o bug é puramente uma condição de UI (`hasPermissionError`)
excessivamente restritiva, escrita originalmente só pensando no caso "token
expirado depois de já ter conectado" e nunca estendida pro caso "usuário
Pro que ainda não conectou". A cópia do botão (`settings.cloudSync.reconnect.description`
= "Token expirado. Toque para reautorizar o acesso.") também presume uma
conexão prévia, então simplesmente alargar a condição sem ajustar o texto
deixaria a mensagem enganosa pra quem nunca conectou.

## Proposed Remediation

**Preferida**: Alargar a condição que controla a linha de ação em
`SettingsSyncScreen.tsx` pra cobrir também `pending-offline` (mantendo
`permission-error`), já que ambos os casos usam exatamente a mesma ação
(`handleReconnectDrive`) e ambos são exclusivos de usuário Pro (`pro-required`
continua sem ação — CTA correto ali é upgrade, não Drive; `connected`
continua sem ação — nada a fazer). Generalizar o texto do botão (título e
descrição, 3 locales) pra não presumir "reautorização" especificamente —
algo como "Conectar/Reconectar Google Drive" + "Toque para autorizar o
acesso ao Google Drive." Renomear a variável `hasPermissionError` pra algo
que reflita o novo significado (ex.: `needsDriveConnect`), já que ela vai
deixar de significar literalmente "tem erro de permissão".

**Alternativas** (opcional):
- Introduzir um status novo tipo `'never-connected'` distinto de
  `pending-offline`, pra manter a semântica de cada status mais precisa.
  Rejeitada por ora: exigiria tocar nos 2 enums (`DriveDataSyncStatusCode`/
  `BookmarkDriveSyncStatusCode`), nos stores/classificadores de erro
  (`GoogleDriveAppDataService.ts`, `classifyDriveSyncError`,
  `classifyBookmarkDriveSyncError`) e potencialmente na lógica dos 3 hooks
  — escopo bem maior que o necessário pra resolver o sintoma relatado
  (mudança de design, não fix pontual). Fica como nota pra uma eventual
  feature futura de sync (já mencionada no spec de `004-settings-categorias`
  como possivelmente indo pra tela de detalhes do livro).

**Files likely to change**:
- `src/screens/SettingsSyncScreen.tsx`
- `src/i18n/messages.ts` (chaves `settings.cloudSync.reconnect.title` e
  `.description`, 3 locales)
- `src/__tests__/screens/SettingsSyncScreen.test.tsx`

**Tests to add or update**:
- Novo teste: com todos os 3 status em `pending-offline` (usuário Pro que
  nunca sincronizou), a linha de ação de conectar aparece.
- Teste existente ("mostra sync de bookmarks como recurso Pro...", usuário
  Free/`pro-required`) continua confirmando que a ação NÃO aparece nesse
  caso.
- Opcional: teste confirmando que tocar na ação em estado `pending-offline`
  chama `refreshDriveToken` (mesmo comportamento já coberto implicitamente
  pelo fato de reaproveitar `handleReconnectDrive` sem mudança de lógica).

## Risks & Considerations

- A ação já é idempotente/segura pra qualquer estado de entrada (mesmo
  `handleReconnectDrive` de hoje) — o risco de alargar o gate é
  essencialmente só de UX (mostrar um botão a mais), não de comportamento
  quebrado.
- Mudar o texto do botão nos 3 locales precisa manter consistência com o
  resto do vocabulário já usado em Settings (ex.: "Ativo"/"Conectado" já
  usados noutros badges).
- Fora de escopo deste fix (confirmado com o usuário antes, na sessão de
  `004-settings-categorias`): mover a visibilidade de status de sync pra
  outro lugar do app (ex.: tela de detalhes do livro) — isso seria uma
  feature própria, não um bugfix.

## Open Questions

Nenhuma — escopo e reprodução claros o bastante pra seguir direto pra fase
Fix.
