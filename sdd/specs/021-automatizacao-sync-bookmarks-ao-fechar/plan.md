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
| R-001 | AAB Release vs Google Sign-In Bug | Alto | O teste no device físico com o APK assinado para release é critério de aceite mandatório desta feature. |

## Execution Notes

| Data | Fase/Story | Resumo | Pendência Principal |
| --- | --- | --- | --- |
| 2026-09-23 | Phase 1: Foundational | Spike substituído pelo GoogleDriveAuthPlugin. API pronta para uso no TS. | Nenhuma. |
| 2026-09-23 | Phase 2: US1 | Sync tenta renovar token via plugin Android silenciosamente. Orquestrador montado para retry. | Nenhuma. |
| 2026-09-23 | Phase 3: US2 | Flag needsUi salva e consome prompt apenas no appStateChange de resume. | Nenhuma. |
| 2026-09-23 | Revisão de código (Claude) | Corrigidos: (1) renovação só rodava em 401, nunca no cold start sem token (`missing-token`), agora `GoogleDriveAppDataService` renova também sem token; (2) token renovado não era persistido, agora `renewDriveTokenSilently` em `FirebaseAuthService` grava via `rememberGoogleDriveAccessToken`; (3) guard `permission-error` de `scheduleBookmarkDriveSync` travava todos os gatilhos, agora só barra com consentimento pendente; (4) flag de consentimento só em memória (perdida no cold start), agora persistida em localStorage e limpa por qualquer token novo/logout; (5) resume chamava `refreshDriveToken({ userInitiated: true })`, furando o cooldown anti "login toda hora", agora `userInitiated: false`; (6) listeners sem cleanup; (7) retry rodava pra não-Pro; (8) `ReaderScreen.tsx` regravado com BOM + mojibake (restaurado do HEAD); (9) código morto do toast removido (prop, estado no App, chave i18n). T005/T011 estavam marcadas sem teste: criados `BookmarkDriveSyncTriggers.test.ts` + casos em `FirebaseAuthService.test.ts`/`GoogleDriveAppDataService.test.ts`. lint/test (1089 passed)/build limpos. | Validar no device (cold start sem token) e no AAB de release. |

**PRÓXIMO**: Validar em device AAB Release.

## Arquivos Principais

- `android/app/src/main/java/com/johnny/neoreader/GoogleDriveAuthPlugin.java`
- `android/app/src/main/java/com/johnny/neoreader/MainActivity.java`
- `src/plugins/GoogleDriveAuthPlugin.ts`

## Cuidados para Retomada

- (nenhum ainda)

