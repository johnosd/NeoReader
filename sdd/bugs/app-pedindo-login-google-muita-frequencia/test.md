# Bug Verification: App pede consentimento do Google repetidamente (Drive)

- **Slug**: app-pedindo-login-google-muita-frequencia
- **Testado**: 2026-09-07
- **Assessment**: ./assessment.md
- **Fix**: ./fix.md
- **Result**: verified

## Summary

Em duas capturas em device real (~9 min, 2 cold starts, ~1070 eventos de
diagnóstico), a tela de consentimento OAuth **não apareceu nenhuma vez** e as
únicas duas aberturas de UI de auth do Google foram as que o usuário disparou
tocando em "Conectar Google Drive". Após o cold start, os syncs voltaram a
funcionar sozinhos com o token restaurado do localStorage, sem nenhum prompt.
O sintoma original não reproduz mais no mesmo ambiente em que foi relatado.

## Checks Performed

| Checagem | Comando / Ação | Resultado | Notas |
| --- | --- | --- | --- |
| Reprodução — consentimento reaparece? | Roteiro manual no device RXCX103NMVZ + logcat (2 capturas) | **pass** | Zero `AuthorizationActivity` nas duas capturas; ver Output |
| Reprodução — cold start | `adb shell am force-stop` + abrir pela gaveta, captura desde antes do launch | **pass** | 2ª captura: app sobe 15:31:14, 4 syncs bem-sucedidos até 15:31:59, **zero UI de auth** nesse intervalo |
| Reprodução — expiração de token (~1h) | — | **skipped** | Capturas de 5 e 4 min não cobrem TTL de 55min/1h. Estruturalmente garantido (nenhum caminho de background pode pedir login), mas não observado |
| Caminho legado ativo no device | `logcat` → activities de auth | **pass** | `SignInHubActivity` (legado), não Credential Manager |
| Causa (C) — accessToken não nulo | Burst de sync pós-reconnect | **pass** | O burst só roda se `outcome === 'refreshed'`; nenhum `drive.token.refresh.no-token` |
| Contenção — background não pede login | `grep` em `src/` | **pass** | `refreshDriveToken` tem 1 chamador não-teste: `SettingsSyncScreen.tsx:132`, `{ userInitiated: true }` |
| Testes novos/atualizados | `npx vitest run` (3 arquivos) | **pass** | 24 passed |
| Suite de regressão | `npm test` | **pass** | 856 passed, 2 skipped, 0 failed (113 arquivos) |
| Type-check | `npx tsc --noEmit` | **pass** | sem erros |
| Lint | `npm run lint` | **pass** | sem erros |
| Build | `npm run build` | **pass** | `✓ built in 4.28s` |
| Build de release / AAB | — | **not-run** | Fora do escopo desta sessão; ver Residual Risks |

## Output Excerpts

Todas as aberturas de UI de auth do Google em 5 minutos de captura — **duas**,
com 42ms de diferença, ambas do único toque em "Conectar Google Drive":

```
09-07 15:25:29.744 ActivityTaskManager: START u0 {act=com.google.android.gms.auth.GOOGLE_SIGN_IN
  pkg=com.johnny.neoreader cmp=com.johnny.neoreader/com.google.android.gms.auth.api.signin.internal.SignInHubActivity}
09-07 15:25:29.786 ActivityTaskManager: START u0 {act=com.google.android.gms.auth.GOOGLE_SIGN_IN
  pkg=com.google.android.gms cmp=com.google.android.gms/.auth.api.signin.ui.SignInActivity}
```

`SignInHubActivity` é o host do **GoogleSignIn legado** — prova de que
`useCredentialManager: false` está em vigor. Nenhuma `AuthorizationActivity`
(a tela "NeoReader wants access to your Google Account" do report original)
aparece no log.

Contagem de eventos de sync na sessão observada — **zero falhas**:

```
 40 progress.sync.success    /  40 progress.sync.start
 17 bookmark.sync.success    /  17 bookmark.sync.start
  3 vocabulary.sync.success  /   3 vocabulary.sync.start
  0 *.sync.failure   0 *.restore.failure   0 drive.token.refresh.*
```

Uso real confirmado no log (não foi só o app aberto parado):
`reader.open.start/success` ×2, `reader.selection.start` ×2,
`reader.contextMenu.open` ×2, `translation.request` ×4,
`reader.wordLens.process` ×12.

Sessão única observada: `session-mtrkb4jm-7laom0`, de
`18:25:32.094Z` a `18:26:17.129Z` — **45 segundos**.

### 2ª captura — cold start (`android-diagnostics-20260907-153102`)

Processo morto via `adb shell am force-stop` antes de iniciar a captura, e a
captura começou **antes** do launch — a sessão inteira desde a inicialização
ficou gravada. 601 eventos, de `15:31:16` a `15:33:40`.

A captura contém **3 cold starts**, não um: além do force-stop inicial, o
usuário fechou o app pelo multitarefa mais 2× (`ActivityManager: Killing
15944:com.johnny.neoreader (adj 850): remove task` às 15:32:12 e 15:33:22,
seguidos de novos processos 17785 e 19392 e de 3 `Loading app at
https://localhost`). Nenhum kill por memória, ANR ou crash. Isso reforça o
veredito: **3 inicializações a frio e ainda assim apenas as 2 UIs de auth que
o usuário pediu**.

Sequência decisiva:

```
15:31:14.363  MainActivity iniciada pela gaveta de apps   <- cold start
15:31:35.403  progress.sync.success
15:31:39.441  progress.sync.success
15:31:43.471  progress.sync.success
15:31:45.683  bookmark.sync.success
              ^^^ 45s de app rodando, 4 syncs OK, ZERO UI de auth
15:31:59.647  START GOOGLE_SIGN_IN .../SignInHubActivity   <- toque do usuário
15:32:01.87   vocabulary.sync.start + 14 bookmark.sync.start + 30 progress.sync.start
              ^^^ assinatura do handleReconnectDrive, que só roda com outcome==='refreshed'
```

O token sobreviveu ao cold start via `localStorage` e os syncs voltaram
sozinhos. As **duas únicas** aberturas de UI de auth em toda a captura são as
de `15:31:59` (host + seletor de conta), do toque em "Conectar Google Drive".

**Zero eventos de nível `warn` ou `error` em toda a 2ª captura** — nenhum
`drive.token.refresh.no-token`, nenhum `drive.token.refresh.failure`, nenhum
`*.sync.failure`.

### Observação lateral (não é regressão deste fix)

`vocabulary.sync.start` aparece 4× e `vocabulary.sync.success` só 1× (15:31:16,
15:32:16 e 15:33:26 sem sucesso), **sem nenhum evento de falha**. Investigado e
aberto como bug próprio: `sdd/bugs/entitlement-pro-oscila-sync-vocabulario-sai`.

Não é oscilação de entitlement, como supus a princípio: é uma corrida
determinística: `BillingService.waitForInit()` resolve em ~1ms (só cobre
`configure()`), enquanto `isPro` só chega ~500ms depois via `refresh()`, que
roda solto em background de propósito. Quem pergunta nessa janela lê
`isPro: null` → `'pro-required'`. Independente deste fix — é entitlement do
RevenueCat, não token do Drive.

## Residual Risks

- **Expiração de ~1h não exercitada.** O fix não cria renovação silenciosa —
  ela não existe nesta versão do plugin. Depois de ~55min o sync vai parar e
  esperar o usuário reconectar por Settings. Isso é o comportamento
  *desejado* segundo o report, mas ainda não foi observado na prática, e é o
  ponto onde o usuário pode achar que "o sync quebrou".
- **Não validado em build de release/AAB.** A mudança mexe no caminho de
  sign-in, que é a área do bug conhecido de Google Sign-In no release (aberto
  em 2026-05-14). Debug passar não garante release.
- **`GoogleAuthUtil BAD_AUTHENTICATION` no log** às 15:24:05-15:24:06, no
  processo do GMS (pid 29623), **antes** do reconnect e sem vínculo com o
  nosso pacote nas mesmas linhas. Provavelmente ruído de outra conta do
  device. Não bloqueia, mas vale reobservar na próxima captura.
- **Dívida do caminho legado.** `GoogleSignIn` está sendo descontinuado pelo
  Google; a correção depende dele.

## Recommendation

**Fechar.** O sintoma relatado não reproduz mais no mesmo ambiente em que foi
observado (device RXCX103NMVZ, build debug, conta Pro). As três causas do
assessment estão verificadas empiricamente: (A) o consentimento sumiu e o
caminho legado `SignInHubActivity` está ativo; (B) 45s de cold start com syncs
bem-sucedidos e zero prompt, mais a checagem estática de que só
`SettingsSyncScreen` pode pedir login; (C) o `accessToken` volta não-nulo,
provado pelo burst do `handleReconnectDrive` e pela ausência de
`drive.token.refresh.no-token`.

Dois follow-ups ficam abertos, nenhum bloqueante para este bug: validar em
build de **release/AAB** antes de publicar (a mudança mexe na área do bug de
Sign-In que só aparece no release), e observar o comportamento após a
expiração de ~1h em uso prolongado. Abrir bug próprio para a oscilação do
entitlement Pro descrita em "Observação lateral".
