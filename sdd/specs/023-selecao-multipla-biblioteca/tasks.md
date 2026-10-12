---
description: "Lista de tasks da feature 023 — seleção múltipla na biblioteca com ações em lote"
---

# Tasks: Seleção múltipla na biblioteca com ações em lote

**Input**: Documentos de design de `sdd/specs/023-selecao-multipla-biblioteca/`

**Prerequisites**: plan.md (obrigatório), spec.md (obrigatório para user stories), quickstart.md

**Organization**: Tasks agrupadas por user story pra permitir implementação e teste independentes de cada uma.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Pode rodar em paralelo (arquivos diferentes, sem dependência)
- **[Story]**: A qual user story esta task pertence (ex: US1, US2)
- Incluir caminhos de arquivo exatos nas descrições

## Path Conventions

- Projeto único React + Capacitor. Código em `src/`, imports via alias `@/`.
- Telas em `src/screens/`, componentes em `src/components/`, hooks em `src/hooks/`, repositórios Dexie em `src/db/`, textos em `src/i18n/messages.ts` (objetos `ptBRMessages`, `enMessages`, `esMessages`).
- Testes em `src/__tests__/` espelhando `src/`, importando `describe`/`it`/`expect`/`vi` de `'vitest'` explicitamente.

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: nenhum setup necessário. Sem dependência nova, sem mudança de schema e sem config (plan.md, Constitution Check V).

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: hooks de gesto e de seleção, mais os textos base, usados por todas as stories.

**⚠️ CRITICAL**: Nenhuma user story pode começar antes desta fase terminar.

### Implementation

- [X] T001 [P] Criar `src/hooks/useLongPress.ts` (D-02):
  - Recebe `onLongPress` e `onClick` e devolve handlers `onPointerDown`/`onPointerMove`/`onPointerUp`/`onPointerCancel`/`onPointerLeave`/`onContextMenu`/`onClick`.
  - Timer de 500 ms, cancelado por movimento acima de 10 px, `pointercancel`, `pointerup` ou `pointerleave`.
  - `contextmenu` com `preventDefault`.
  - O click que segue um long-press disparado é engolido, para não abrir o livro ao soltar o dedo.
  - Comentar o porquê da tolerância de movimento (scroll) e da supressão do click.
- [X] T002 [P] Criar `src/hooks/useLibrarySelection.ts` (D-01, D-03):
  - Expõe `selectedIds: Set<number>`, `isSelecting` (`size > 0`), `start(id)`, `toggle(id)`, `clear()`.
  - Um efeito poda os ids que não estão mais em `books` (edge case "biblioteca muda por fora").
  - Comentar que o `Set` é recriado a cada mudança para o React detectar a atualização.
- [X] T003 [P] Adicionar em `src/i18n/messages.ts`, nos 3 idiomas, as chaves base da seleção:
  - `library.selection.count.one` / `.many`
  - `library.selection.exit`
  - `library.selection.actions`
  - `library.selection.select` e `library.selection.deselect` (aria-label por livro, com `{title}`)

### Testes da Fase

- [X] T004 [P] `src/__tests__/hooks/useLongPress.test.tsx` com fake timers:
  - Dispara após 500 ms.
  - Não dispara com movimento acima de 10 px nem com `pointercancel`.
  - O click após o disparo não chama `onClick`, e o click curto chama.
  - `contextmenu` recebe `preventDefault`.
- [X] T005 [P] `src/__tests__/hooks/useLibrarySelection.test.ts`:
  - `start`, `toggle` (marca e desmarca) e `clear`.
  - Desmarcar o último deixa `isSelecting` falso.
  - A poda remove os ids ausentes de `books`.

**Critério de Conclusão**: os dois hooks existem com testes verdes, as chaves base existem em pt-BR/en/es, e lint, tipos e build passam. Nada visível muda ainda na tela.

**Checkpoint**: Fundação pronta - user stories podem começar.

**Registro da Fase**:

- Status: Concluída (2026-10-12).
- Feito:
  - `src/hooks/useLongPress.ts`: timer de 500 ms, tolerância de 10 px, cancela em `pointerup`/`pointercancel`/`pointerleave`, ignora botão ≠ 0 e faz `preventDefault` no `contextmenu`.
  - **Desvio da descrição do T001**: o hook não recebe `onClick`. Ele devolve `onClickCapture`, que corta na fase de captura o click que segue um long-press, e cada componente mantém o próprio `onClick`. Assim a supressão também cobre botões internos da linha da lista ("⋯", tags, favorito) sem o hook conhecer cada um. O flag de "disparou" é zerado no próximo `pointerdown`, para que soltar o dedo fora do elemento não engula o toque seguinte.
  - `src/hooks/useLibrarySelection.ts`: a poda de ids ausentes é **derivada** (`useMemo` com interseção), sem efeito. A referência do `Set` se mantém quando nada é podado.
  - 6 chaves `library.selection.*` (actions, count.one/many, select, deselect, exit) em `src/i18n/messages.ts`, nos 3 idiomas, com acentuação correta.
- Testes executados:
  - `npx vitest run src/__tests__/hooks/useLongPress.test.tsx src/__tests__/hooks/useLibrarySelection.test.ts`: 18/18 verdes na primeira iteração. O arquivo de teste do long-press é `.tsx` (renderiza um componente) em vez do `.ts` previsto.
  - `npm run lint`: limpo.
  - `npx tsc --noEmit -p tsconfig.app.json`: exit 0.
  - `npm test`: 157 arquivos passaram e 2 foram pulados; 1651 testes passaram e 2 foram pulados.
  - `npm run build`: ok (5.78 s; só os avisos de chunk size e de plugin timings que já existiam).
- Pendências: nenhuma. Nada visível muda na tela até a Fase 3.

---

## Phase 3: User Story 1 - Selecionar vários livros e excluí-los de uma vez (Priority: P1) 🎯 MVP

**Objetivo**: modo de seleção completo na lista e na grade (entrar, marcar, desmarcar, sair por X, back e último desmarcado), com a ação de excluir em lote com confirmação.

**Independent Test**: com 5 livros, segurar um, tocar em mais 2, excluir e confirmar. Sobram 2 livros, e os 3 excluídos não deixam progresso, marcadores nem arquivo local.

### Implementation

- [X] T006 [P] [US1] Em `src/db/books.ts`, adicionar `deleteBooks(ids: number[]): Promise<{ succeeded: number; failed: number }>` (D-06). Laço sequencial sobre `deleteBook(id)` com try/catch por livro: uma falha conta e o laço segue.
- [X] T007 [P] [US1] Criar `src/components/LibrarySelectionBar.tsx` (D-05):
  - Botão X (`aria-label` `library.selection.exit`), contador pluralizado e botão "Ações" (abre a folha).
  - Ocupa o lugar do `<header>` com os tokens de cor do design system e mantém o `pt-10` do header atual para não pular o layout.
- [X] T008 [P] [US1] Criar `src/components/BulkBookActionsSheet.tsx`, só com a ação **Excluir** nesta fase:
  - `BottomSheet` com `ActionRow` no mesmo visual da `QuickBookActionsSheet`.
  - A confirmação inline mostra "Excluir N livros?" e o aviso de dados associados (FR-008).
  - Spinner e ações desabilitadas enquanto roda (edge case "seleção grande").
  - Props: `books: LibraryBook[]` (os selecionados), `open`, `onClose`, `onDone(result)`.
  - Cancelar volta ao estado anterior sem apagar.
- [X] T009 [US1] Em `src/components/LibraryGridView.tsx`:
  - Novas props `selectedIds: Set<number>`, `onLongPressBook(book)`, `onToggleBook(book)`.
  - O `GridBookCard` usa `useLongPress`. Com seleção ativa, o click alterna em vez de abrir (D-04).
  - Marcação visual: anel `purple-primary`, check no canto e escurecimento leve, com `aria-pressed` e o `aria-label` de seleção.
  - Classes `select-none [-webkit-touch-callout:none]` (R-001).
- [X] T010 [US1] Em `src/screens/LibraryScreen.tsx`, nos componentes `VirtualizedLibraryList`/`LibraryBookRow`:
  - Mesmas props de seleção da grade.
  - `useLongPress` no `<article>`.
  - Com seleção ativa, botão de cobertura `absolute inset-0` com `aria-pressed`, que bloqueia "⋯", tags e favorito internos (D-04). Comentar o porquê.
  - Marcação visual da linha.
  - `select-none [-webkit-touch-callout:none]`.
- [X] T011 [US1] Em `src/screens/LibraryScreen.tsx`, ligar `useLibrarySelection(books)`:
  - Renderizar `LibrarySelectionBar` no lugar do `<header>` quando `isSelecting`.
  - Passar a seleção para a grade e a lista.
  - Abrir `BulkBookActionsSheet` com os livros selecionados.
  - Em `useCapacitorBackButton`, a folha de lote aberta fecha primeiro; depois, a seleção ativa faz `clear()` (FR-006).
  - Estado `bulkResult` com `Toast` (sucesso, ou `warning` em falha parcial); `clear()` após `onDone` (FR-012, FR-013).
- [X] T012 [P] [US1] Adicionar em `src/i18n/messages.ts` (pt-BR/en/es) as chaves de exclusão em lote:
  - `bulkActions.title`
  - `bulkActions.delete.title`
  - `bulkActions.delete.confirm.one` / `.many`
  - `bulkActions.delete.warning`
  - `bulkActions.delete.done.one` / `.many`
  - `bulkActions.partialFailure` (com `{failed}` / `{total}`)

### Testes da Fase

- [X] T013 [P] [US1] `src/__tests__/db/books.bulk.test.ts`, com `deleteBook` mockado:
  - `deleteBooks` chama a função uma vez por id, em ordem.
  - Uma falha no meio não interrompe o laço, e o retorno conta `succeeded`/`failed`.
- [X] T014 [P] [US1] `src/__tests__/components/BulkBookActionsSheet.test.tsx`:
  - Excluir abre a confirmação com contagem (1 e N).
  - Cancelar não chama `deleteBooks`.
  - Confirmar chama a função com os ids e repassa o resultado a `onDone`.
- [X] T015 [P] [US1] Ampliar `src/__tests__/components/LibraryGridView.test.tsx`:
  - Com `selectedIds` não vazio, o click chama `onToggleBook` e não `onOpenBook`.
  - Os itens marcados têm `aria-pressed="true"`.
  - Sem seleção, o click continua chamando `onOpenBook` (FR-002).
- [X] T016 [US1] Ampliar `src/__tests__/screens/LibraryScreen.test.tsx`:
  - O long-press (pointerdown + avanço dos timers) troca o cabeçalho pela barra com "1 selecionado".
  - Toque em outro livro dá "2 selecionados" e não chama `onOpenBook`.
  - O X sai e o cabeçalho volta.
  - O back do Capacitor sai do modo e não chama `onOpenHome`.
  - Desmarcar o último sai do modo.
- [ ] T017 [US1] Validar no device os passos 2, 3 e 5 do `quickstart.md` (gesto, R-001, e arquivo `local` removido, SC-004).

**Critério de Conclusão**:
- Na lista e na grade, o long-press entra no modo e os toques alternam a marcação.
- O X, o back e o último desmarcado saem do modo.
- Excluir pede confirmação com contagem e apaga como a exclusão individual (inclusive o arquivo local), e o toast informa o resultado (inclusive falha parcial).
- Fora do modo, nada mudou.
- Testes, lint, tipos e build verdes, e o gesto validado no device sem conflito com scroll nem menu de contexto.

**Checkpoint**: User Story 1 funcional e testável isoladamente.

**Registro da Fase**:

- Status: Implementada e testada em jsdom (2026-10-12). **Aberta apenas a T017** (validação do gesto no device): não havia device conectado (`adb devices` vazio). A fase só fecha de verdade depois dela.
- Feito:
  - `deleteBooks(ids)` em `src/db/books.ts`: laço sequencial sobre `deleteBook`, devolve `{ succeeded, failed }`.
  - `LibrarySelectionBar` e `SelectionCheck` novos; `BulkBookActionsSheet` só com Excluir (confirmação com contagem, aviso de dados, spinner, falha parcial).
  - Grade (`LibraryGridView`) e lista (`LibraryBookRow`) com long-press, marcação visual, `aria-pressed` e `aria-label`; na lista, um botão `absolute inset-0` cobre a linha em modo de seleção.
  - Fiação na `LibraryScreen`: barra, cabeçalho `inert`, voltar do Android, toast de resultado.
  - **Desvios do plano** (registrados em `plan.md`, R-007/R-008): (a) a barra é `fixed` sobre o cabeçalho, que fica no DOM `invisible` e `inert`, em vez de ser trocado, para a lista não pular debaixo do dedo e a barra seguir visível ao rolar; (b) long-press e toque usam a mesma ação `toggle` (um toque lento em modo ativo não "some"), então `start` saiu de `useLibrarySelection`; (c) a chave de falha parcial é `bulkActions.delete.partialFailure`, não `bulkActions.partialFailure`, porque só a exclusão pode falhar parcialmente.
- Testes executados:
  - `npx vitest run src/__tests__/db/books.bulk.test.ts src/__tests__/components/BulkBookActionsSheet.test.tsx src/__tests__/components/LibraryGridView.test.tsx src/__tests__/screens/LibraryScreen.test.tsx`: 35 testes; 1 falhou na primeira rodada (teste da grade na tela buscava o card pelo nome, mas sem capa não há `alt`) e foi corrigido na 2ª iteração.
  - `npm run lint`: 1 erro na primeira rodada (parâmetro `_id` sem uso no teste de DB), corrigido; depois limpo.
  - `npx tsc --noEmit -p tsconfig.app.json`: exit 0.
  - `npm test`: 159 arquivos ✓, 2 pulados; 1674 testes ✓, 2 pulados.
  - `npm run build`: ok.
- Pendências: T017 (device). Rodar `quickstart.md` passos 2, 3 e 5 num celular real: scroll × long-press, menu de contexto/callout, não abrir ao soltar, voltar do Android e arquivo `local` removido.

---

## Phase 4: User Story 2 - Mover vários livros para uma coleção (Priority: P2)

**Objetivo**: ação "Mover para coleção" na folha de lote, com coleções existentes, "Sem coleção" e criação de coleção nova.

**Independent Test**: marcar 3 livros, escolher "Mover para coleção" → "Nova coleção 'Série X'". O filtro da coleção "Série X" mostra exatamente esses 3.

### Implementation

- [X] T018 [P] [US2] Em `src/db/collections.ts`, adicionar `setBooksCollection(ids: number[], collectionId: number | null)` (D-07, D-09):
  - Uma transação `rw` em `db.books`.
  - `collectionOrder = Date.now() + índice` para coleção, e `undefined` para "Sem coleção".
- [X] T019 [US2] Em `src/components/BulkBookActionsSheet.tsx`:
  - Linha "Mover para coleção", que expande a lista das coleções (`useLiveQuery` como na `QuickBookActionsSheet`).
  - A lista inclui "Sem coleção" e o campo + botão "Criar e mover" (`createCollection` seguido de `setBooksCollection`).
  - Ao concluir, chama `onDone` com a mensagem "N livros movidos para C" ou "removidos da coleção" (FR-009).
- [X] T020 [P] [US2] Adicionar em `src/i18n/messages.ts` (pt-BR/en/es):
  - `bulkActions.collection.title`
  - `bulkActions.collection.none`
  - `bulkActions.collection.newPlaceholder`
  - `bulkActions.collection.create`
  - `bulkActions.collection.moved.one` / `.many` (com `{name}`)
  - `bulkActions.collection.removed.one` / `.many`

### Testes da Fase

- [X] T021 [P] [US2] `src/__tests__/db/collections.bulk.test.ts`:
  - `setBooksCollection` grava `collectionId` e uma `collectionOrder` crescente para todos os ids.
  - Com `null`, grava `collectionId: null` e `collectionOrder: undefined`.
- [X] T022 [US2] Ampliar `src/__tests__/components/BulkBookActionsSheet.test.tsx`:
  - Escolher uma coleção chama `setBooksCollection(ids, id)`.
  - "Sem coleção" passa `null`.
  - Criar uma coleção chama `createCollection` e depois move para o id novo.
  - Nome vazio desabilita "Criar e mover".

**Critério de Conclusão**:
- A partir da seleção, o usuário move N livros para uma coleção existente, para uma nova ou para "Sem coleção".
- A coleção anterior é substituída.
- O filtro da coleção reflete a mudança, o modo termina e o toast confirma.
- Testes verdes e `quickstart.md`, passos 4.1 a 4.3, validados.

**Checkpoint**: User Story 2 funcional e testável isoladamente.

**Registro da Fase**:

- Status: Implementada e testada em jsdom (2026-10-12). Falta só a validação em device (`quickstart.md`, passos 4.1 a 4.3).
- Feito:
  - `setBooksCollection(ids, collectionId | null)` em `src/db/collections.ts`: uma transação, `collectionOrder = Date.now() + índice`, `undefined` para "Sem coleção".
  - `BulkBookActionsSheet`: painel "Mover para coleção" com "Sem coleção", as coleções existentes e campo "Criar e mover". A folha recebe `collections` por prop (a tela já as tem), sem ler o DB.
  - **Decisão não prevista na spec** (R-009): `collections.name` tem índice único (`&name`). Um nome já existente (sem diferenciar maiúsculas) reaproveita a coleção em vez de estourar `ConstraintError`.
  - 9 chaves `bulkActions.collection.*` nos 3 idiomas.
- Testes executados:
  - `npx vitest run src/__tests__/db/collections.bulk.test.ts src/__tests__/components/BulkBookActionsSheet.test.tsx src/__tests__/screens/LibraryScreen.test.tsx`: 38/38 na primeira rodada.
  - `npm run lint`: 1 rodada com 2 erros de variável não usada em `collections.bulk.test.ts` (mesmo padrão já corrigido em `books.bulk.test.ts`), corrigidos; depois limpo.
  - Gates completos no fim da Fase 5 (ver abaixo).
- Pendências: validação em device (quickstart 4.1 a 4.3).

---

## Phase 5: User Story 3 - Favoritar e definir status de leitura em lote (Priority: P3)

**Objetivo**: ações "Favoritar"/"Remover dos favoritos" (adaptativa) e "Status de leitura" (Não lido / Lendo / Lido) na folha de lote.

**Independent Test**: marcar 3 livros (1 já favorito) → "Favoritar": os 3 viram favoritos. Marcar os mesmos 3: aparece "Remover dos favoritos". Marcar 2 → Status "Lido": o filtro de finalizados mostra os 2.

### Implementation

- [X] T023 [P] [US3] Em `src/db/books.ts`, adicionar `setBooksFavorite(ids, value: boolean)` e `setBooksReadingStatus(ids, status: ReadingStatus)`, cada um numa transação `rw` em `db.books` (D-07, D-08). Não mexem em progresso.
- [X] T024 [US3] Em `src/components/BulkBookActionsSheet.tsx`:
  - Linha de favoritos com rótulo calculado ao abrir (`books.every(b => b.isFavorite)` → "Remover dos favoritos", senão "Favoritar"), chamando `setBooksFavorite` com o valor explícito.
  - Linha "Status de leitura", que expande as 3 opções e reusa os rótulos `library.filter.unread`/`reading`/`finished`, se fizerem sentido, ou chaves novas.
  - `onDone` com a mensagem de resultado (FR-010, FR-011).
- [X] T025 [P] [US3] Adicionar em `src/i18n/messages.ts` (pt-BR/en/es):
  - `bulkActions.favorite.add`
  - `bulkActions.favorite.remove`
  - `bulkActions.favorite.added.one` / `.many`
  - `bulkActions.favorite.removed.one` / `.many`
  - `bulkActions.status.title`
  - `bulkActions.status.done.one` / `.many` (com `{status}`)

### Testes da Fase

- [X] T026 [P] [US3] Ampliar `src/__tests__/db/books.bulk.test.ts`: `setBooksFavorite` e `setBooksReadingStatus` atualizam só o campo alvo para todos os ids.
- [X] T027 [US3] Ampliar `src/__tests__/components/BulkBookActionsSheet.test.tsx`:
  - Seleção mista mostra "Favoritar" e chama `setBooksFavorite(ids, true)`.
  - Todos favoritos mostra "Remover dos favoritos" e chama a função com `false`.
  - Escolher "Lido" chama `setBooksReadingStatus(ids, 'finished')`.

**Critério de Conclusão**:
- Favoritar é adaptativo e aplica um estado explícito a todos.
- O status em lote aplica o status escolhido sem alterar o progresso.
- O modo termina com toast.
- Testes verdes e `quickstart.md`, passos 4.4 e 4.5, validados.

**Checkpoint**: User Story 3 funcional e testável isoladamente.

**Registro da Fase**:

- Status: Implementada e testada em jsdom (2026-10-12). Falta só a validação em device (`quickstart.md`, passos 4.4 e 4.5).
- Feito:
  - `setBooksFavorite(ids, value)` e `setBooksReadingStatus(ids, status)` em `src/db/books.ts`, sobre um helper privado `updateBooks` (uma transação por chamada).
  - Folha: linha de favoritos adaptativa (`books.every(isFavorite)` → "Remover dos favoritos", senão "Favoritar") e painel "Status de leitura" com Não lido / Lendo / Lido.
  - Refatoração interna da folha: os 3 painéis expansíveis passaram a ser um único estado `panel` (só um aberto por vez), e a pluralização `.one`/`.many` virou um helper `pluralize`.
  - 15 chaves `bulkActions.favorite.*` e `bulkActions.status.*` nos 3 idiomas.
  - Rótulos de status novos (`Não lido`/`Lendo`/`Lido`) em vez de reaproveitar `library.filter.*`, que ficou com "Nao iniciados"/"Finalizados" (outro vocabulário e sem acento).
- Testes executados:
  - `npx vitest run src/__tests__/db/books.bulk.test.ts src/__tests__/components/BulkBookActionsSheet.test.tsx`: 27/27 na primeira rodada.
  - `npm run lint`: limpo (depois da correção da Fase 4).
  - `npx tsc --noEmit -p tsconfig.app.json`: exit 0.
  - `npm test`: 160 arquivos ✓, 2 pulados; 1696 testes ✓, 2 pulados.
  - `npm run build`: ok.
- Pendências: validação em device (quickstart 4.4 e 4.5).

---

## Phase 6: Polish & Cross-Cutting Concerns

**Purpose**: Melhorias que afetam múltiplas user stories.

- [X] T028 Revisar a acessibilidade (FR-015): `aria-pressed` e `aria-label` nos itens marcáveis, rótulos na barra e na folha, e ordem de foco ao abrir e fechar a folha.
- [ ] T029 Medir o SC-003 no device (`quickstart.md`, passo 6). Se a exclusão de 50 livros passar de 3 s, registrar em R-003 e abrir uma task de otimização de `deleteLocalCopyIfUnused`.
- [X] T030 Conferir os textos nos 3 idiomas, com singular e plural (`quickstart.md`, passo 7).
- [ ] T031 Rodar o `quickstart.md` completo (browser e device).
- [X] T032 Atualizar o `README.md` (inventário de funcionalidades da Biblioteca) com seleção múltipla e ações em lote.

**Registro do Polish (2026-10-12)**:

- T028: `aria-pressed` + `aria-label` nos itens, `role="status"` na contagem da barra, cabeçalho `inert`, e capa/texto da linha da lista `inert` em modo de seleção (Tab e leitor de tela não alcançam os botões cobertos).
- T030: `messages.test.ts` ganhou o guarda de pluralização (singular sem `{count}`, plural com `{count}`) para `bulkActions.*` e `library.selection.*` nos 3 idiomas; o paridade de chaves entre idiomas já era garantida pelo teste existente e por `satisfies Record<MessageKey, string>`.
- T032: seção "Biblioteca" do `README.md` atualizada.
- **Ainda abertas, dependem de device**: T017, T029 (SC-003 com 50 livros) e T031 (quickstart completo). Sem device conectado nesta sessão (`adb devices` vazio).

### Checklist de Release

- [X] Fase 2 (Foundational) concluída
- [ ] Fase 3 (User Story 1) concluída
- [ ] Fase 4 (User Story 2) concluída
- [ ] Fase 5 (User Story 3) concluída
- [X] `npm run lint && npm test && npm run build` verdes
- [ ] Gesto validado no device Android: scroll, menu de contexto, sem abrir ao soltar e back button (R-001)
- [ ] Arquivo `local` removido na exclusão em lote (SC-004)
- [ ] SC-003 medido (50 livros em menos de 3 s) ou desvio registrado
- [ ] Sem regressão do toque para abrir e das ações individuais fora do modo (SC-002)
- [ ] `quickstart.md` executado com sucesso

---

## Dependencies & Execution Order

### Phase Dependencies

- **Foundational (Phase 2)**: sem dependências. BLOQUEIA todas as user stories (hooks de gesto e de seleção).
- **US1 (Phase 3)**: depende da Phase 2. Cria a barra, a folha, a fiação na tela e a marcação na lista e na grade.
- **US2 (Phase 4) e US3 (Phase 5)**: dependem da US1 (a folha de lote e o modo de seleção já existem). Entre si são independentes e podem rodar em qualquer ordem, mas as duas tocam `BulkBookActionsSheet.tsx`, então em sequência é mais seguro.
- **Polish (Phase 6)**: depende das stories desejadas.

### Parallel Opportunities

- Phase 2: T001, T002 e T003 em paralelo; T004 e T005 em paralelo.
- Phase 3: T006, T007, T008 e T012 em paralelo. T009 e T010 depois de T001. T011 depois de T007/T008/T009/T010.
- Phase 4: T018 e T020 em paralelo; depois T019.
- Phase 5: T023 e T025 em paralelo; depois T024.

---

## Parallel Example: User Story 1

```bash
Task: "T006 [P] [US1] deleteBooks em src/db/books.ts"
Task: "T007 [P] [US1] LibrarySelectionBar em src/components/LibrarySelectionBar.tsx"
Task: "T008 [P] [US1] BulkBookActionsSheet (excluir) em src/components/BulkBookActionsSheet.tsx"
Task: "T012 [P] [US1] chaves i18n de exclusão em src/i18n/messages.ts"
```

---

## Implementation Strategy

### MVP First (User Story 1 apenas)

1. Phase 2: Foundational (hooks e textos base).
2. Phase 3: User Story 1 (modo de seleção e exclusão).
3. **PARAR E VALIDAR** no device: gesto (R-001) e exclusão de livro `local`.

### Incremental Delivery

1. Foundational, depois US1, com validação no device (MVP entregável).
2. US2 (coleção), com validação.
3. US3 (favoritos e status), com validação.
4. Polish e Checklist de Release.

## Notes

- `[P]` = arquivos diferentes, sem dependência
- `[Story]` mapeia a task pra uma user story específica
- Commitar após cada task ou grupo lógico coerente
- Parar em qualquer checkpoint pra validar a story isoladamente

<!-- sdd-converge anexa "## Phase N: Convergence" abaixo desta linha -->
