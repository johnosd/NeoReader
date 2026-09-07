# Bug Assessment: Sync sai como `pro-required` para usuário Pro logo após o cold start

- **Slug**: entitlement-pro-oscila-sync-vocabulario-sai
- **Criado**: 2026-09-07
- **Origem**: observado durante a fase Test do bug
  `app-pedindo-login-google-muita-frequencia` (ver `test.md` daquele bug)
- **Veredito**: valid
- **Severidade**: medium

## Report

Durante a validação em device de outro bug, o log mostrou
`vocabulary.sync.start` 4× com apenas 1 `vocabulary.sync.success` — e **zero**
eventos de falha. O único caminho de `syncVocabulary` que retorna sem logar
nada é o early return de `!hasDriveSyncEntitlement()` → `'pro-required'`, num
device com conta **Pro confirmada**.

Título original da suspeita: "entitlement Pro oscilando". A investigação
mostrou que **não é oscilação** — é uma corrida determinística na
inicialização. O título do arquivo mantém o slug original por rastreabilidade.

## Symptom

Todo sync do Drive disparado nos primeiros ~500ms após o login/abertura do app
é silenciosamente descartado como `'pro-required'`, mesmo o usuário sendo Pro.
O status fica gravado errado nos stores e nada é logado — nem sucesso, nem
falha. Na prática o **sync de vocabulário nunca roda na abertura do app**,
porque `App.tsx` o agenda no mesmo tick em que inicializa o billing.

## Reproduction

Reproduzido **3 de 3 vezes** em device real (RXCX103NMVZ, conta Pro), captura
`logs/android-diagnostics-20260907-153102-full.log`:

1. Fechar o app pelo multitarefa (kill de processo).
2. Abrir o app pelo ícone.
3. Observar no logcat: `vocabulary.sync.start` sem `vocabulary.sync.success`
   correspondente e sem `vocabulary.sync.failure`.

Evidência das 3 ocorrências (timestamps locais):

```
15:31:16.109  billing-init-start          + vocabulary.sync.start   (mesmo ms)
15:31:16.110  billing-init-finished       <- initSettled resolve, 1ms depois
15:31:16.594  billing-refresh-finished isPro=true   <- 484ms DEPOIS
              (nenhum vocabulary.sync.success)

15:32:16.643  billing-init-start          + vocabulary.sync.start (15:32:16.652)
15:32:17.027  billing-refresh-finished isPro=true
              (nenhum vocabulary.sync.success)

15:33:26.039  billing-init-start          + vocabulary.sync.start (15:33:26.047)
15:33:26.589  billing-refresh-finished isPro=true
              (nenhum vocabulary.sync.success)
```

Contraprova no mesmo log: o `vocabulary.sync.start` das **15:32:01.870** —
disparado pelo botão "Conectar" em Settings, ~45s após o refresh ter
resolvido — teve `vocabulary.sync.success` às 15:32:04.708.

## Suspected Code Paths

- `src/services/BillingService.ts:229-231` (`waitForInit`) — **causa raiz**.
  Resolve assim que `initSettled` resolve.
- `src/services/BillingService.ts:113-117` — `initSettled` **deliberadamente
  não espera** o `refresh()`: `void BillingService.refresh().catch(...)`, com
  comentário explicando que é para não travar `getOffering()`. Correto para
  aquele propósito, mas torna `waitForInit()` inválido como porta de entrada
  para ler `isPro`.
- `src/services/BillingService.ts:37` — `cachedStatus` nasce
  `{ isPro: null, ... }`. É esse `null` que os consumidores leem.
- `src/services/DriveDataSyncStatus.ts:49-53` (`hasDriveSyncEntitlement`) e
  `src/services/BookmarkDriveSyncStatus.ts:25-29`
  (`hasBookmarkDriveSyncEntitlement`) — ambos fazem
  `getCachedStatus().isPro === true`, então `null` vira `false` silenciosamente.
- `src/App.tsx:104-118` — o efeito chama `void BillingService.init(uid)` e
  `scheduleVocabularyDriveSync()` **no mesmo tick**. É por isso que vocabulário
  é a vítima visível: ele sempre perde a corrida.

Consumidores que usam `waitForInit()` como gate de `isPro` (todos afetados):

- `src/services/VocabularyDriveSyncService.ts:51-56`
- `src/services/BookmarkDriveSyncService.ts:74-88`
- `src/services/BookmarkDriveRestoreService.ts:66-72` — o comentário na linha
  66 diz literalmente "Aguarda billing inicializar para evitar falso
  'pro-required' logo apos login". É exatamente o que não funciona.
- `src/services/ProgressDriveSyncService.ts:51-56` e `:107-108`

## Root Cause Hypothesis

**Confiança: high** — mecanismo lido no código e confirmado por timestamps em
3 reproduções independentes.

`waitForInit()` promete "billing inicializado", e os 4 serviços de sync a
tratam como "já dá para ler `isPro`". Mas `initSettled` só cobre
`Purchases.configure()` + registro do listener — resolve em ~1ms. O valor de
`isPro` só existe depois de `refresh()`, que roda solto em background e leva
~400-550ms nas três medições. Nessa janela, `cachedStatus.isPro` ainda é
`null`, e `null === true` é `false`.

Não há oscilação: `billing-refresh-finished isPro=true` nas 3 vezes. O
entitlement sempre chegou correto — chegou **tarde demais** para quem já tinha
perguntado.

O sintoma é totalmente silencioso porque o early return de `'pro-required'` não
loga evento nenhum, e o `catch` que logaria nunca é alcançado. Foi por isso que
passou despercebido até uma contagem de eventos revelar a assimetria
start/success.

## Proposed Remediation

**Preferida**: separar "SDK configurado" de "entitlement conhecido".

1. Em `BillingService`, adicionar `waitForEntitlements(timeoutMs = 8000)`:
   aguarda `initSettled` e, se `cachedStatus.isPro === null`, aguarda o
   primeiro `emit` com `isPro !== null` (via `subscribe`) ou o timeout — o que
   vier primeiro. Manter `waitForInit()` como está, porque `getOffering()`
   depende do comportamento atual.
2. Trocar `await BillingService.waitForInit()` por
   `await BillingService.waitForEntitlements()` nos 4 serviços de sync.
3. Decidir explicitamente o comportamento no timeout. Sugestão: continuar
   tratando `null` como não-Pro (não liberar feature paga sem confirmação),
   mas **logar** um evento (`billing.entitlements.timeout`) para o caso deixar
   de ser invisível.
4. Considerar logar o early return de `'pro-required'` nos 4 serviços — um
   `logEvent(..., { reason: 'pro-required' })`. `BookmarkDriveSyncService` já
   faz isso (linha 78); os outros três não, e é essa assimetria que escondeu o
   bug.

**Alternativas**:
- Fazer `initSettled` esperar o `refresh()`. Mais simples, mas reintroduz
  exatamente o travamento que o comentário nas linhas 113-117 evitou
  (`getOffering()` preso atrás de rede lenta). Descartada.
- Em `App.tsx`, adiar o `scheduleVocabularyDriveSync()` para depois do
  entitlement resolver. Resolve só o sintoma visível e deixa os outros 3
  serviços com a mesma corrida latente. Descartada como solução principal.

**Files likely to change**:
- `src/services/BillingService.ts`
- `src/services/VocabularyDriveSyncService.ts`
- `src/services/BookmarkDriveSyncService.ts`
- `src/services/BookmarkDriveRestoreService.ts`
- `src/services/ProgressDriveSyncService.ts`
- `src/__tests__/services/BillingService.test.ts` (se existir; senão criar)
- testes dos 4 serviços de sync

**Tests to add or update**:
- `waitForEntitlements` não resolve enquanto `isPro === null`; resolve assim
  que chega o primeiro status não-nulo.
- `waitForEntitlements` resolve no timeout sem travar para sempre.
- `syncVocabulary` chamado no mesmo tick de `init()` sincroniza (não cai em
  `'pro-required'`) quando o refresh confirma Pro logo em seguida.
- Mesmo caso para bookmark, progresso e restore de bookmarks.

## Risks & Considerations

- **Não liberar feature paga cedo demais.** Qualquer mudança aqui mexe no gate
  de uma feature Pro. O default seguro no timeout continua sendo negar.
- **Latência na abertura.** Passar a esperar o entitlement adia o primeiro sync
  em ~500ms. Irrelevante para sync de background, mas confirmar que nada de UI
  fica preso atrás disso.
- **Não confundir com o outro bug.** Isto é independente de
  `app-pedindo-login-google-muita-frequencia` (já `verified`). Aquele era token
  do Drive; este é entitlement do RevenueCat. Os dois se manifestam como
  "sync não funciona", o que pode confundir na hora de testar.
- **Duplicação de eventos no log.** Todo evento de billing aparece 2× no
  logcat. Não é deste bug, mas atrapalha a leitura — vale investigar se
  `logImportDiagnostic` está escrevendo em dois canais.

## Open Questions

- [NEEDS CLARIFICATION: 8s é um timeout razoável para `waitForEntitlements`,
  ou prefere algo mais curto (3-5s) aceitando mais falsos `pro-required` em
  rede ruim?]
- [NEEDS CLARIFICATION: no timeout, deve negar (seguro, sync não roda) ou
  otimisticamente permitir e deixar o Drive rejeitar? A proposta acima assume
  negar.]
- [NEEDS CLARIFICATION: vale conferir se o item "Conectar Google Drive" em
  `SettingsSyncScreen` fica visível por causa desse status errado? Não foi
  confirmado — `needsDriveConnect` testa `permission-error` e
  `pending-offline`, não `pro-required`, então pode não ter relação.]
