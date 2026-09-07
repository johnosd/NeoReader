# Bug Verification: Sync sai como `pro-required` para usuário Pro logo após o cold start

- **Slug**: entitlement-pro-oscila-sync-vocabulario-sai
- **Testado**: 2026-09-07
- **Assessment**: ./assessment.md
- **Fix**: ./fix.md
- **Result**: verified

## Summary

O sintoma não reproduz mais. Em **3 de 3 cold starts** em device real — a mesma
contagem em que o bug falhava 3 de 3 — o `vocabulary.sync.start` continua
disparando na mesma janela de milissegundos do `billing-init-start`, mas agora
**espera** o entitlement resolver e conclui com `vocabulary.sync.success`.
Nenhum `sync.skipped` por `pro-required`, nenhum `billing-entitlements-timeout`.

## Checks Performed

| Checagem | Comando / Ação | Resultado | Notas |
| --- | --- | --- | --- |
| Reprodução (pós-fix) — cold start | `am force-stop` + `monkey ... LAUNCHER`, 3× | **pass** | 3/3 com `vocabulary.sync.success`; ver Output |
| Ausência de skip silencioso | `grep sync.skipped\|entitlements-timeout` | **pass** | zero ocorrências |
| Ausência de warn/error | `grep '"level":"(warn\|error)"'` | **pass** | zero eventos |
| Regressão do bug 1 (auth) | `grep GOOGLE_SIGN_IN\|SignInHubActivity` | **pass** | nenhuma UI de auth nos cold starts |
| Lógica em navegador real | Playwright MCP, Chromium, 6 asserts | **pass** | ver "Playwright" abaixo |
| Suite de regressão | `npm test` | **pass** | 860 passed, 2 skipped, 0 failed (114 arquivos) |
| Type-check | `npx tsc --noEmit` | **pass** | sem erros |
| Lint | `npm run lint` | **pass** | sem erros |
| Build | `npm run build` | **pass** | `✓ built in 4.97s` |
| Timeout de 8s em rede ruim | — | **not-run** | Só coberto por teste unitário com timeout artificial; não exercitado em rede real degradada |
| Build de release / AAB | — | **not-run** | Ver Residual Risks |

## Output Excerpts

**Antes do fix** (captura `20260907-153102`, 3 de 3 cold starts assim):

```
15:31:16.109  billing-init-start  + vocabulary.sync.start
15:31:16.110  billing-init-finished          <- waitForInit() resolve, isPro ainda null
15:31:16.594  billing-refresh-finished isPro=true
              (NENHUM vocabulary.sync.success — sumiu como 'pro-required', sem log)
```

**Depois do fix** (3 cold starts independentes, com `force-stop` entre cada um):

```
#1  16:01:52.701  billing-init-start
    16:01:52.705  vocabulary.sync.start          <- mesma janela de 4ms
    16:01:53.379  billing-refresh-finished isPro=true
    16:01:56.986  vocabulary.sync.success        <- ESPEROU e sincronizou

#2  16:04:07.731  billing-init-start
    16:04:07.786  vocabulary.sync.start
    16:04:08.291  billing-refresh-finished isPro=true
    16:04:11.374  vocabulary.sync.success

#3  16:04:24.518  billing-init-start
    16:04:24.525  vocabulary.sync.start
    16:04:24.928  billing-refresh-finished isPro=true
    16:04:28.110  vocabulary.sync.success
```

A corrida continua existindo (o sync é agendado 4-55ms depois do init, como
antes) — o que mudou é que ele agora **espera** em vez de ler `null` e desistir.

### Playwright (Chromium real, `npm run dev`)

Não verifica este bug: `isBillingAvailable()` exige
`Capacitor.getPlatform() === 'android'`, e no navegador retorna `'web'`, então
`waitForEntitlements` sai na primeira linha. A corrida só existe com o
RevenueCat rodando. Foi usado para o que o jsdom não cobre — realm real, com
`Response`/`AbortController` nativos:

```
bug1: sem token lanca missing-token sem chamar fetch      -> fetch=0
bug1: 401 vira permission-denied sem retry                -> fetch=1
bug1: refreshAccessToken injetado e ignorado              -> 0 chamadas
bug2: waitForEntitlements nao trava 8s no web             -> 0ms, isPro=false
bug2: waitForInit segue resolvendo na hora                -> 0ms
bug1: refreshDriveToken exportado e recebe options        -> arity=1
```

App carrega com 0 erros de console. O 4º caso é o que mais importa aqui:
sem o curto-circuito de billing indisponível, **toda** chamada no web dev
penduraria 8 segundos.

## Residual Risks

- **Janelas de captura curtas.** Os 3 cold starts foram observados por ~14s
  cada, o suficiente para a cadeia decisiva (que fecha em ~4s), mas não para
  uso prolongado.
- **Timeout de 8s nunca exercitado em rede real.** Só há cobertura unitária
  com timeout artificial de 20ms. Se a rede do usuário for lenta o bastante
  para estourar 8s, o comportamento volta a ser `pro-required` — agora com
  `billing-entitlements-timeout` no log, que era o objetivo mínimo.
- **~500ms a mais antes do primeiro sync.** É background, mas não foi medido
  se algo de UI depende indiretamente disso.
- **Não validado em build de release/AAB.** Vale para os dois bugs desta
  sequência.
- **Os dois `restore*`** (`restoreVocabularyFromDrive`,
  `restoreBookProgressFromDrive`) migraram para `waitForEntitlements()` mas não
  foram exercitados nesta validação — não há gatilho deles no cold start.
- **Duplicação de eventos no logcat** (cada evento de billing aparece 2×)
  permanece. Não é deste bug.

## Recommendation

**Fechar.** O sintoma não reproduz em 3 de 3 cold starts, na mesma contagem em
que falhava 3 de 3 antes, com a cadeia causal completa visível no log
(`init` → `sync.start` → `refresh isPro=true` → `sync.success`). O bug 1 segue
valendo em paralelo: nenhuma UI de auth apareceu nos mesmos cold starts.

Follow-up conjunto dos dois bugs, não bloqueante: validar em **build de
release/AAB** antes de publicar, já que ambos mexem em caminhos que se
comportam diferente no release.
