---
description: "Tasks: Renovação Silenciosa do Token do Google Drive e Sincronização Inline pelo Ícone de Bookmark"
---

# Tasks: Renovação Silenciosa do Token do Google Drive e Sincronização Inline pelo Ícone de Bookmark

**Input**: Documentos de design de `sdd/specs/005-sync-drive-inline/`

**Prerequisites**: plan.md (obrigatório), spec.md (obrigatório para user stories), quickstart.md

**Organization**: Setup → User Story 1 (mecanismo de renovação, camada de
serviço) → User Story 2 (UI do ícone de bookmark, consome o mecanismo da
US1) → User Story 3 (consistência, só verificação) → Polish. Sem fase
"Foundational" separada — esta feature não tem infraestrutura compartilhada
além do que já pertence naturalmente à US1 (o mecanismo de retry vive num
único arquivo já existente, não precisa de scaffolding novo).

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Pode rodar em paralelo (arquivos diferentes, sem dependência)
- **[Story]**: A qual user story esta task pertence (US1, US2, US3)
- Incluir caminhos de arquivo exatos nas descrições

## Path Conventions

- Serviços: `src/services/` (classes/funções, ex: `GoogleDriveAppDataService.ts`)
- Telas: `src/screens/` (ex: `BookDetailsScreen.tsx`)
- Testes: `src/__tests__/`, espelhando a estrutura acima (`__tests__/services/`, `__tests__/screens/`)

---

## Phase 1: Setup

**Purpose**: Confirmar baseline limpo antes de qualquer mudança.

- [X] T001 Rodar `npm run lint && npm test && npx tsc --noEmit && npm run build` no estado atual (antes de qualquer mudança desta feature) — isola qualquer regressão futura como introduzida por esta feature, não preexistente.

---

## Phase 2: User Story 1 - Renovação silenciosa do token do Drive (Priority: P1) 🎯 MVP (parte 1/2)

**Objetivo**: Qualquer sincronização (bookmark, progresso ou vocabulário) que encontrar o token do Drive ausente/expirado tenta renovar silenciosamente e refaz a tentativa antes de propagar erro — sem exigir toque manual do usuário na maioria dos casos.

**Independent Test**: Com o Drive já conectado antes (escopo concedido) e o token expirado, disparar qualquer sincronização e confirmar que ela completa com sucesso sem nenhum toque em "Conectar".

### Testes da Fase

- [X] T002 [P] [US1] Em `src/__tests__/services/GoogleDriveAppDataService.test.ts`: atualizar o helper `makeService()` pra aceitar e injetar por padrão `refreshAccessToken: async () => {}` (no-op) — evita que os testes já existentes disparem uma chamada real ao `refreshDriveToken`/Capacitor quando a lógica de retry for adicionada.
- [X] T003 [P] [US1] Em `GoogleDriveAppDataService.test.ts`: novo teste — token ausente, `refreshAccessToken` mock resolve e a segunda chamada de `getAccessToken` já retorna um token válido → a request completa com sucesso (fetch chamado com o novo token).
- [X] T004 [P] [US1] Em `GoogleDriveAppDataService.test.ts`: novo teste — token ausente, `refreshAccessToken` resolve mas `getAccessToken` continua retornando vazio → erro final `missing-token`, `refreshAccessToken` chamado exatamente 1 vez (nunca um loop).
- [X] T005 [P] [US1] Em `GoogleDriveAppDataService.test.ts`: novo teste — fetch retorna 401/403, `refreshAccessToken` resolve, segunda tentativa de fetch retorna 200 → sucesso, `fetchImpl` chamado 2 vezes (original + retry).
- [X] T006 [P] [US1] Em `GoogleDriveAppDataService.test.ts`: novo teste — fetch retorna 401/403 nas duas tentativas → erro final `permission-denied`, `fetchImpl` chamado exatamente 2 vezes (nunca mais que 1 retry).
- [X] T007 [P] [US1] Em `src/__tests__/services/FirebaseAuthService.test.ts`: novo teste — chamar `refreshDriveToken()` duas vezes concorrentemente (sem `await` entre elas) resulta em `FirebaseAuthentication.signInWithGoogle` (`mocks.nativeSignInWithGoogle`) chamado só 1 vez, e ambas as promises resolvem.

### Implementation

- [X] T008 [US1] Em `src/services/GoogleDriveAppDataService.ts`: adicionar `refreshAccessToken?: () => Promise<void>` a `GoogleDriveAppDataServiceOptions` (default: `refreshDriveToken`, importado de `./FirebaseAuthService`). Implementar retry-once: em `resolveAccessToken()`, se o token vier vazio numa primeira tentativa, chamar `this.refreshAccessToken()` e tentar resolver de novo (capado em 1 novo intento, sem loop); em `request()`, se a resposta for 401/403 numa primeira tentativa, chamar `this.refreshAccessToken()` e refazer a mesma request uma vez (capado em 1 retry). Comentário curto explicando o cap de 1 (evitar hammering/loop).
- [X] T009 [US1] Em `src/services/FirebaseAuthService.ts`: `refreshDriveToken()` ganha uma promise em voo compartilhada (`let inFlightDriveTokenRefresh: Promise<void> | null`) — chamadas concorrentes reaproveitam a mesma promise em vez de disparar `signInWithGoogle` de novo; limpa a referência no `finally`. Comentário curto explicando o porquê (evitar 3 seletores de conta/3 chamadas de rede quando bookmark/progresso/vocabulário falham quase juntos).

**Critério de Conclusão**: Qualquer chamada Drive (list/getJson/createJson/updateJson, usada por bookmark/progress/vocabulary sync) que falhar por token ausente ou expirado tenta renovar silenciosamente e refaz a chamada uma vez antes de propagar erro; chamadas concorrentes de renovação são coalescidas numa só. `BookmarkDriveSyncService.ts`, `ProgressDriveSyncService.ts` e `VocabularyDriveSyncService.ts` permanecem **inalterados** — o benefício é automático. `npm run lint && npm test && npx tsc --noEmit && npm run build` passam sem erro.

**Checkpoint**: Mecanismo de renovação silenciosa pronto e testado — metade do MVP.

**Registro da Fase**:

- Status: Concluída
- Feito: `GoogleDriveAppDataService.ts` ganhou `refreshAccessToken` injetável (default `refreshDriveToken`) e retry-once em `resolveAccessToken()`/`request()` (token ausente ou 401/403 → renova → repete 1 vez, nunca loop). `FirebaseAuthService.ts`: `refreshDriveToken()` ganhou coalescing via promise em voo compartilhada. Nenhum dos 3 arquivos de sync (bookmark/progress/vocabulary) precisou mudar — o benefício é automático via `GoogleDriveAppDataService`.
- Testes executados: `npx vitest run src/__tests__/services/GoogleDriveAppDataService.test.ts src/__tests__/services/FirebaseAuthService.test.ts --reporter=verbose` (12 passed: 9 + 3). `npm run lint` (limpo), `npx tsc --noEmit` (limpo), `npm test` (770 passed | 2 skipped, era 767), `npm run build` (limpo).
- Pendências: nenhuma.

---

## Phase 3: User Story 2 - Ícone de bookmark sincroniza inline (Priority: P1) 🎯 MVP (parte 2/2)

**Objetivo**: Na tela de Detalhes do Livro, o ícone de nuvem de um bookmark pendente/com erro fica tocável — o toque sincroniza todos os bookmarks pendentes daquele livro, reconectando o Drive primeiro se necessário (reaproveitando o mecanismo da US1).

**Independent Test**: Com um bookmark pendente/com erro visível na tela de Detalhes, tocar no ícone de nuvem, ver o estado "sincronizando", e confirmar que o ícone atualiza pro estado final sem sair da tela.

### Testes da Fase

- [X] T010 [P] [US2] Em `src/__tests__/screens/BookDetailsScreen.test.tsx`: trocar o mock de `useEntitlements` (hoje um objeto fixo com `isPro: false`) por uma função `vi.fn()` hoisted com esse mesmo default — preserva todos os testes existentes que dependem de `isPro: false`, e permite que os novos testes usem `mockReturnValueOnce`/`mockReturnValue` com `isPro: true`.
- [X] T011 [P] [US2] Novo teste: bookmark com `syncError` preenchido OU `syncedAt` vazio, usuário Pro → o ícone de nuvem é renderizado como elemento tocável (ex: `role="button"` com `onClick`).
- [X] T012 [P] [US2] Novo teste: bookmark com `syncedAt` preenchido e sem `syncError`, usuário Pro → o ícone continua aparecendo, mas **não** é tocável (sem handler de clique).
- [X] T013 [P] [US2] Novo teste: tocar no ícone tocável chama `setBookmarkDriveSyncStatus('pending-offline')` e depois `scheduleBookmarkDriveSync` (ambos mockados) com o `book.id` correto.
- [X] T014 [P] [US2] Novo teste: enquanto a promise de `scheduleBookmarkDriveSync` está pendente, o ícone mostra um `Spinner`/estado "sincronizando" em vez do ícone de nuvem; depois que a promise resolve, volta ao ícone normal (refletindo o novo `syncedAt`/`syncError` vindo do `useLiveQuery`).
- [X] T014a [P] [US2] Novo teste (FR-008/SC-004): tocar duas vezes rapidamente no mesmo ícone (segundo toque enquanto `syncingBookmarks` ainda é `true`) dispara `scheduleBookmarkDriveSync` só 1 vez — o segundo toque é ignorado pelo guard local, não pelo guard interno do serviço.

### Implementation

- [X] T015 [US2] Em `src/services/BookmarkDriveSyncService.ts`: mudar a assinatura de `scheduleBookmarkDriveSync` de `(bookId: number): void` pra `(bookId: number): Promise<void>` — os 3 `return` antecipados (bookId inválido, status `permission-error`, já em voo) passam a `return Promise.resolve()`, e o último caminho `return runScheduledBookmarkDriveSync(bookId)` (em vez de `void runScheduledBookmarkDriveSync(bookId)`). Nenhum call site existente precisou mudar (nenhum hoje usa `await`).
- [X] T016 [US2] Em `src/screens/BookDetailsScreen.tsx`: importado `scheduleBookmarkDriveSync`/`setBookmarkDriveSyncStatus`; estado local `syncingBookmarks` (`useState`) pro visual + `syncingBookmarksRef` (`useRef`) pro guard real (ver Registro da Fase); handler `handleSyncBookmarksTap` reseta o status e chama `scheduleBookmarkDriveSync(book.id)` dentro de `try/finally`. Ícone `CloudOff`/`Cloud` (cinza) vira `button` com esse handler (`stopPropagation`) só quando `bookmark.syncError` ou `!bookmark.syncedAt`; `syncingBookmarks` true renderiza `<Spinner size={13} tone="purple" />` no lugar; `Cloud` verde (já sincronizado, sem erro) continua sem wrapper de ação. 2 chaves i18n novas (`bookDetails.syncBookmarks`, 3 locales) pro aria-label.

**Critério de Conclusão**: Ícone de bookmark pendente/com erro é tocável; toque dispara sincronização de todos os bookmarks pendentes do livro, reconectando o Drive automaticamente via o mecanismo da US1 (incluindo abrir o seletor de conta se for a primeira conexão); estado "sincronizando" visível durante a operação; ícone já sincronizado permanece só informativo. `npm run lint && npm test && npx tsc --noEmit && npm run build` passam sem erro.

**Checkpoint**: MVP completo (US1 + US2 = as duas prioridades P1 da spec).

**Registro da Fase**:

- Status: Concluída
- Feito: `scheduleBookmarkDriveSync` retorna `Promise<void>`. `BookDetailsScreen.tsx` com ícone tocável + estado "sincronizando". Durante a T014a (teste de toque duplicado), um bug real apareceu: o guard original usava só o state `syncingBookmarks` — como `setState` é assíncrono/batched no React, 2 cliques na mesma tick (sem re-render entre eles) podiam ambos ler o state antigo (`false`) e escapar do guard, disparando 2 chamadas de sync. Corrigido inline (bloqueava a própria task): adicionado `syncingBookmarksRef` (`useRef`, mutado sincronamente) como guard real, mantendo o state só pro visual do spinner. Teste ajustado pra disparar os 2 cliques de propósito na mesma tick (sem `await` entre eles), confirmando que o ref pega o caso que o state sozinho não pegaria.
- Testes executados: `npx vitest run src/__tests__/screens/BookDetailsScreen.test.tsx --reporter=verbose` (23 passed, incluindo os 18 já existentes + 5 novos). `npm run lint` (limpo), `npx tsc --noEmit` (limpo), `npm test` (775 passed | 2 skipped, era 770), `npm run build` (limpo).
- Pendências: nenhuma.
- Feito:
- Testes executados:
- Pendências:

---

## Phase 4: User Story 3 - Renovação automática e ação manual continuam consistentes (Priority: P2)

**Objetivo**: Confirmar que os dois pontos de entrada (renovação automática da US1, ícone da US2, e o botão manual já existente em Configurações) refletem sempre o mesmo estado — sem implementação nova, já garantido estruturalmente por usarem os mesmos stores reativos.

**Independent Test**: Reconectar pelo ícone de um bookmark e verificar que Configurações > Sincronização na Nuvem já reflete "Conectado" sem nenhuma ação adicional nessa tela, e vice-versa.

**Nota**: Não há task de implementação nova aqui — `useBookmarkDriveSyncStatus`/`useProgressDriveSyncStatus`/`useVocabularyDriveSyncStatus` e os stores por trás deles (`BookmarkDriveSyncStatus.ts`, `DriveDataSyncStatus.ts`) já são compartilhados entre `SettingsSyncScreen.tsx` e qualquer outro consumidor — a US2 não criou um estado paralelo. Esta fase é só verificação.

### Testes da Fase

- [X] T017 [US3] Verificação manual via `quickstart.md` (Cenário 3): reconectar pelo ícone de bookmark, abrir Configurações > Sincronização na Nuvem, confirmar status "Conectado" sem ação adicional; repetir o inverso (reconectar em Configurações, conferir o ícone de um bookmark antes pendente). Documentar o resultado no Registro da Fase — sem esse teste manual, esta story não pode ser marcada `verified` (é o único jeito de comprovar a consistência ponta a ponta, já que os dois pontos de entrada vivem em telas diferentes).

**Critério de Conclusão**: Nenhuma inconsistência observada entre os dois pontos de entrada, confirmada tanto por inspeção de código (mesmos stores reativos, sem duplicação) quanto pelo cenário manual do quickstart.

**Checkpoint**: US3 comprovada.

**Registro da Fase**:

- Status: Concluída
- Feito: Confirmado por leitura direta do código que não há estado duplicado — `SettingsSyncScreen.tsx` consome `useBookmarkDriveSyncStatus`/`useProgressDriveSyncStatus`/`useVocabularyDriveSyncStatus`, que leem o mesmo store módulo-singleton (`BookmarkDriveSyncStatus.ts`/`DriveDataSyncStatus.ts`) que `BookDetailsScreen.tsx` (via `setBookmarkDriveSyncStatus`) e `scheduleBookmarkDriveSync` também usam — mesma referência de objeto em memória, não duas cópias. Confirmado ao vivo no device (junto com T018): usuário reconectou pelo ícone de bookmark e confirmou que Configurações > Sincronização na Nuvem já refletia "Conectado" sem ação adicional.
- Testes executados: nenhum automatizado novo (fase de verificação, não implementação) + validação manual no device.
- Pendências: nenhuma.

---

## Phase 5: Polish & Cross-Cutting Concerns

**Purpose**: Fechamento da feature — validação manual completa, checagem final.

- [X] T018 Rodar o cenário ponta a ponta de `sdd/specs/005-sync-drive-inline/quickstart.md` (Cenários 1, 2 e 3) num device Android real (`npm run android:run`) — o comportamento do seletor de conta Google só se comprova ao vivo. Usuário confirmou os 3 cenários funcionando ("funcionou os tres casos").
- [X] T019 Checagem final: `npm run lint && npm test && npx tsc --noEmit && npm run build` — todos limpos (775 passed, 2 skipped pré-existentes).

### Ad-hoc: espaçamento entre ícone de sync e botão de excluir bookmark

Achado pelo usuário durante o teste manual do Cenário 2 (T018): o ícone de sync (agora tocável nesta feature) e o X de excluir bookmark ficavam pequenos e próximos, com risco real de toque errado (excluir em vez de sincronizar).

- [X] T018a [Ad-hoc] Em `src/screens/BookDetailsScreen.tsx`: aumentar o espaço entre os dois elementos tocáveis (`gap-1` → `gap-4` no container `trailing` do bookmark) e igualar a área de toque do botão de sync à do botão de excluir (`p-1 -m-1` → `p-2 -m-2`, mesmo padding).

**Verificação**: `npx vitest run src/__tests__/screens/BookDetailsScreen.test.tsx` (23 passed, sem regressão — mudança é só de classe CSS/padding, não de comportamento). `npm run lint && npx tsc --noEmit && npm run build` limpos.

### Checklist de Release

- [X] Fase 2 (US1) concluída — renovação silenciosa testada
- [X] Fase 3 (US2) concluída — ícone de bookmark inline testado
- [X] Fase 4 (US3) concluída — consistência verificada manualmente no device
- [X] `quickstart.md` executado com sucesso no device Android (T018), incluindo o ajuste de UX pós-teste (T018a)
- [X] `npm run lint && npm test && npx tsc --noEmit && npm run build` limpos
- [X] Nenhuma dependência nova adicionada a `package.json`

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: sem dependências
- **Fase 2 (US1)**: depende do Setup — bloqueia a Fase 3 (US2 chama o mecanismo de retry da US1 pra entregar o valor completo, mesmo que o código em si pudesse ser escrito em paralelo)
- **Fase 3 (US2)**: depende da Fase 2 completa (mecanismo de renovação já testado e funcionando)
- **Fase 4 (US3)**: depende das Fases 2 e 3 completas (só verifica o que já foi implementado)
- **Polish (Fase 5)**: depende de todas as fases anteriores completas

### Parallel Opportunities

- Todas as tasks `[P]` de teste dentro da Fase 2 (T002-T007) podem rodar em paralelo entre si — arquivos diferentes ou blocos independentes no mesmo arquivo de teste.
- Todas as tasks `[P]` de teste dentro da Fase 3 (T010-T014) podem rodar em paralelo entre si.
- T008 e T009 (Fase 2) tocam arquivos diferentes (`GoogleDriveAppDataService.ts` vs `FirebaseAuthService.ts`) — podem ser feitas em paralelo entre si, mas ambas depois dos testes correspondentes existirem.

---

## Implementation Strategy

### MVP First (Fases 2+3)

1. Completar Fase 1: Setup
2. Completar Fase 2: US1 — mecanismo de renovação silenciosa, testado isoladamente
3. Completar Fase 3: US2 — ícone de bookmark, consumindo o mecanismo da Fase 2
4. **PARAR E VALIDAR**: rodar Cenários 1 e 2 do `quickstart.md` no device

### Incremental Delivery

1. Setup → baseline confirmado
2. US1 → mecanismo pronto, já beneficia bookmark/progress/vocabulary sem UI nova
3. US2 → ponto de entrada visível no ícone de bookmark → MVP completo
4. US3 → verificação de consistência, sem código novo
5. Polish → validação manual completa no device + release

## Notes

- `[P]` = arquivos diferentes ou blocos independentes, sem dependência
- `[Story]` mapeia a task pra uma user story específica
- Commitar após cada task ou grupo lógico coerente
- Parar em qualquer checkpoint pra validar a story isoladamente
- R-001/R-002 (`plan.md`): as tasks T002 e T010 existem especificamente pra
  neutralizar esses dois riscos antes de qualquer lógica nova ser
  adicionada — não pular ou adiar.

<!-- sdd-converge anexa "## Phase N: Convergence" abaixo desta linha -->
