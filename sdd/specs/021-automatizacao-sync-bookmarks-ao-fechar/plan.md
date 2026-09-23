# Implementation Plan: Automatização do sync de bookmarks ao fechar

**Slug**: `021-automatizacao-sync-bookmarks-ao-fechar` | **Date**: 2026-09-23 | **Spec**: `sdd/specs/021-automatizacao-sync-bookmarks-ao-fechar/spec.md`

## Summary

Implementação de um método nativo no Android para obter e renovar o token do Google Drive (`drive.appdata`) silenciosamente (sem UI) via `Identity.getAuthorizationClient().authorize()`. Essa renovação será integrada ao fluxo do app para permitir o envio automático de bookmarks pendentes sem exibir avisos de erro, ativando tentativas em gatilhos específicos (fechar livro, app resume, reconexão de rede).

## Technical Context

**Language/Version**: TypeScript (React 19), Java (Android nativo)

**Primary Dependencies**: Capacitor 8, React, Firebase Auth (nativo/JS)

**Storage**: Local Dexie.js (já existente, gerencia flags de pendência)

**Testing**: Vitest (TS), Testes manuais em device (Java/Android)

**Target Platform**: Android Nativo (Capacitor) — Não aplicável pra Web neste escopo nativo.

**Constraints**: Respeitar o invariante de "nenhuma tela de consentimento do Google sem ação do usuário" no caminho feliz. Qualquer UI deve ser agendada para a abertura do app (resume) no caso residual. Validar no build de release devido ao bug histórico do Google Sign-In.

**Scale/Scope**: Local-first sync client.

## Decisões Invariantes

- A renovação automática (silenciosa) do token via API nativa DEVE ser a única responsável por tentar sanar um erro de expiração durante o background sync de bookmarks; ela nunca deve abrir UI automaticamente durante a leitura.
- A tela de consentimento só pode ser exibida (caso o token silencioso falhe com `needsUi=true`) no momento em que o usuário volta ou reabre o app (App Resume / Cold Start), nunca na cara do usuário no meio da leitura de um livro.
- Nenhuma dependência externa será adicionada para detectar rede; usaremos a API web padrão `window.addEventListener('online')`.

## Constitution Check

*GATE: deve passar antes da Fase 0. Reavaliado após o design da Fase 1.*

| Princípio | Pré-Design | Pós-Design | Notas |
| --- | --- | --- | --- |
| I. Plano antes de feature grande | PASS | | Criado em `sdd-plan`. |
| II. Comentários só onde o "porquê" não é óbvio | PASS | | A documentar no plugin nativo e integrações. |
| III. Explícito antes de mágico | PASS | | Fluxos diretos com callbacks explícitos, sem wrappers complexos. |
| IV. Build limpo é a definição de "pronto" | PASS | | Adicionado aos pre-requisitos de Polish. |
| V. Dependências novas exigem justificativa | PASS | | Nenhuma dependência nova será adicionada. |

## Project Structure

### Documentation (this feature)

```text
sdd/specs/021-automatizacao-sync-bookmarks-ao-fechar/
├── spec.md              # Saída do sdd-specify
├── plan.md              # Este arquivo (saída do sdd-plan)
├── quickstart.md        # Fase 1, condicional
└── tasks.md             # Saída do sdd-plan (fase de tasks)
```

### Source Code (repository root)

```text
src/
├── screens/
│   └── ReaderScreen.tsx                    # Remoção do toast no handleBack
├── services/
│   ├── BookmarkDriveSyncService.ts         # Orquestração de retries (resume/online)
│   └── GoogleDriveAppDataService.ts        # Integração da renovação do token
└── plugins/
    └── GoogleDriveAuthPlugin.ts            # (NOVO) Interface TS para o plugin nativo

android/app/src/main/java/com/johnny/neoreader/
├── DriveAuthSpikePlugin.java               # (A REMOVER)
└── GoogleDriveAuthPlugin.java              # (NOVO) Plugin nativo de renovação de token
```

**Structure Decision**: A implementação nativa reside em `android/.../GoogleDriveAuthPlugin.java` para prover a lógica de Identidade do Google limpa, que substitui o Spike antigo. No lado TS, a interface fica em `src/plugins/GoogleDriveAuthPlugin.ts`. O orquestrador das retentativas em gatilhos fica em `BookmarkDriveSyncService.ts`, e a chamada de token fica em `GoogleDriveAppDataService.ts`.

## Estratégia de Testes

Prioridade: unitário (TS) → testes manuais de integração em device real (Java) → teste E2E manual no AAB de release.

Comandos-base:
```powershell
npm run build
npm test
npm run android:build
```

## Estado Atual

| Área | Estado |
| --- | --- |
| Nativo (Android) | Plugin `GoogleDriveAuthPlugin` e `MainActivity.java` implementados (T001-T004). |
| Frontend | Interface `GoogleDriveAuthPlugin.ts` adicionada. `GoogleDriveAppDataService` e `BookmarkDriveSyncService` integrados ao plugin de fallback silencioso (T007-T013). |

## Riscos e Decisões

| ID | Risco/Decisão | Impacto | Mitigação/Encaminhamento |
| --- | --- | --- | --- |
| R-001 | AAB Release vs Google Sign-In Bug | Alto | **Resolvido**: dispensado pelo usuário em 2026-09-23 — esse problema de assinatura já ocorreu antes no projeto e não exige mudança nesta feature. Risco aceito; reabrir como bug se o sync falhar em produção por esse motivo. |
| R-002 | Validação em device do caso residual (`needsUi=true`, revogação de acesso — T015) e da expiração real de 1h (SC-001 — T016) | Médio | **Resolvido**: dispensado pelo usuário em 2026-09-23 — "vou utilizar o aplicativo por um tempo e caso apareça o problema novamente, eu irei abrir um novo bug". Ambos os caminhos têm cobertura de teste unitário (`FirebaseAuthService.test.ts`, `BookmarkDriveSyncTriggers.test.ts`) e T017 (gatilho de resume/online) foi validado no device com sucesso, então o risco residual é só a lacuna entre mock e comportamento real do Google nesses 2 cenários específicos. |

## Execution Notes

| Data | Fase/Story | Resumo | Pendência Principal |
| --- | --- | --- | --- |
| 2026-09-23 | Phase 1: Foundational | Spike substituído pelo GoogleDriveAuthPlugin. API pronta para uso no TS. | Nenhuma. |
| 2026-09-23 | Phase 2: US1 | Sync tenta renovar token via plugin Android silenciosamente. Orquestrador montado para retry. | Nenhuma. |
| 2026-09-23 | Phase 3: US2 | Flag needsUi salva e consome prompt apenas no appStateChange de resume. | Nenhuma. |
| 2026-09-23 | Revisão de código (Claude) | Corrigidos: (1) renovação só rodava em 401, nunca no cold start sem token (`missing-token`), agora `GoogleDriveAppDataService` renova também sem token; (2) token renovado não era persistido, agora `renewDriveTokenSilently` em `FirebaseAuthService` grava via `rememberGoogleDriveAccessToken`; (3) guard `permission-error` de `scheduleBookmarkDriveSync` travava todos os gatilhos, agora só barra com consentimento pendente; (4) flag de consentimento só em memória (perdida no cold start), agora persistida em localStorage e limpa por qualquer token novo/logout; (5) resume chamava `refreshDriveToken({ userInitiated: true })`, furando o cooldown anti "login toda hora", agora `userInitiated: false`; (6) listeners sem cleanup; (7) retry rodava pra não-Pro; (8) `ReaderScreen.tsx` regravado com BOM + mojibake (restaurado do HEAD); (9) código morto do toast removido (prop, estado no App, chave i18n). T005/T011 estavam marcadas sem teste: criados `BookmarkDriveSyncTriggers.test.ts` + casos em `FirebaseAuthService.test.ts`/`GoogleDriveAppDataService.test.ts`. lint/test (1089 passed)/build limpos. | Validar no device (cold start sem token) e no AAB de release. |
| 2026-09-23 | Validação em device (debug, RXCX103NMVZ) | Token persistido apagado + force-stop + relaunch (simula TTL vencido no cold start). Resultado: `vocabulary.sync.success` no boot e token reapareceu no localStorage; usuário criou bookmark e fechou o livro → `bookmark.sync.success` 2x (criação + fechamento), zero `bookmark.sync.failure`, nenhuma activity do Google aberta, sem toast. Ressalva: o evento `drive.token.silent.renewed` não apareceu no logcat (renovação comprovada pelo token de volta + syncs OK, mas o log em si não foi confirmado). Expiração natural de 1h não testada. | Validar no AAB de release (SC-003). |
| 2026-09-23 | Correção da validação acima | **A validação anterior NÃO exercitou a renovação**: logcat sem nenhuma chamada `authorizeSilent`. `localStorage.removeItem` via CDP seguido de `am force-stop` não chega ao disco (o WebView grava o DOMStorage de forma assíncrona), então o token antigo e válido sobreviveu e os syncs passaram com ele. Refeito: `drive-token-expiry=0` (simula o TTL) + `location.reload()` sem matar o processo → `authorizeSilent` chamado, `drive.token.silent.renewed` 180ms depois, expiry renovado, `vocabulary.sync.success`, nenhuma UI. O logger não tinha problema: o evento faltava porque a renovação não aconteceu. Bookmark depois da renovação usa o mesmo `GoogleDriveAppDataService` (coberto por teste). O Google devolveu o mesmo token do cache (ainda válido do lado dele); a emissão de token novo após 1h real não foi observada. Validação do AAB de release dispensada pelo usuário ("esse problema de chave já ocorreu e não precisamos mudar nada"). | Nenhuma bloqueante. |
| 2026-09-23 | Phase 5: Convergence | T017: o usuário testou no device o cenário do modo avião e relatou "funcionou" (evidência = relato do usuário; o logcat daquele teste não foi capturado nesta sessão). T018: `quickstart.md` reescrito com o fluxo real (gradlew/adb/CDP, expiração via `drive-token-expiry=0` + `location.reload()`, aviso sobre `force-stop`, release dispensado, cenário 5 de expiração real). | T015 (revogação/consentimento) e T016 (1h real). |

## Arquivos Principais

- `android/app/src/main/java/com/johnny/neoreader/GoogleDriveAuthPlugin.java`
- `android/app/src/main/java/com/johnny/neoreader/MainActivity.java`
- `src/plugins/GoogleDriveAuthPlugin.ts`
- `src/services/FirebaseAuthService.ts` (`renewDriveTokenSilently`, `isDriveConsentRequired`)
- `src/services/GoogleDriveAppDataService.ts`
- `src/services/BookmarkDriveSyncService.ts` (`initBookmarkSyncTriggers`, `retryPendingBookmarkSyncs`)

## Cuidados para Retomada

- Se o sintoma original (bookmark não sincroniza ao fechar / toast de erro)
  reaparecer, abrir um bug novo em vez de reabrir esta feature — a decisão do
  usuário em 2026-09-23 foi encerrar o ciclo de validação manual e usar o app
  normalmente daqui pra frente.

## Resultado Final

<!-- Anexado pelo sdd-converge (2026-09-23). Nada acima foi reescrito. -->

Feature convergida com as duas user stories (P1 e P2) implementadas e
cobertas por teste automatizado:

- **US1 (sync silencioso)**: `GoogleDriveAppDataService` renova o token sem
  UI tanto na ausência de token (cold start após o TTL de ~55min) quanto após
  um 401/403 em voo, via `GoogleDriveAuthPlugin.authorizeSilent()`
  (`AuthorizationClient` do Google Identity Services, sem
  `requestOfflineAccess`). O token renovado é persistido
  (`rememberGoogleDriveAccessToken`). `initBookmarkSyncTriggers` re-tenta os
  bookmarks pendentes no cold start, no resume do app e ao voltar a rede. O
  toast `reader.bookmarkSyncPendingNotice` foi removido (chave i18n e código
  morto também).
- **US2 (consentimento residual)**: quando o Google exige UI
  (`hasResolution()=true`), a flag `isDriveConsentRequired` é persistida em
  `localStorage` e só é consumida no próximo resume/cold start, via
  `refreshDriveToken({ userInitiated: false })` — respeitando o cooldown
  existente contra o bug "app pede login do Google o tempo todo". Qualquer
  token novo ou logout limpa a flag.

**Desvios acumulados em relação ao plano original** (ver Execution Notes
acima para o histórico completo): a primeira implementação (de outro
modelo) tinha 9 problemas — cobria só o retry pós-401 (não o cold start sem
token), não persistia o token renovado, o guard `permission-error`
continuava travando os gatilhos, a flag de consentimento não sobrevivia a
cold start, o resume furava o cooldown anti-spam de login, faltavam
cleanups de listener, o retry rodava para não-Pro, e `ReaderScreen.tsx` foi
regravado com encoding corrompido (BOM + mojibake). Tudo corrigido numa
revisão de código antes do commit (`9c18cfe`); T005/T011 (testes que
estavam marcadas como feitas sem existir) foram escritas de fato.

**Validado em device (debug, RXCX103NMVZ)**: renovação silenciosa
confirmada via `authorizeSilent` → `drive.token.silent.renewed` (simulando
o TTL vencido, sem matar o processo); gatilho de retorno ao app depois do
modo avião confirmado pelo usuário. **Não validado** (risco aceito
explicitamente pelo usuário em 2026-09-23, ver R-002): revogação de acesso
via Google Account (caso `needsUi=true`) e expiração real de 1h. **Não
validado** (risco aceito, ver R-001): comportamento no AAB de release —
mesmo bug de assinatura já conhecido do projeto, sem mudança necessária
nesta feature.

**Métricas de sucesso da spec**: SC-002 (zero toasts no caminho feliz) e a
parte funcional de SC-001 (sync sem interação) confirmadas em device;
SC-001 restrito à emissão de token novo após 1h real e SC-003 (release)
ficam como risco aceito, não bloqueante.

