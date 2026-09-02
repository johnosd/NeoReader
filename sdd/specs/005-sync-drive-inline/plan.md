# Implementation Plan: Renovação Silenciosa do Token do Google Drive e Sincronização Inline pelo Ícone de Bookmark

**Slug**: `005-sync-drive-inline` | **Date**: 2026-09-02 | **Spec**: `sdd/specs/005-sync-drive-inline/spec.md`

## Summary

Hoje, quando o token do Google Drive expira (~55min, sem refresh automático),
qualquer sync (bookmark/progresso/vocabulário) falha e só se recupera com o
usuário clicando manualmente em "Conectar Google Drive" em Configurações. A
feature centraliza um retry-once com renovação silenciosa dentro do único
ponto por onde TODAS as chamadas ao Drive já passam
(`GoogleDriveAppDataService`), então os 3 tipos de sync se beneficiam sem
duplicar lógica. Além disso, o ícone de nuvem de cada bookmark na tela de
Detalhes do Livro (hoje só informativo) vira tocável quando pendente/erro,
disparando a mesma sincronização do livro inteiro inline, com estado visual
de "sincronizando".

## Technical Context

**Language/Version**: TypeScript 5 / React 19 via Vite 8 — sem mudança.

**Primary Dependencies**: Nenhuma nova. Reaproveita `@capacitor-firebase/authentication`
(já usado por `FirebaseAuthService.ts`), `dexie-react-hooks` (`useLiveQuery`,
já usado em `BookDetailsScreen.tsx`), `lucide-react` (ícones `Cloud`/
`CloudOff` já usados).

**Storage**: Dexie — reaproveita campos já existentes em `bookmarks`
(`syncError`, `syncedAt`, `syncKey`) — sem alteração de schema, sem nova
`version()`.

**Testing**: Vitest + Testing Library. Arquivos existentes afetados:
`src/__tests__/services/GoogleDriveAppDataService.test.ts` (retry-once),
`src/__tests__/services/FirebaseAuthService.test.ts` (coalescing de
chamadas concorrentes), `src/__tests__/screens/BookDetailsScreen.test.tsx`
(ícone tocável + estado "sincronizando"). `BookmarkDriveSyncService.test.ts`
usa um `driveClient` mock próprio (não a classe real) — não afetado pelo
retry, só pela mudança de assinatura de `scheduleBookmarkDriveSync` se algum
teste ali chamar essa função diretamente (a confirmar na exploração da
Fase 1 do `sdd-execute`).

**Target Platform**: Android (Capacitor) + Web, mesma superfície de código.
O comportamento "silencioso quando o escopo já foi concedido, visível
quando não" é nativo do próprio `signInWithGoogle`/Google Identity Services
(Android) e do fluxo popup/redirect já existente (Web) — nenhuma lógica de
plataforma nova é introduzida, a feature só passa a *chamar* esse mecanismo
já existente em mais lugares/momentos.

**Performance Goals**: N/A — no máximo 1 tentativa de renovação + 1 retry de
request por falha de token, não é hot path.

**Constraints**: Reaproveitar exatamente o mecanismo de autenticação já
existente (`refreshDriveToken` em `FirebaseAuthService.ts`) — sem criar um
fluxo de auth paralelo. Não implementar `refresh_token` de longa duração
(OAuth offline) — fora de escopo (FR-009 da spec).

**Scale/Scope**: 4 arquivos de lógica (`GoogleDriveAppDataService.ts`,
`FirebaseAuthService.ts`, `BookmarkDriveSyncService.ts`,
`BookDetailsScreen.tsx`) + os testes correspondentes. Nenhuma tela nova,
nenhuma rota nova.

## Decisões Invariantes

- O retry-once com renovação silenciosa vive num único lugar —
  `GoogleDriveAppDataService.request()`/`resolveAccessToken()` — não
  duplicado nos 3 arquivos de sync (`BookmarkDriveSyncService.ts`,
  `ProgressDriveSyncService.ts`, `VocabularyDriveSyncService.ts`), que
  continuam **inalterados** (FR-001/FR-002/FR-003 cobertos pelo único ponto
  por onde todas as chamadas Drive já passam).
- No máximo **1 retry** por falha de token (seja `missing-token` antes do
  fetch, seja `permission-denied`/401/403 depois do fetch) — nunca um loop.
  Se o retry também falhar, o erro final propagado é o mesmo tipo de hoje
  (`missing-token`/`permission-denied`), preservando a classificação de
  status já usada pelas telas.
- `refreshDriveToken()` (`FirebaseAuthService.ts`) ganha coalescing de
  chamadas concorrentes — uma única promise em voo compartilhada entre
  chamadores simultâneos — em vez de assinatura nova. Resolve o edge case da
  spec (bookmark/progresso/vocabulário falhando quase ao mesmo tempo não
  dispara 3 renovações simultâneas nem 3 seletores de conta).
- `GoogleDriveAppDataService` ganha uma opção construtora injetável
  `refreshAccessToken` (mesmo padrão já usado por `getAccessToken`/
  `fetchImpl`), com default apontando pro `refreshDriveToken` real. Isso é
  necessário — não especulativo — porque `GoogleDriveAppDataService.test.ts`
  hoje testa a classe real diretamente; sem a injeção, o retry chamaria o
  `refreshDriveToken` de verdade (que tenta o plugin nativo do Capacitor)
  dentro de testes unitários, arriscando flakiness. O helper `makeService()`
  desse arquivo de teste passa a injetar um no-op por padrão.
- `scheduleBookmarkDriveSync` (`BookmarkDriveSyncService.ts`) passa a
  retornar `Promise<void>` (era `void`) — mudança de assinatura
  retrocompatível (nenhum call site hoje faz `await`; passam a poder, sem
  quebrar quem ignora o retorno). Necessário pra `BookDetailsScreen.tsx`
  saber quando mostrar/esconder o estado "sincronizando".
- O toque no ícone de bookmark, em `BookDetailsScreen.tsx`, chama
  `setBookmarkDriveSyncStatus('pending-offline')` **antes** de chamar
  `scheduleBookmarkDriveSync(book.id)` — mesma dança que
  `handleReconnectDrive` (`SettingsSyncScreen.tsx`) já faz hoje. Sem isso, o
  guard de `permission-error` dentro de `scheduleBookmarkDriveSync` (linha
  46, `if (getCachedBookmarkDriveSyncStatus().code === 'permission-error') return`)
  silenciaria o toque sempre que a última tentativa tivesse falhado — exatamente
  o tipo de "clique não faz nada" que motivou esta feature.
- Um único `bookId` sincroniza **todos** os bookmarks daquele livro de uma
  vez — `syncBookBookmarks(bookId)` já consulta
  `db.bookmarks.where('bookId').equals(bookId)` internamente. FR-005 (toque
  sincroniza todos os pendentes do livro) não precisa de nenhuma lógica
  nova de agregação — é o comportamento natural de chamar
  `scheduleBookmarkDriveSync(book.id)` uma única vez.
- O estado visual "sincronizando" é local ao componente `BookDetailsScreen`
  (um `boolean` só, já que a tela é sempre de um livro por vez) — não
  precisa de store global novo. `syncedAt`/`syncError` continuam vindo do
  `useLiveQuery` já existente (atualiza sozinho quando o Dexie muda).

## Constitution Check

*GATE: deve passar antes da Fase 0. Reavaliado após o design da Fase 1.*

| Princípio | Pré-Design | Pós-Design | Notas |
| --- | --- | --- | --- |
| I. Plano antes de feature grande | OK | OK | Este plano é a proposta de arquivos afetados. |
| II. Comentários só onde o "porquê" não é óbvio | OK | OK | Comentários necessários: por que o retry é capado em 1 (evitar loop/hammering), por que o coalescing existe (edge case de 3 syncs falhando junto), por que o toque reseta o status antes de agendar (guard de `permission-error` senão silencia). |
| III. Explícito antes de mágico | Risco avaliado | OK | Único ponto de atenção: `refreshAccessToken` injetável em `GoogleDriveAppDataService`. Justificado — necessário pra não disparar chamada real ao Capacitor em teste unitário, mesmo padrão já usado por `getAccessToken`/`fetchImpl` na mesma classe. |
| IV. Build limpo é a definição de "pronto" | OK | OK | `npm run build` ao final de cada fase. |
| V. Dependências novas exigem justificativa | OK | OK | Nenhuma dependência nova. |

## Project Structure

### Documentation (this feature)

```text
sdd/specs/005-sync-drive-inline/
├── spec.md              # Saída do sdd-specify
├── plan.md               # Este arquivo
├── quickstart.md          # Fase 1 — passos de verificação manual
└── tasks.md               # Saída do sdd-plan (fase de tasks)
```

(Sem `research.md` — nenhuma incerteza técnica genuína, o mecanismo a
reaproveitar já existe e foi confirmado por leitura direta do código. Sem
`data-model.md`/`contracts/` — nenhuma entidade nova, nenhuma superfície de
API pública nova, só ajuste de assinatura interna de uma função já
existente.)

### Source Code (repository root)

```text
src/
├── services/
│   ├── GoogleDriveAppDataService.ts     # MODIFICADO — retry-once com renovação silenciosa; opção `refreshAccessToken` injetável
│   ├── FirebaseAuthService.ts           # MODIFICADO — refreshDriveToken() ganha coalescing de chamadas concorrentes
│   ├── BookmarkDriveSyncService.ts      # MODIFICADO — scheduleBookmarkDriveSync retorna Promise<void> (era void)
│   ├── ProgressDriveSyncService.ts      # SEM MUDANÇA — beneficiado indiretamente via GoogleDriveAppDataService
│   └── VocabularyDriveSyncService.ts    # SEM MUDANÇA — beneficiado indiretamente via GoogleDriveAppDataService
├── screens/
│   ├── BookDetailsScreen.tsx            # MODIFICADO — ícone de bookmark tocável (pendente/erro) + estado "sincronizando"
│   └── SettingsSyncScreen.tsx           # SEM MUDANÇA — continua sendo o fallback manual, já corrigido nos bugs desta sessão
└── __tests__/
    ├── services/
    │   ├── GoogleDriveAppDataService.test.ts  # MODIFICADO — helper makeService() injeta refreshAccessToken no-op; novos testes de retry-once
    │   └── FirebaseAuthService.test.ts        # MODIFICADO — novo teste de coalescing (2 chamadas concorrentes → 1 só signInWithGoogle)
    └── screens/
        └── BookDetailsScreen.test.tsx    # MODIFICADO — novos testes: ícone tocável só pendente/erro, toque dispara sync, estado "sincronizando", não tocável quando já sincronizado
```

**Structure Decision**: Projeto único (React + Capacitor), sem separação
backend/frontend. Nenhuma pasta nova — só edições em arquivos de serviço e
tela já existentes, seguindo a convenção já estabelecida (services como
classes/funções em `src/services/`, testes espelhando em
`src/__tests__/services/`).

## Complexity Tracking

> Nenhuma violação não justificada do Constitution Check. O único ponto
> avaliado (`refreshAccessToken` injetável) está documentado na tabela
> acima como justificado, não como violação — tabela abaixo fica vazia.

| Violação | Por que é necessária | Alternativa mais simples rejeitada porque |
| --- | --- | --- |

## Estratégia de Testes

Prioridade: unitário (Vitest, por serviço) → componente (Testing Library,
`BookDetailsScreen`) → manual no device (`quickstart.md`, já que a UX real
do seletor de conta Google só se comprova ao vivo).

Testes novos cobrem especificamente o que esta feature muda:
- `GoogleDriveAppDataService.test.ts`: token ausente → renova → retry
  sucesso; token ausente → renova → retry falha → erro final
  `missing-token`; 401/403 → renova → retry sucesso; 401/403 → renova →
  retry falha → erro final `permission-denied`; exatamente 1 chamada de
  `refreshAccessToken` por falha (nunca mais que 1 retry).
- `FirebaseAuthService.test.ts`: 2 chamadas concorrentes de
  `refreshDriveToken()` resultam em 1 única chamada real a
  `FirebaseAuthentication.signInWithGoogle`, ambas as promises resolvem.
- `BookDetailsScreen.test.tsx`: ícone tocável só quando `syncError` ou
  `!syncedAt`; toque chama `scheduleBookmarkDriveSync(book.id)` (mockado);
  estado "sincronizando" aparece durante e some depois; ícone já
  sincronizado não é tocável (sem handler).

Comandos-base:

```powershell
npm run lint
npm test
npx tsc --noEmit
npm run build
```

Arquivo único: `npx vitest run src/__tests__/services/GoogleDriveAppDataService.test.ts`
(ou o arquivo relevante da fase em andamento).

## Estado Atual

<!-- Sobrescrita a cada checkpoint pelo sdd-execute. Vazia na criação. -->

| Área | Estado |
| --- | --- |
| Setup (Fase 1) | Concluído — baseline confirmado (767 testes, lint/tsc/build limpos antes da feature). |
| Fase 2 (US1 — renovação silenciosa) | Concluído — retry-once em `GoogleDriveAppDataService`, coalescing em `refreshDriveToken`. 770 testes passando. |
| Fase 3 (US2 — ícone inline) | Concluído — ícone de bookmark tocável + estado "sincronizando" em `BookDetailsScreen.tsx`. MVP completo (US1+US2). 775 testes passando. |
| Fase 4 (US3 — consistência) | Concluído — confirmado por código (mesmo store singleton) e ao vivo no device. |
| Fase 5 (Polish) | Concluído — quickstart validado no device pelo usuário (3 cenários), 1 ajuste de UX ad-hoc (espaçamento entre ícone de sync e botão de excluir). Feature pronta pra fechar como Implementada. |

## Riscos e Decisões

<!--
  IDs estáveis (R-001, R-002...), nunca deletados. Item resolvido ganha
  prefixo "Resolvido:" na célula de Mitigação em vez de sumir da tabela.
-->

| ID | Risco/Decisão | Impacto | Mitigação/Encaminhamento |
| --- | --- | --- | --- |
| R-001 | `GoogleDriveAppDataService.test.ts` testa a classe real diretamente; sem injetar um `refreshAccessToken` no-op, o retry-once chamaria o `refreshDriveToken` real (que tenta `FirebaseAuthentication.signInWithGoogle` do Capacitor) dentro de testes unitários — risco de flakiness/lentidão/erros de console em ambiente jsdom sem o plugin nativo disponível. | Alto se não tratado — quebraria ou deixaria flaky 2 testes já existentes (`'falha sem token sem chamar fetch'`, `'mapeia HTTP 403 como permissao negada'`). | Resolvido: helper `makeService()` injeta `refreshAccessToken: async () => {}` por padrão (T002), feito antes de qualquer lógica de retry ser adicionada (T008) — os 2 testes existentes continuam passando, agora com asserção extra de quantas vezes `refreshAccessToken` é chamado. |
| R-002 | `src/__tests__/screens/BookDetailsScreen.test.tsx` mocka `useEntitlements` como um objeto fixo (`isPro: false` sempre) e `useLiveQuery` por índice posicional de chamada — nenhum teste hoje roda com `isPro: true`, então o ícone de sync (que só aparece pra Pro) nunca foi exercitado nesse arquivo. | Médio — testar o ícone tocável exige primeiro tornar `useEntitlements` overridable (`vi.fn()` com `mockReturnValue`, mesmo padrão já usado em `SettingsSyncScreen.test.tsx`), sem quebrar os testes existentes que dependem do `isPro: false` fixo. | Resolvido: `useEntitlements` virou `vi.fn()` hoisted com default `isPro: false` no `beforeEach` (T010); os 18 testes existentes continuam passando sem mudança, e os 5 novos usam `mockReturnValue({ isPro: true, ... })`. |
| R-003 | Durante a T014a (teste de toque duplicado no ícone), descoberto que o guard original (`if (syncingBookmarks || ...)`, só com `useState`) tem uma corrida real: `setState` é assíncrono/batched no React, então 2 cliques síncronos na mesma tick (sem re-render entre eles) podiam ambos ler o state antigo (`false`) e escapar do guard, disparando `scheduleBookmarkDriveSync` 2 vezes — violaria FR-008/SC-004. | Médio (bloqueava a própria task, corrigido inline) — é um padrão que qualquer outro handler async com guard via `useState` no projeto pode repetir. | Resolvido: `syncingBookmarksRef` (`useRef`, mutado sincronamente) virou o guard real; `syncingBookmarks` (state) ficou só pro visual do spinner. Teste ajustado pra disparar 2 cliques de propósito sem `await` entre eles, provando que o ref pega o caso que o state sozinho não pegaria. Padrão a reaproveitar em qualquer handler futuro que precise de guard contra double-tap com trabalho assíncrono no meio. |
| R-004 | Durante a validação manual no device (T018), o usuário reportou que o ícone de sync (novo, tocável nesta feature) e o X de excluir bookmark ficavam pequenos e muito próximos — risco real de excluir um bookmark querendo sincronizar. | Baixo/Médio (achado só em teste manual, não pego por nenhum teste automatizado — são só classes CSS, sem assertion de distância visual) — mas o risco de UX (perda de dado do usuário por engano) era real. | Resolvido: `gap-1` → `gap-4` no container dos dois botões, e o botão de sync ganhou o mesmo padding de toque do botão de excluir (`p-2 -m-2`). Corrigido inline como task ad-hoc (T018a), sem regressão (23/23 testes de `BookDetailsScreen.test.tsx`). |

## Execution Notes

<!-- Tabela append-only, mantida pelo sdd-execute. -->

| Data | Fase/Story | Resumo | Pendência Principal |
| --- | --- | --- | --- |
| 2026-09-02 | Setup + Fase 2 (US1) | Baseline confirmado (767 testes). `GoogleDriveAppDataService.ts`: opção `refreshAccessToken` injetável (default `refreshDriveToken`) + retry-once em `resolveAccessToken()` (token ausente) e `request()` (401/403) — capado em 1 tentativa, nunca loop. `FirebaseAuthService.ts`: `refreshDriveToken()` ganhou coalescing (promise em voo compartilhada). `GoogleDriveAppDataService.test.ts` e `FirebaseAuthService.test.ts` com os testes novos (R-001 do plano neutralizado: helper `makeService()` já injeta no-op). `BookmarkDriveSyncService.ts`/`ProgressDriveSyncService.ts`/`VocabularyDriveSyncService.ts` inalterados, como previsto. 770 testes passando, lint/tsc/build limpos. | Nenhuma — metade do MVP completa. |
| 2026-09-02 | Fase 3 (US2) | `scheduleBookmarkDriveSync` retorna `Promise<void>`. `BookDetailsScreen.tsx`: ícone de bookmark pendente/erro vira `button` tocável (`aria-label` novo, 3 locales), dispara `handleSyncBookmarksTap` (reseta status + agenda sync do livro), estado "sincronizando" via `Spinner`. Durante o teste de toque duplicado (T014a), achado e corrigido inline um bug de corrida real no guard (state assíncrono não pegava 2 cliques na mesma tick) — resolvido com `useRef` síncrono, documentado em R-003. `useEntitlements` do teste virou overridable (R-002 resolvido). 775 testes passando, lint/tsc/build limpos. | Nenhuma — MVP completo (US1+US2). |
| 2026-09-02 | Fase 4 (US3) + Fase 5 (Polish) | US3 confirmada por inspeção de código (mesmo store singleton entre `SettingsSyncScreen.tsx` e `BookDetailsScreen.tsx`) + ao vivo no device. App reinstalado no device do usuário (`npm run android:run`); usuário validou os 3 cenários do quickstart, todos funcionando. Achado durante o teste (T018a, ad-hoc): ícone de sync e botão de excluir bookmark pequenos e próximos demais, risco de toque errado — corrigido aumentando `gap-1` → `gap-4` e igualando o padding de toque (`p-1 -m-1` → `p-2 -m-2`). Sem regressão (23/23 testes de `BookDetailsScreen.test.tsx`). Todas as 26 tasks de `tasks.md` concluídas, Checklist de Release completo. | Nenhuma — feature pronta pra fechar como Implementada. |

**PRÓXIMO**: Rodar `sdd-converge` quando o usuário quiser auditar a implementação final contra spec/plan/tasks.

## Arquivos Principais

<!-- Sobrescrita a cada checkpoint — foco da etapa atual, não a árvore inteira. -->

- `src/services/GoogleDriveAppDataService.ts` — retry-once + `refreshAccessToken` injetável
- `src/services/FirebaseAuthService.ts` — `refreshDriveToken()` com coalescing
- `src/services/BookmarkDriveSyncService.ts` — `scheduleBookmarkDriveSync` retorna `Promise<void>`
- `src/screens/BookDetailsScreen.tsx` — ícone de bookmark tocável + estado "sincronizando" + guard via `useRef` + espaçamento/tap-target ajustados (R-004)
- `src/i18n/messages.ts` — chave `bookDetails.syncBookmarks` nova (3 locales)
- `src/__tests__/services/GoogleDriveAppDataService.test.ts` — 9 testes (4 novos)
- `src/__tests__/services/FirebaseAuthService.test.ts` — 3 testes (1 novo)
- `src/__tests__/screens/BookDetailsScreen.test.tsx` — 23 testes (5 novos), `useEntitlements` agora overridable

## Resultado Final

<!-- Anexado pelo sdd-converge ao fechar como Convergida. -->

Convergência auditada em 2026-09-02: nenhuma lacuna (`missing`/`partial`/
`contradicts`/`unrequested`) entre spec.md (11 FRs, 4 SCs, 3 user stories) e
o código final. Os 7 arquivos listados em Arquivos Principais são exatamente
os modificados no working tree — sem escopo extra, sem sobra.

O que foi construído, resumido:

- **US1 (renovação silenciosa)**: retry-once centralizado em
  `GoogleDriveAppDataService` (`resolveAccessToken()` cobre token ausente,
  `request()` cobre 401/403), acionado por qualquer chamada de sync — sem
  polling nem timer proativo. `FirebaseAuthService.refreshDriveToken()`
  ganhou coalescing de promise em voo pra evitar corridas quando múltiplos
  syncs (bookmark/progresso/vocabulário) disparam renovação ao mesmo tempo.
  `ProgressDriveSyncService`/`VocabularyDriveSyncService` não precisaram de
  nenhuma mudança — herdam o retry por já passarem pelo serviço central,
  confirmando a decisão de arquitetura DRY tomada no plano.
- **US2 (ícone inline)**: ícone de bookmark pendente/erro em
  `BookDetailsScreen.tsx` virou `button` tocável, dispara sync do livro
  inteiro e mostra spinner enquanto roda.
- **US3 (consistência de estado)**: confirmada por inspeção (mesmo store
  singleton entre `SettingsSyncScreen.tsx` e `BookDetailsScreen.tsx`) e ao
  vivo no device — sem código extra necessário.

Desvios acumulados nas Execution Notes (nenhum contradiz a spec; ambos
documentados como R-003/R-004 e já com evidência de resolução no código):

- **R-003**: guard de double-tap via `useState` sozinho tinha uma corrida
  real (2 cliques síncronos na mesma tick liam o state antigo) — corrigido
  com `syncingBookmarksRef` (`useRef`, mutado sincronamente) como guard
  real, mantendo `useState` só pro visual do spinner. Achado escrevendo o
  teste da task, não em produção.
- **R-004**: ajuste de UX ad-hoc (T018a) reportado pelo usuário testando no
  device — ícone de sync e botão de excluir bookmark pequenos/próximos
  demais, risco de exclusão acidental. Corrigido com `gap-1`→`gap-4` e
  padding de toque igualado (`p-2 -m-2`) entre os dois botões.

Nenhuma decisão técnica do plano original foi revertida ou substituída —
todas as 4 entradas de Riscos e Decisões (R-001–R-004) fecharam com
"Resolvido:" e mitigação confirmada por teste automatizado ou validação
manual no device. 775 testes passando, lint/tsc/build limpos na última
checagem (Fase 5).

## Cuidados para Retomada

<!-- Armadilhas operacionais específicas desta feature, anexadas conforme descobertas. -->

- (nenhum ainda)
