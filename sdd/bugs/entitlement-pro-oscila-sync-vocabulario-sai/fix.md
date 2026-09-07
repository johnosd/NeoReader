# Bug Fix: Sync sai como `pro-required` para usuário Pro logo após o cold start

- **Slug**: entitlement-pro-oscila-sync-vocabulario-sai
- **Corrigido**: 2026-09-07
- **Assessment**: ./assessment.md
- **Status**: applied

## Summary

Adicionado `BillingService.waitForEntitlements()`, que espera o entitlement ser
de fato **conhecido** (`isPro !== null`) em vez de apenas o SDK estar
configurado, e os 6 pontos de sync do Drive passaram a usá-lo no lugar de
`waitForInit()`. Também foi adicionado log ao early return de `'pro-required'`
nos serviços que retornavam calados — o silêncio era o que escondia o bug.

## Changes

| Arquivo | Mudança | Notas |
| --- | --- | --- |
| `src/services/BillingService.ts` | modified | novo `waitForEntitlements(timeoutMs = 8000)`; `waitForInit()` inalterado, mas com doc explicando que **não** garante `isPro`; nova constante `ENTITLEMENTS_TIMEOUT_MS` |
| `src/services/VocabularyDriveSyncService.ts` | modified | 2 call sites migrados; `vocabulary.sync.skipped` logado no `pro-required` |
| `src/services/ProgressDriveSyncService.ts` | modified | 2 call sites migrados; `progress.sync.skipped` logado no `pro-required` |
| `src/services/BookmarkDriveSyncService.ts` | modified | 1 call site migrado (já logava o skip) |
| `src/services/BookmarkDriveRestoreService.ts` | modified | 1 call site migrado; comentário corrigido (dizia que `waitForInit` evitava o falso `pro-required`, o que não era verdade) |
| `src/__tests__/services/BillingService.test.ts` | **added** | não existia teste para `BillingService` |

Comportamento de `waitForEntitlements`:

1. Billing indisponível (web/dev, sem api key) → devolve o status corrente na
   hora. Sem isso, todo teste unitário e o web dev esperariam 8s à toa.
2. `isPro` já conhecido → devolve na hora.
3. Caso contrário, aguarda o primeiro `emit` com `isPro !== null` via
   `subscribe`, ou o timeout — o que vier primeiro.
4. No timeout, loga `billing-entitlements-timeout` e devolve o status corrente
   (`isPro: null`), que os gates continuam tratando como não-Pro.

## Tests Added or Updated

- `BillingService.test.ts::nao resolve enquanto o refresh nao respondeu (corrida do cold start)`
  — **o teste central**. Afirma explicitamente que `waitForInit()` resolve com
  `isPro === null` e que `waitForEntitlements()` não resolve nessa janela.
- `BillingService.test.ts::resolve imediatamente quando o entitlement ja e conhecido`
  — garante que não introduzimos espera desnecessária no caminho quente.
- `BillingService.test.ts::desiste no timeout mantendo o default seguro de nao liberar Pro`
  — trava o teto de espera e o evento de diagnóstico.
- `BillingService.test.ts::retorna na hora quando billing esta indisponivel, sem esperar o timeout`
  — timeout de 60s no teste: se a espera fosse aplicada, o teste estouraria.

## Local Verification

- `npx vitest run src/__tests__/services/BillingService.test.ts` → 4 passed
- `npx tsc --noEmit` → sem erros
- `npm run lint` → sem erros
- `npm test` (suíte completa) → **860 passed, 2 skipped, 0 failed** (114 arquivos)
- `npm run build` → `✓ built in 4.97s`
- Checagens manuais: **nenhuma em device real** — validação Android é da fase Test.

## Deviations from Assessment

1. **Duas decisões em aberto foram tomadas, não perguntadas.** O assessment
   deixou `[NEEDS CLARIFICATION]` sobre (a) o valor do timeout e (b) negar vs.
   permitir no timeout. O usuário mandou seguir para o Fix, então adotei o que
   o próprio assessment recomendava: **8s** e **negar**. Ambas são reversíveis
   numa linha (`ENTITLEMENTS_TIMEOUT_MS` e o `return cachedStatus` do timeout).
   Negar mantém o comportamento atual e não libera feature paga sem confirmação.

2. **Os dois `restore*` que retornam sem alterar status não ganharam log.**
   `restoreVocabularyFromDrive` e `restoreBookProgressFromDrive` migraram para
   `waitForEntitlements()`, mas continuam retornando cedo sem logar. Diferente
   dos `sync*`, eles não gravam status errado num store — devolvem um resultado
   ao chamador. Adicionar log ali seria escopo além do bug.

3. **A pergunta sobre o item "Conectar Google Drive" continua sem resposta.**
   O assessment perguntava se o status errado deixava esse item visível em
   Settings. Não investiguei: `needsDriveConnect` testa `permission-error` e
   `pending-offline`, não `pro-required`, então provavelmente não há relação.
   Fica para a fase Test observar no device.

## Follow-ups

- **Validar em device real** (fase Test): confirmar no logcat que, após cold
  start, `vocabulary.sync.start` passa a ter `vocabulary.sync.success`
  correspondente, e que nenhum `*.sync.skipped` com `reason: 'pro-required'`
  aparece para conta Pro.
- Confirmar que os ~500ms de espera extra não seguram nada de UI (os 6 call
  sites são todos background, mas vale ver na prática).
- **Duplicação de eventos no logcat**: todo evento de billing aparece 2×.
  Não é deste bug; vale investigar se `logImportDiagnostic` escreve em dois
  canais.
- Se o timeout de 8s se mostrar agressivo em rede ruim, ajustar
  `ENTITLEMENTS_TIMEOUT_MS`.
