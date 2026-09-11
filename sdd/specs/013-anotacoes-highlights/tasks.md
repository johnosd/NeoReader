---
description: "Tasks de implementação: Anotações associadas a highlights"
---

# Tasks: Anotações associadas a highlights

**Input**: Documentos de design de `sdd/specs/013-anotacoes-highlights/`

**Prerequisites**: `plan.md`, `spec.md`, `quickstart.md`

**Organization**: Tasks agrupadas por user story pra permitir implementação e teste independentes de cada uma.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Pode rodar em paralelo (arquivos diferentes, sem dependência)
- **[Story]**: A qual user story esta task pertence (US1, US2)

## Path Conventions

Projeto único (React + TypeScript + Vite), sem separação backend/frontend.

- Tipos: `src/types/highlight.ts`
- Persistência: `src/db/highlights.ts`
- Componentes do leitor: `src/components/reader/`
- Telas: `src/screens/`
- i18n: `src/i18n/messages.ts`
- Testes espelham `src/` em `src/__tests__/` (`db/`, `components/`, `screens/`)

---

## Phase 1: Setup (Shared Infrastructure)

Nenhuma task de setup necessária — sem dependência nova, sem scaffolding.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Campo de dados + persistência + textos — bloqueia as duas user stories (US1 escreve, US2 lê o mesmo campo).

**⚠️ CRITICAL**: Nenhuma user story pode começar antes desta fase terminar.

### Implementation

- [X] T001 [Foundational] Adicionar campo `note?: string` em `Highlight`
      (`src/types/highlight.ts`), com comentário explicando: (a) segue o
      mesmo precedente do campo `style?` — opcional, não indexado, não
      exige nova `version()` do Dexie, registros antigos simplesmente
      não têm o campo; (b) por que se chama `note` e não `annotation`
      (colisão com `view.addAnnotation`/`deleteAnnotation` do
      foliate-js, usado pro overlay de pintura do highlight — ver
      `plan.md` R-001).
- [X] T002 [Foundational] Adicionar `updateHighlightNote(id: number, note: string | null): Promise<void>`
      em `src/db/highlights.ts` — grava o texto (trimado) ou limpa o
      campo (`undefined`/`null`) quando `note` for `null` ou só espaços
      em branco (FR-006). Mesmo padrão de `updateHighlightAppearance`
      (patch parcial via `db.highlights.update`).
- [X] T003 [Foundational] Adicionar as chaves de i18n nos 3 locales de
      `src/i18n/messages.ts`: `reader.highlightMenu.annotate` ("Anotar"),
      `reader.highlightMenu.editAnnotation` ("Editar anotação"),
      `highlightNote.title`, `highlightNote.placeholder`,
      `highlightNote.save`, `highlightNote.cancel`, e um texto de limite
      de caracteres (ex: `highlightNote.charLimit` com `{count}`/`{max}`).

### Testes da Fase

- [X] T004 [P] [Foundational] Testes em `src/__tests__/db/highlights.test.ts`:
      `updateHighlightNote` grava o texto trimado; `updateHighlightNote(id, null)`
      limpa o campo; texto só com espaços em branco também limpa o campo.

**Critério de Conclusão**: Campo `note` existe no tipo, é persistível via
`updateHighlightNote`, e os textos de UI necessários já existem nos 3
idiomas — pronto pra ambas as user stories consumirem.

**Checkpoint**: Fundação pronta — user stories podem começar.

**Registro da Fase**:

- Status: Concluída
- Feito: T001 (campo `note?` em `Highlight`), T002 (`updateHighlightNote`), T003 (chaves i18n nos 3 locales), T004 (3 testes novos)
- Testes executados: `npx tsc --noEmit` (limpo), `npx vitest run src/__tests__/db/highlights.test.ts` (9 passando, era 6)
- Pendências: nenhuma — pronto pras User Stories 1 e 2

---

## Phase 3: User Story 1 - Escrever e editar anotação num highlight (Priority: P1) 🎯 MVP

**Objetivo**: Tocar num highlight existente permite escrever/editar uma
anotação de texto associada a ele, via o menu que já existe.

**Independent Test**: Criar um highlight, tocar nele, escolher "Anotar",
escrever texto, salvar, reabrir o menu do highlight e confirmar que o
texto persistiu e a ação agora aparece como "Editar anotação".

### Implementation

- [X] T005 [US1] Em `src/components/reader/EpubViewer.tsx`: adicionar um
      item `data-nr-highlight-annotate="1"` em `renderHighlightMenuActionsHtml`
      (mesmo padrão declarativo de `data-nr-highlight-remove`/`-color`/`-style`
      — o comentário já existente no arquivo antecipa exatamente essa
      extensão), com rótulo `reader.highlightMenu.annotate` ou
      `.editAnnotation` conforme o highlight ativo já tem `note` ou não.
      Nova prop `onAnnotateHighlight?: (highlight: Highlight) => void`
      (mesmo padrão de `onDeleteHighlight`/`onChangeHighlightAppearance`:
      `useSyncRef` + despachada no branch de clique do menu de
      highlight), fecha o menu após despachar (mesmo comportamento de
      remover).
- [X] T006 [P] [US1] Criar `src/components/reader/HighlightNoteSheet.tsx`
      — `BottomSheet` (de `src/components/ui`) com um `<textarea>`
      controlado (`maxLength={2000}`, contador de caracteres visível
      perto do limite), botões Salvar/Cancelar. Props: `open: boolean`,
      `highlight: Highlight | null`, `onSave: (note: string) => void`,
      `onClose: () => void`. Estado local do texto reseta pro valor de
      `highlight?.note ?? ''` toda vez que abre pra um highlight novo.
      Cancelar/fechar sem salvar não chama `onSave` (FR-005).
- [X] T007 [US1] Em `src/screens/ReaderScreen.tsx`: estado
      `highlightNoteTarget: Highlight | null`; `handleAnnotateHighlight(highlight)`
      seta o alvo (abre o sheet); `handleSaveHighlightNote(note)` chama
      `updateHighlightNote(highlightNoteTarget.id, note.trim() || null)`
      e fecha o sheet. Prop `onAnnotateHighlight={handleAnnotateHighlight}`
      em `<EpubViewer>`; renderiza `<HighlightNoteSheet>` no mesmo nível
      de `<BookmarkSheet>`.

### Testes da Fase

- [X] T008 [P] [US1] Testes em `src/__tests__/components/EpubViewer.test.tsx`:
      - Highlight sem `note`: menu mostra rótulo "Anotar".
      - Highlight com `note`: menu mostra rótulo "Editar anotação".
      - Tocar na ação chama `onAnnotateHighlight` com o highlight certo e fecha o menu.
      - Tocar na ação NÃO chama `onDeleteHighlight` nem `onChangeHighlightAppearance`.
- [X] T009 [P] [US1] Testes em `src/__tests__/screens/ReaderScreen.test.tsx`:
      - `onAnnotateHighlight` (highlight sem nota) abre o sheet vazio.
      - `onAnnotateHighlight` (highlight com nota) abre o sheet preenchido com o texto existente.
      - Salvar com texto chama `updateHighlightNote(id, textoTrimado)`.
      - Salvar com texto vazio/só espaços chama `updateHighlightNote(id, null)`.
      - Cancelar não chama `updateHighlightNote`.

**Critério de Conclusão**: Usuário escreve, edita e limpa a anotação de
qualquer highlight via o menu do leitor, com o rótulo do menu refletindo
corretamente se já existe nota. Sem regressão nas ações existentes do
menu (T008 cobrindo isso).

**Checkpoint**: User Story 1 funcional e testável isoladamente.

**Registro da Fase**:

- Status: Concluída
- Feito: T005 (item "Anotar"/"Editar anotação" no menu, `data-nr-highlight-annotate`, prop `onAnnotateHighlight`), T006 (`HighlightNoteSheet.tsx`), T007 (wiring em `ReaderScreen.tsx`, estado `highlightNoteTarget`), T008 (3 testes em `EpubViewer.test.tsx`), T009 (4 testes em `ReaderScreen.test.tsx`)
- Testes executados: `npx tsc --noEmit` (limpo), `npm run lint` (limpo, após corrigir 1 erro — ver Pendências), `npx vitest run src/__tests__/components/EpubViewer.test.tsx src/__tests__/screens/ReaderScreen.test.tsx` (152 passando: 111 + 41)
- Pendências: nenhuma. Bug encontrado e corrigido inline durante a task (T006): `useEffect` fazendo `setState` síncrono pra resetar o texto ao abrir (violava `react-hooks/set-state-in-effect`) — substituído por `key={highlight?.id ?? 'closed'}` no `<HighlightNoteSheet>` (`ReaderScreen.tsx`), removendo o `useEffect` por completo e inicializando o `useState` direto do prop (padrão que o próprio React recomenda pra "resetar estado quando uma prop muda").

---

## Phase 4: User Story 2 - Ver a anotação na tela de detalhes do livro (Priority: P1)

**Objetivo**: A aba Destaques de `BookDetailsScreen.tsx` mostra o texto
da anotação (quando existir) junto do trecho destacado.

**Independent Test**: Com um highlight já tendo `note` no banco (via
fixture de teste ou criado na US1), abrir a tela de detalhes do livro,
aba Destaques, e confirmar que o texto da anotação aparece visível.

### Implementation

- [X] T010 [US2] Em `src/screens/BookDetailsScreen.tsx`, aba `highlights`
      (linha ~803-843) — o `ListItem` de cada highlight ganha uma
      exibição do `highlight.note` (quando presente) abaixo do texto
      destacado, truncada com `line-clamp` (mesmo padrão CSS já usado
      pra `snippet` em `BookmarkSheet.tsx:90`, `line-clamp-2`).
      Highlight sem `note` não ganha nenhum elemento extra (FR-011/US2
      AC3).

### Testes da Fase

- [X] T011 [P] [US2] Testes em `src/__tests__/screens/BookDetailsScreen.test.tsx`:
      - Highlight com `note`: o texto da nota aparece na aba Destaques.
      - Highlight sem `note`: nenhum elemento extra de nota aparece.
      - Nota longa: elemento renderizado com a classe de truncamento (`line-clamp-*`).

**Critério de Conclusão**: Toda anotação existente aparece corretamente
na aba Destaques, truncada quando longa, sem exigir toque extra; nenhuma
mudança visível pra highlights sem anotação.

**Checkpoint**: User Story 2 funcional e testável isoladamente (inclusive
sem a UI de escrita da US1, usando fixture de teste com `note` já setado).

**Registro da Fase**:

- Status: Concluída
- Feito: T010 (`highlight.note` exibido na aba Destaques via `meta` do `ListItem`, truncado com `line-clamp-2`), T011 (3 testes novos)
- Testes executados: `npx tsc --noEmit` (limpo), `npx vitest run src/__tests__/screens/BookDetailsScreen.test.tsx` (41 passando, era 38), `npm run lint` (limpo)
- Pendências: nenhuma. 1 ajuste no próprio teste durante a task (não bug de produto): o teste de truncamento inicialmente falhava por espaço em branco final na string de teste não normalizado pelo matcher do Testing Library — corrigido com `.trim()` na fixture do teste.

---

## Phase 5: Polish & Cross-Cutting Concerns

**Purpose**: Validação final cross-cutting, cobrindo os gates da
constitution e o `quickstart.md`.

- [X] T012 Rodar `npm run lint && npm test && npx tsc --noEmit && npm run build` — Constitution IV.
- [X] T013 Executado o cenário ponta a ponta num device Android real (SM-S911B): criar highlight, "Anotar" no highlight sem nota, sheet abrindo vazio com teclado virtual funcionando bem, salvar com quebra de linha, reabrir mostrando "Editar anotação" preenchido, cancelar preservando o texto antigo, esvaziar e salvar voltando a "Anotar", e a anotação aparecendo truncada na aba Highlights de `BookDetailsScreen`. Confirmado pelo usuário: "funcionou tudo". **Não exercido nesta passada**: teste explícito do limite de 2000 caracteres (passo 9 do `quickstart.md`) e troca de idioma en/es (passo 12) — cobertos indiretamente por testes automatizados (limite) e pelo padrão de i18n já usado em toda a tela (tradução), mas sem confirmação visual manual desses dois pontos específicos.
- [X] T014 `README.md` já documentava a feature de highlights (seção "### Highlights" e o bullet de "Detalhes do livro") — adicionada menção à anotação em ambos os pontos (ação "anotar" no menu, e exibição truncada na aba Highlights).

### Checklist de Release

- [X] Fase Foundational concluída (T001-T004)
- [X] Fase User Story 1 concluída (T005-T009)
- [X] Fase User Story 2 concluída (T010-T011)
- [X] `npm run lint && npm test && npx tsc --noEmit && npm run build` passando
- [X] Validado em device Android real (`quickstart.md` — fluxo principal completo; limite de caracteres e troca de idioma não exercidos manualmente, ver T013)
- [X] Nenhuma regressão nas ações existentes do menu de highlight (remover, trocar cor, trocar estilo) nem na lista de Destaques já existente

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: nenhuma task — sem dependências.
- **Foundational (Phase 2)**: BLOQUEIA User Story 1 e User Story 2 — ambas dependem do campo `note` e de `updateHighlightNote`.
- **User Story 1 (Phase 3)**: depende do Foundational. Independente da User Story 2 (escreve o dado que a US2 lê, mas a US2 pode ser testada com fixture direto no banco, sem depender da UI da US1 estar pronta).
- **User Story 2 (Phase 4)**: depende do Foundational. Pode rodar em paralelo com a User Story 1 (arquivos diferentes: `BookDetailsScreen.tsx` vs. `EpubViewer.tsx`/`ReaderScreen.tsx`/`HighlightNoteSheet.tsx`).
- **Polish (Phase 5)**: depende de ambas as user stories completas.

### Parallel Opportunities

- T006 (`HighlightNoteSheet.tsx`, US1) pode ser feita em paralelo com T005 (menu em `EpubViewer.tsx`) — arquivos diferentes; T007 (`ReaderScreen.tsx`) depende dos dois.
- Fase 4 (User Story 2) inteira pode rodar em paralelo com a Fase 3 (User Story 1) depois do Foundational — arquivos diferentes, sem dependência de código entre elas.
- T008/T009 (US1) e T011 (US2) — arquivos de teste diferentes, paralelizáveis entre si.

---

## Implementation Strategy

### MVP First (Foundational + User Story 1)

1. Completar Fase 1: Setup (vazia).
2. Completar Fase 2: Foundational (T001-T004).
3. Completar Fase 3: User Story 1 (T005-T009).
4. **PARAR E VALIDAR**: testar User Story 1 isoladamente no device (passos 1-7 de `quickstart.md`).

### Incremental Delivery

1. Foundational → fundação pronta.
2. User Story 1 → testar isoladamente → considerar entrega (MVP funcional: escrever/editar anotação).
3. User Story 2 → testar isoladamente → entrega a visualização em Destaques, sem quebrar a User Story 1.
4. Polish → gates de build/lint/testes + validação manual completa (incluindo teclado virtual).

## Notes

- `[P]` = arquivos diferentes, sem dependência.
- `[Story]` mapeia a task pra uma user story específica.
- Commitar após cada task ou grupo lógico coerente.
- Nunca usar `annotation` como nome de campo/variável pro dado desta
  feature — `note`, sempre (ver `plan.md` R-001 e Cuidados para
  Retomada).

<!-- sdd-converge anexa "## Phase N: Convergence" abaixo desta linha -->
