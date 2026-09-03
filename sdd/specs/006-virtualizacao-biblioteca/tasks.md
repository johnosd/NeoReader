---
description: "Tasks de implementação — Virtualização da tela de Biblioteca (grid e lista)"
---

# Tasks: Virtualização da tela de Biblioteca (grid e lista)

**Input**: Documentos de design de `sdd/specs/006-virtualizacao-biblioteca/`

**Prerequisites**: `plan.md`, `spec.md`, `research.md` (decisões de lib/unidade
de virtualização/cache de scroll), `quickstart.md` (verificação manual final)

**Organization**: Tasks agrupadas por user story pra permitir implementação e
teste independentes de cada uma. US1 (lista) é P1/MVP; US2 (grid) é P2.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Pode rodar em paralelo (arquivos diferentes, sem dependência)
- **[Story]**: A qual user story esta task pertence (US1, US2)
- Incluir caminhos de arquivo exatos nas descrições

## Path Conventions

- Hooks novos: `src/hooks/`
- Tela/componentes modificados: `src/screens/LibraryScreen.tsx`,
  `src/components/LibraryGridView.tsx`
- Testes espelhando `src/`: `src/__tests__/hooks/`, `src/__tests__/screens/`,
  `src/__tests__/components/`
- Ambiente de teste: `src/__tests__/setup.ts`

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Instalar a dependência aprovada e preparar o ambiente de teste
antes de qualquer código de produção.

- [X] T001 Instalar `@tanstack/react-virtual@^3.14.10` (`npm install @tanstack/react-virtual@^3.14.10`) — atualiza `package.json`/`package-lock.json` (dependência aprovada pelo usuário, ver `research.md` Decisão 1)
- [X] T002 Confirmar baseline antes de mexer em código: rodar `npm run lint && npm test && npx tsc --noEmit && npm run build`, anotar contagem de testes atual em `plan.md` → `Estado Atual`

**Checkpoint**: Dependência instalada, baseline verde confirmado.

**Registro da Fase**:

- Status: Concluído
- Feito: `@tanstack/react-virtual@^3.14.10` instalado (2 pacotes, diff limpo — 1 linha em `package.json`, 28 em `package-lock.json`). Baseline confirmado antes de qualquer mudança de código de produção.
- Testes executados: `npm run lint` (limpo) · `npm test` (775 passed, 2 skipped, 106 arquivos) · `npx tsc --noEmit` (sem erros) · `npm run build` (sem erros, warnings pré-existentes de chunk size).
- Pendências: nenhuma.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Os 2 hooks compartilhados por lista (US1) e grid (US2) —
nenhuma user story pode começar antes disso, já que ambas os usam.

**⚠️ CRITICAL**: Nenhuma user story pode começar antes desta fase terminar.

### Testes da Fase

- [X] T003 [P] Stub de `ResizeObserver` (no-op: `observe`/`unobserve`/`disconnect`) em `src/__tests__/setup.ts` — sem isso, `measureElement` do TanStack Virtual quebra em jsdom (R-001 do plan.md)

### Implementation

- [X] T004 [P] Criar `src/hooks/useWindowVirtualList.ts` — wrapper fino sobre `useWindowVirtualizer` (`@tanstack/react-virtual`): recebe `count`, `estimateSize(index)`, `overscan?`; retorna o `virtualizer` e um `ref` pro elemento container (usado pra calcular `scrollMargin` via `offsetTop`, lido a cada render — comentário curto explicando por quê, ver Decisões Invariantes do `plan.md`)
- [X] T005 [P] Criar `src/hooks/useLibraryScrollRestore.ts` — cache module-level (variável fora do componente) de posição de scroll, chaveado por `viewMode` + assinatura de (`activeFilter`, `search`, `sort`); expõe algo como `useLibraryScrollRestore({ viewMode, activeFilter, search, sort })` que: (a) no mount, restaura a posição salva pra assinatura atual (ou fica no topo se não houver); (b) quando a assinatura muda em runtime (não no primeiro mount), força `window.scrollTo(0, 0)` e descarta a entrada antiga do cache; (c) salva a posição atual (throttled) enquanto o usuário rola. Comentário curto explicando por que é module-level e não `useState`/`localStorage` (App.tsx desmonta a tela ao navegar — ver `research.md` Decisão 4)

### Testes da Fase (dos hooks)

- [X] T006 [P] `src/__tests__/hooks/useLibraryScrollRestore.test.ts` (novo): assinatura igual entre unmount/remount → posição restaurada; assinatura diferente → scroll ao topo e cache antigo descartado; `viewMode` diferentes têm caches independentes
- [X] T007 [P] `src/__tests__/hooks/useWindowVirtualList.test.ts` (novo): com `count` grande (ex: 500) e `estimateSize` fixo, o número de itens virtuais retornados (`virtualizer.getVirtualItems().length`) é uma fração pequena de `count` (usa `window.innerHeight` real do jsdom, não depende de layout medido)

**Critério de Conclusão**: os 2 hooks existem, compilam, e têm testes
próprios passando — ainda não estão plugados em `LibraryScreen.tsx`/
`LibraryGridView.tsx` (isso é das próximas fases).

**Checkpoint**: Fundação pronta — user stories podem começar.

**Registro da Fase**:

- Status: Concluído
- Feito: stub de `ResizeObserver` em `setup.ts`; `useWindowVirtualList.ts` e `useLibraryScrollRestore.ts` criados. Desvio técnico (registrado como R-004 em `plan.md`): o padrão original de `scrollMargin` (ler `ref.current` direto no render, ou `setState` síncrono num effect) viola as regras `react-hooks/refs`/`react-hooks/set-state-in-effect` do `eslint-plugin-react-hooks@7` deste projeto — corrigido com `ResizeObserver` no `document.body` atualizando `scrollMargin` só dentro do callback.
- Testes executados: `npx vitest run src/__tests__/hooks/useLibraryScrollRestore.test.ts src/__tests__/hooks/useWindowVirtualList.test.ts` (6/6 passed) · `npm run lint` (limpo) · `npx tsc --noEmit` (sem erros).
- Pendências: nenhuma.

---

## Phase 3: User Story 1 - Rolar a Biblioteca em modo lista sem travar (Priority: P1) 🎯 MVP

**Objetivo**: `LibraryScreen.tsx` no modo lista renderiza só os itens
visíveis (+ margem) no DOM, independentemente do total de livros, mantendo o
scroll de página inteira e as regras de preservar/resetar posição.

**Independent Test**: Mockar `useLibraryCatalog` retornando uma lista grande
(ex: 500 livros fictícios), renderizar `LibraryScreen` em modo lista, e
confirmar que o número de `LibraryBookRow` no DOM é bem menor que 500 —
entrega valor mesmo que US2 (grid) ainda não esteja implementada, já que
lista é o `viewMode` padrão.

### Testes da Fase

- [X] T008 [P] [US1] Em `src/__tests__/screens/LibraryScreen.test.tsx`: mockar `useLibraryCatalog` com uma lista grande (ex: 500 `LibraryBook` fictícios) e modo lista ativo; assert que o número de linhas renderizadas no DOM é uma fração pequena do total
- [X] T008a [P] [US1] Em `src/__tests__/screens/LibraryScreen.test.tsx`: mockar `useLibraryCatalog` com uma lista pequena (ex: 3-5 `LibraryBook` fictícios, menor que a margem de overscan) e modo lista ativo; assert que **todos** os livros aparecem renderizados normalmente, sem overhead nem diferença de comportamento vs. hoje — cobre FR-006 (achado F1 do Analyze do `sdd-plan`)
- [X] T008b [P] [US1] Em `src/__tests__/screens/LibraryScreen.test.tsx`: com a mesma lista grande mockada de T008, mockar `toggleFavorite` de `@/db/books` e clicar no botão de favorito de uma linha renderizada dentro da janela virtualizada; assert que `toggleFavorite` é chamado com o `id` correto do livro — cobre FR-005 (achado F2 do Analyze do `sdd-plan`; posicionamento absoluto é justo o tipo de mudança que pode quebrar área de toque/z-index em silêncio)
- [X] T008c [P] [US1] Em `src/__tests__/screens/LibraryScreen.test.tsx`: inspecionar o elemento container da lista virtualizada e assert que ele **não** define `overflow: auto`/`overflow: scroll` nem uma altura fixa de viewport (só `height` calculado a partir de `virtualizer.getTotalSize()`) — reforça FR-002 (achado F3 do Analyze do `sdd-plan`), complementar à verificação manual do `quickstart.md` passo 4.1
- [X] T009 [US1] Em `src/__tests__/screens/LibraryScreen.test.tsx`: mudar `activeFilter`/`search`/`sort` (via os setters mockados de `useLibraryCatalog`) e confirmar que `window.scrollTo` é chamado pro topo (espionar/mockar `window.scrollTo`)
- [X] T010 [US1] Em `src/__tests__/hooks/useLibraryScrollRestore.test.ts` (já criado em T006) ou em `LibraryScreen.test.tsx`: confirmar que desmontar e remontar `LibraryScreen` com a mesma assinatura de filtro/busca/ordenação restaura a posição de scroll salva antes do desmonte

### Implementation

- [X] T011 [US1] Em `src/screens/LibraryScreen.tsx`: trocar o `.map` direto de `LibraryBookRow` (bloco `viewMode === 'list'`, linhas ~533-545 hoje) por renderização virtualizada via `useWindowVirtualList` — container com `position: relative` e altura = `virtualizer.getTotalSize()`; cada `LibraryBookRow` envolvido num wrapper `position: absolute`, `transform: translateY(...)`, `ref={virtualizer.measureElement}`, `data-index={virtualItem.index}`
- [X] T012 [US1] Em `src/screens/LibraryScreen.tsx`: plugar `useLibraryScrollRestore` com `{ viewMode, activeFilter, search, sort }` — como `viewMode` já é um dos parâmetros da assinatura de cache, esta única chamada cobre lista **e** grid (US2) sem precisar de nenhuma chamada equivalente em `LibraryGridView.tsx`; verificado pela Fase 4 (T015), não repetido como task de implementação lá
- [X] T013 [US1] Calibrar `estimateSize` do virtualizador de lista com um valor próximo da altura real de `LibraryBookRow` (referência: cover `h-[92px]` + paddings/margens do layout atual) — só serve de estimativa inicial, `measureElement` corrige o resto

**Critério de Conclusão**: com uma biblioteca grande, o modo lista rola do
topo ao fim sem crescer o número de nós no DOM proporcionalmente ao total;
visualmente idêntico ao comportamento atual de cada `LibraryBookRow`
(capa, progresso, tags, favorito, menu de opções); scroll preservado ao
voltar de um livro e resetado ao topo quando filtro/busca/ordenação mudam;
com uma biblioteca pequena, todos os livros aparecem normalmente sem
diferença de comportamento (FR-001 a FR-004 e FR-006 cobertos pra este
modo).

**Checkpoint**: User Story 1 funcional e testável isoladamente — pode virar
MVP mesmo sem US2.

**Registro da Fase**:

- Status: Concluído
- Feito: modo lista de `LibraryScreen.tsx` virtualizado via `VirtualizedLibraryList` (novo componente interno, usa `useWindowVirtualList`); `useLibraryScrollRestore` plugado (cobre lista e grid); `estimateSize` calibrado em 148px. Achado grave durante os testes (registrado como R-005 em `plan.md`): `measureElement` do TanStack Virtual usa `offsetHeight`/`offsetWidth` (não `getBoundingClientRect`, como o research.md original assumia) — em jsdom isso mede tudo como 0px e o cálculo da janela visível entra num loop instável (chegou a renderizar 256/500 linhas, começando no índice 244). Corrigido com um helper de teste escopado (`src/__tests__/testUtils/domMeasurements.ts`), não um patch global.
- Testes executados: `npx vitest run src/__tests__/screens/LibraryScreen.test.tsx` (7/7 passed) · `npm test` completo (787 passed, 2 skipped — sem regressão nos outros 108 arquivos) · `npm run lint` (limpo) · `npx tsc --noEmit` (sem erros) · `npm run build` (sem erros).
- Pendências: nenhuma.

---

## Phase 4: User Story 2 - Rolar a Biblioteca em modo grid sem travar (Priority: P2)

**Objetivo**: `LibraryGridView.tsx` renderiza só as linhas de cards visíveis
(+ margem) no DOM, com as mesmas regras de scroll de página inteira e
preservar/resetar posição da US1.

**Independent Test**: Mockar a mesma lista grande de livros, alternar pro
modo grid, e confirmar DOM limitado (cards renderizados << total) — entrega
valor incremental sobre a US1, reaproveitando os mesmos 2 hooks
(`useWindowVirtualList`, `useLibraryScrollRestore`).

### Testes da Fase

- [X] T014 [P] [US2] Criar `src/__tests__/components/LibraryGridView.test.tsx`: mockar/passar uma lista grande de `LibraryBook` fictícios, renderizar `LibraryGridView`, assert que o número de `GridBookCard` no DOM é uma fração pequena do total
- [X] T015 [US2] Em `src/__tests__/screens/LibraryScreen.test.tsx`: alternar `viewMode` pra `'grid'` e confirmar que a assinatura de cache de scroll usada é distinta da do modo lista (reaproveitando o comportamento já coberto por `useLibraryScrollRestore.test.ts`, aqui só a integração)

### Implementation

- [X] T016 [US2] Em `src/components/LibraryGridView.tsx`: agrupar `books` em linhas de até 3 (`chunk(books, 3)`) e virtualizar por linha via `useWindowVirtualList`, renderizando cada linha com o mesmo grid CSS de 3 colunas/gap 2px já existente
- [X] T017 [US2] Calcular `estimateSize` da linha a partir da largura disponível do container (aspect-ratio `2 / 3` dos cards, como hoje) — estimativa inicial via `window.innerWidth`/medição do container, corrigida por `measureElement`

*(Sem task de implementação separada pra plugar `useLibraryScrollRestore` no
grid — T012, na Fase 3, já cobre os dois modos via o parâmetro `viewMode`;
T015 abaixo só verifica isso.)*

**Critério de Conclusão**: com uma biblioteca grande, o modo grid rola do
topo ao fim sem crescer o número de nós no DOM proporcionalmente ao total;
visualmente idêntico ao grid atual (3 colunas, gap 2px, aspect-ratio 2/3,
barra de progresso); regras de scroll consistentes com a US1.

**Checkpoint**: User Story 2 funcional e testável isoladamente, consistente
com as regras de scroll da User Story 1.

**Registro da Fase**:

- Status: Concluído
- Feito: `LibraryGridView.tsx` virtualizado por linha (`chunkIntoRows`, grupos de 3) via `useWindowVirtualList`; `estimateSize` calculado a partir de `window.innerWidth` (aspect-ratio 2/3). Nenhuma task de implementação nova pro scroll-restore (já coberto por T012/Fase 3).
- Testes executados: `npx vitest run src/__tests__/screens/LibraryScreen.test.tsx src/__tests__/components/LibraryGridView.test.tsx` (10/10 passed) · `npm test` completo (790 passed, 2 skipped) · `npm run lint` (limpo) · `npx tsc --noEmit` (sem erros) · `npm run build` (sem erros). Reaproveitado o helper `mockElementDimensions` (R-005) em `LibraryGridView.test.tsx`.
- Pendências: nenhuma.

---

## Phase 5: Polish & Cross-Cutting Concerns

**Purpose**: Validação final ponta a ponta e checagens cross-cutting da
constitution.

- [X] T018 Rodar `quickstart.md` completo — passos 1-4 executados via Playwright MCP (conectado ao Chrome do usuário, login real feito manualmente por ele) contra 300-1200 livros sintéticos: DOM limitado confirmado (10-21 elementos renderizados, não milhares), scroll de página inteira confirmado, screenshots visuais sem regressão nos dois modos, preservar/resetar scroll confirmado nos dois sentidos. **2 bugs reais encontrados e corrigidos** só visíveis num browser de verdade (ver R-006/R-007 em `plan.md`) — nenhum teste jsdom cobria a troca lista↔grid já montada. Passo 5 (device Android real, `SM-S911B`, `npm run android:run`) validado pelo usuário: app funcionando, único ponto notado foi capas em pop-in durante scroll rápido ("fling") — confirmado pelo usuário como exatamente o edge case já aceito na spec (placeholder breve antes da capa carregar, sem quebra), não uma regressão. Nenhuma ação adicional necessária.
- [X] T019 Revisar os comentários curtos exigidos pelo Constitution Check (`plan.md`): `scrollMargin` dinâmico em `useWindowVirtualList`, cache module-level em `useLibraryScrollRestore`, stub de `ResizeObserver` em `setup.ts`, virtualização por linha (não por card) no grid
- [X] T020 Checagens finais: `npm run lint && npm test && npx tsc --noEmit && npm run build`

### Checklist de Release

<!--
  Itens marcados pelo sdd-execute conforme cada fase fecha, mais gates
  cross-cutting da feature.
-->

- [X] Fase 3 (User Story 1) concluída
- [X] Fase 4 (User Story 2) concluída
- [X] `npm run lint` limpo
- [X] `npm test` sem regressão
- [X] `npx tsc --noEmit` sem erros
- [X] `npm run build` sem erros
- [X] `quickstart.md` executado com sucesso — navegador via Playwright MCP (passos 1-4, 2 bugs achados e corrigidos: R-006/R-007) e device Android real `SM-S911B` (passo 5, validado pelo usuário — pop-in de capas em fling confirmado como edge case já aceito na spec, não regressão)

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: sem dependências
- **Foundational (Phase 2)**: depende do Setup — BLOQUEIA as duas user stories (ambas usam `useWindowVirtualList` e `useLibraryScrollRestore`)
- **User Story 1 (Phase 3)**: depende do Foundational; pode fechar como MVP sozinha
- **User Story 2 (Phase 4)**: depende do Foundational; não depende de US1 estar "fechada" (arquivo diferente), mas reaproveita o mesmo `useLibraryScrollRestore` já plugado em `LibraryScreen.tsx` por T012 — na prática, faz mais sentido rodar depois de T011/T012
- **Polish (Phase 5)**: depende de US1 e US2 (se ambas forem entregues nesta rodada) estarem completas

### Parallel Opportunities

- T003 (setup.ts) e T004/T005 (hooks) podem rodar em paralelo — arquivos diferentes
- T006 e T007 (testes dos 2 hooks) podem rodar em paralelo entre si
- T008 (teste de DOM limitado da lista) pode ser escrito em paralelo a T004/T005, já que testa o comportamento final, não os hooks isolados
- T014 (teste de DOM limitado do grid) pode rodar em paralelo às tasks da Fase 3, já que toca um arquivo diferente (`LibraryGridView.tsx`/seu teste)

---

## Parallel Example: Foundational (Phase 2)

```bash
# T003, T004 e T005 tocam arquivos diferentes — podem rodar juntas
Task: "T003 Stub de ResizeObserver em src/__tests__/setup.ts"
Task: "T004 [P] Criar src/hooks/useWindowVirtualList.ts"
Task: "T005 [P] Criar src/hooks/useLibraryScrollRestore.ts"
```

---

## Implementation Strategy

### MVP First (User Story 1 apenas)

1. Completar Fase 1: Setup (instalar dependência, baseline verde)
2. Completar Fase 2: Foundational (os 2 hooks compartilhados, testados isoladamente)
3. Completar Fase 3: User Story 1 (lista virtualizada)
4. **PARAR E VALIDAR**: rodar `quickstart.md` passos 1-4 no modo lista, confirmar DOM limitado e regras de scroll antes de seguir pro grid

### Incremental Delivery

1. Setup + Foundational → fundação pronta
2. User Story 1 (lista) → testar isoladamente → considerar entrega (MVP, já que lista é o modo padrão)
3. User Story 2 (grid) → testar isoladamente → entrega completa da feature
4. Polish → `quickstart.md` completo (navegador + device Android) + checagens finais

## Notes

- `[P]` = arquivos diferentes, sem dependência
- `[Story]` mapeia a task pra uma user story específica (US1, US2)
- Commitar após cada task ou grupo lógico coerente
- Parar em qualquer checkpoint pra validar a story isoladamente
- Nenhuma task desta lista deve introduzir mudança visual perceptível em
  `LibraryBookRow`/`GridBookCard` — a feature é sobre *como* renderizar,
  não *o quê* (FR-005)

<!-- sdd-converge anexa "## Phase N: Convergence" abaixo desta linha -->
