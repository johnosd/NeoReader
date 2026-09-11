---
description: "Tasks de implementação: Caixa unificada de cor, estilo e nota ao criar ou editar highlight"
---

# Tasks: Caixa unificada de cor, estilo e nota ao criar ou editar highlight

**Input**: Documentos de design de `sdd/specs/016-caixa-unificada-highlight-nota/`

**Prerequisites**: `plan.md`, `spec.md`, `research.md`, `quickstart.md`

**Organization**: Tasks agrupadas por user story pra permitir
implementação e teste independentes de cada uma.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Pode rodar em paralelo (arquivos diferentes, sem dependência)
- **[Story]**: A qual user story esta task pertence (US1, US2)

## Path Conventions

Projeto único (React + TypeScript + Vite), sem separação backend/frontend.

- Componente novo (fora do iframe): `src/components/reader/HighlightComposerSheet.tsx`
- Componente removido: `src/components/reader/HighlightNoteSheet.tsx`
- Menu sandboxado do EPUB: `src/components/reader/EpubViewer.tsx`
- Tela do leitor: `src/screens/ReaderScreen.tsx`
- Tipos de settings: `src/types/settings.ts`
- i18n: `src/i18n/messages.ts`
- Testes: `src/__tests__/components/EpubViewer.test.tsx`,
  `src/__tests__/components/reader/HighlightComposerSheet.test.tsx` (novo),
  `src/__tests__/screens/ReaderScreen.test.tsx`

---

## Phase 1: Setup (Shared Infrastructure)

Nenhuma task de setup necessária — sem dependência nova, sem scaffolding.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Persistência do "último usado" + i18n — bloqueia as duas user
stories (ambas dependem de `lastHighlightColor/Style` e da chave de título
da caixa).

**⚠️ CRITICAL**: Nenhuma user story pode começar antes desta fase terminar.

### Implementation

- [X] T001 [Foundational] Em `src/types/settings.ts`: adicionar
      `lastHighlightColor: string` e `lastHighlightStyle: HighlightStyle`
      a `ReaderDefaults` (import de `HighlightStyle` de `./highlight`),
      `DEFAULT_READER_DEFAULTS` (`'indigo'`/`'background'`, mesmo default
      hoje hardcoded em `EpubViewer.tsx`), e o mapeamento correspondente em
      `normalizeUserSettings` (com fallback pros defaults, mesmo padrão dos
      campos existentes).
- [X] T002 [Foundational] Adicionar a chave `highlightComposer.title` (ex.:
      pt-BR "Destaque", en "Highlight", es "Resaltado") nos 3 locales de
      `src/i18n/messages.ts` — as demais strings da caixa (placeholder,
      Salvar, Cancelar, contador de caracteres) REAPROVEITAM as chaves
      `highlightNote.*` já existentes, sem duplicar.

**Critério de Conclusão**: `ReaderDefaults` tem os 2 campos novos
persistíveis via `updateReaderDefaults` já existente; chave de título
existe nos 3 locales.

**Checkpoint**: Fundação pronta — User Story 1 pode começar.

**Registro da Fase**:

- Status: Concluída
- Feito: T001 (`ReaderDefaults` ganhou `lastHighlightColor`/`lastHighlightStyle`, default `'indigo'`/`'background'`, mapeados em `normalizeUserSettings`); T002 (chave `highlightComposer.title` nos 3 locales). Achado durante T001 (bloqueava a própria task, corrigido inline): 4 testes pré-existentes de `src/__tests__/db/settings.test.ts` comparavam `readerDefaults` com `toEqual`/`objectContaining` exato — adicionados os 2 campos novos nos objetos esperados.
- Testes executados: `npx tsc --noEmit` (limpo), `npx vitest run src/__tests__/db/settings.test.ts` (7/7)
- Pendências: nenhuma — pronto pra User Story 1

---

## Phase 3: User Story 1 - Criar um highlight já com cor, estilo e nota (Priority: P1) 🎯 MVP

**Objetivo**: Tocar "Destacar" abre a caixa unificada (cor/estilo
pré-selecionados com o último usado + campo de nota); nada é gravado até
confirmar; toast da 015 só aparece se a nota ficou vazia.

**Independent Test**: Selecionar texto, tocar "Destacar", ver a caixa com
cor/estilo pré-selecionados e nota vazia, mudar a cor, escrever uma nota,
confirmar — o highlight aparece com a cor escolhida e a nota associada,
sem toast (já anotou); cancelar não cria nada.

### Testes da Fase

- [X] T003 [P] [US1] Teste de `HighlightComposerSheet` em modo `create` —
      novo arquivo `src/__tests__/components/reader/HighlightComposerSheet.test.tsx`:
      renderiza cor/estilo default + nota vazia; confirmar chama `onSave`
      com `{color, style, note}` escolhidos; cancelar chama `onClose` sem
      chamar `onSave`.
- [X] T004 [P] [US1] Teste em `EpubViewer.test.tsx`: tocar o botão
      "Destacar" (root do menu de seleção) chama `onRequestCreateHighlight`
      com o draft (cfi/paraCfi/text/sectionIndex/percentage, SEM
      color/style), fecha o menu, limpa a seleção nativa — e NÃO cria nem
      pinta highlight nenhum (substitui o teste antigo de criação
      imediata ao tocar numa cor).
- [X] T005 [P] [US1] Teste em `EpubViewer.test.tsx`: o submenu de cores do
      menu de SELEÇÃO (`[data-nr-selection-color]`/`[data-nr-selection-style]`)
      não existe mais em lugar nenhum do DOM do menu.
- [X] T006 [P] [US1] Teste em `ReaderScreen.test.tsx`: disparar
      `mocks.epubViewerProps.onRequestCreateHighlight(draft)` abre
      `HighlightComposerSheet` em modo `create`, com `defaultColor`/
      `defaultStyle` vindos de `getSettings()` (mock).
- [X] T007 [P] [US1] Teste em `ReaderScreen.test.tsx`: confirmar a caixa em
      modo `create` chama `addHighlight` com a cor/estilo/nota escolhidos
      e `updateReaderDefaults` com `lastHighlightColor`/`lastHighlightStyle`;
      se a nota ficou vazia, o toast da 015 aparece (reaproveita/ajusta os
      testes existentes); se a nota NÃO ficou vazia, o toast NÃO aparece
      (FR-006 — teste novo).
- [X] T008 [P] [US1] Teste em `ReaderScreen.test.tsx`: cancelar a caixa em
      modo `create` NÃO chama `addHighlight`.

### Implementation

- [X] T009 [US1] `src/components/reader/HighlightComposerSheet.tsx`
      (NOVO): props `open`, `mode: 'create' | 'edit'`, `draft?:
      HighlightDraftPayload`, `highlight?: Highlight`, `defaultColor?:
      string`, `defaultStyle?: HighlightStyle`, `onSave: (result: {
      color: string; style: HighlightStyle; note: string }) => void`,
      `onClose: () => void`. Estado interno de cor/estilo/nota seedado a
      partir das props via `key` (mesmo padrão documentado em
      `HighlightNoteSheet.tsx` hoje). UI: `BottomSheet` com título
      `highlightComposer.title`, swatches de cor (reaproveita
      `ANNOTATION_COLORS`/padrão visual de `BookmarkSheet.tsx`), 3 botões
      de estilo (ícones React novos, `aria-pressed`, reaproveita labels
      `reader.selectionMenu.style.*`), `<textarea>` (reaproveita
      `highlightNote.placeholder`/`charLimit`), botões Salvar/Cancelar
      (`Button`, reaproveita `highlightNote.save`/`cancel`).
- [X] T010 [US1] Remover `src/components/reader/HighlightNoteSheet.tsx`
      (substituído por T009).
- [X] T011 [US1] Em `src/components/reader/EpubViewer.tsx`: novo tipo
      exportado `HighlightDraftPayload` (`HighlightCreationPayload` sem
      `color`/`style`); nova prop `onRequestCreateHighlight?: (draft:
      HighlightDraftPayload) => void`. No branch do click handler que hoje
      lê `data-nr-selection-open-colors` (`EpubViewer.tsx`, dentro do
      `doc.addEventListener('click', ...)` único): em vez de
      `setSelectionMenuMode(..., 'colors', ...)`, monta o draft via
      `buildHighlightPayloadFromRange` já existente, chama
      `onRequestCreateHighlightRef.current?.(draft)`, limpa a seleção
      nativa (`doc.getSelection?.()?.removeAllRanges()`) e fecha o menu
      (`closeSelectionMenu(doc)`). Remove o modo `'colors'` de
      `renderSelectionMenuActionsHtml` e os branches agora mortos
      (`data-nr-selection-color`/`-style`/`-back`) e a variável
      `pendingHighlightStyle` (não usada mais na criação).
- [X] T012 [US1] Em `src/screens/ReaderScreen.tsx`: novo estado
      `highlightComposer: { mode: 'create'; draft: HighlightDraftPayload }
      | { mode: 'edit'; highlight: Highlight } | null`; novo estado
      `lastHighlightColor`/`lastHighlightStyle` (default `'indigo'`/
      `'background'`), carregado uma vez via `getSettings()` num
      `useEffect` de montagem; novo handler pro prop
      `onRequestCreateHighlight` (seta `highlightComposer` em modo
      `create`); `handleSaveHighlightComposer` novo — branch `create`:
      `addHighlight({...draft, color, style, note: note || undefined,
      bookId, createdAt})`, `void updateReaderDefaults({
      lastHighlightColor: color, lastHighlightStyle: style })`, e só seta
      `highlightAnnotateToast` se `note` veio vazia (FR-006). Renderiza
      `<HighlightComposerSheet>` no lugar de `<HighlightNoteSheet>`.
- [X] T013 [US1] Remove `handleCreateHighlight` (antigo) de
      `ReaderScreen.tsx` — substituído pelo branch `create` de T012.

**Critério de Conclusão**: Criar um highlight só acontece através da caixa
unificada — o antigo caminho de criação imediata ao tocar numa cor não
existe mais. Toast da 015 aparece só quando a nota ficou vazia. Cancelar
não cria nada. Todos os testes de T003-T008 passando.

**Checkpoint**: User Story 1 funcional e testável isoladamente — editar um
highlight já existente ainda usa o fluxo ANTIGO até a Fase 4 (estado
intermediário válido).

**Registro da Fase**:

- Status: Concluída
- Feito: `HighlightComposerSheet.tsx` novo (cor + estilo + nota, seedado via `highlight`/`defaultColor`+`defaultStyle` — sem prop `mode` separada, o dado já diz qual caso é); `HighlightNoteSheet.tsx` removido. `EpubViewer.tsx`: `HighlightDraftPayload` novo, prop `onRequestCreateHighlight`, "Destacar" agora só monta o draft e dispara o callback (não cria mais nada); removido o modo `'colors'` do menu de SELEÇÃO e os branches mortos (`data-nr-selection-color`/`-style`/`-back`) e `pendingHighlightStyle`. `ReaderScreen.tsx`: estado `highlightComposer` (create/edit), `lastHighlightColor`/`lastHighlightStyle` carregados via `getSettings()` no mount, `handleSaveHighlightComposer` (ramifica create/edit), toast da 015 agora condicional a nota vazia. Fluxo de EDIÇÃO (menu de gerenciamento) mantido no formato ANTIGO por enquanto (`onChangeHighlightAppearance`/`onAnnotateHighlight` ainda existem em `EpubViewer.tsx`, só redirecionados pra abrir a caixa nova via `handleEditHighlight`) — a migração completa (cor/estilo também atrás de Salvar/Cancelar) é da Fase 4. Reescritos 5 testes de `EpubViewer.test.tsx` (T062-T063 novo comportamento, T014/T014b/T024b adaptados pro fluxo de 2 passos, T064 removido — cenário obsoleto) e 8 testes de `ReaderScreen.test.tsx` (6 reescritos do fluxo antigo de `onCreateHighlight` + 2 novos T006/T007 + 1 novo de FR-006 com nota preenchida). Achado real de processo (não é bug do produto): `npx tsc --noEmit` sozinho é um NO-OP silencioso neste projeto (tsconfig raiz só tem `references`) — só `-p tsconfig.app.json` checa de verdade; documentado em R-004 e em memory (`feedback_tsc_project_references.md`).
- Testes executados: `npm run lint` (limpo), `npx tsc --noEmit -p tsconfig.app.json` (limpo), `npx vitest run src/__tests__/components/EpubViewer.test.tsx` (121/121), `npx vitest run src/__tests__/components/reader/HighlightComposerSheet.test.tsx` (4/4), `npx vitest run src/__tests__/screens/ReaderScreen.test.tsx` (51/51), `npm test` (924 passando, 2 skipped pré-existentes), `npm run build` (limpo, exit 0)
- Pendências: nenhuma — US1 completa e testável isoladamente (criação unificada funciona ponta a ponta; edição segue no fluxo antigo até a Fase 4, estado intermediário esperado)

---

## Phase 4: User Story 2 - Editar cor, estilo e nota de um highlight existente na mesma caixa (Priority: P2)

**Objetivo**: Tocar num highlight existente abre a MESMA caixa unificada
(agora em modo `edit`), pré-preenchida; cor, estilo e nota só mudam juntos,
ao confirmar; cancelar não altera nada; "Remover" continua separado.

**Independent Test**: Tocar num highlight já existente, ver a caixa abrir
pré-preenchida, mudar cor e nota, confirmar — as duas mudanças aplicadas
juntas. Repetir e cancelar — nada muda.

### Testes da Fase

- [X] T014 [P] [US2] Teste em `EpubViewer.test.tsx`: o botão único do menu
      de gerenciamento (substitui "Anotar"/"Editar anotação" + "Cor e
      estilo") chama `onEditHighlight` com o highlight completo (color/
      style/note atuais); o submenu `'colors'` do menu de GERENCIAMENTO
      (`[data-nr-highlight-color]`/`[data-nr-highlight-style]`) não existe
      mais.
- [X] T015 [P] [US2] Teste em `EpubViewer.test.tsx`: "Remover" continua
      chamando `onDeleteHighlight` imediatamente, sem passar pela caixa
      unificada (não regride — FR-008).
- [X] T016 [P] [US2] Teste em `ReaderScreen.test.tsx`: disparar
      `mocks.epubViewerProps.onEditHighlight(highlight)` abre
      `HighlightComposerSheet` em modo `edit`, pré-preenchido com a cor,
      o estilo e a nota atuais do highlight.
- [X] T017 [P] [US2] Teste em `ReaderScreen.test.tsx`: confirmar a caixa em
      modo `edit` chama `updateHighlightAppearance(id, {color, style})` E
      `updateHighlightNote(id, note)` com o id do highlight certo.
- [X] T018 [P] [US2] Teste em `ReaderScreen.test.tsx`: cancelar a caixa em
      modo `edit` NÃO chama `updateHighlightAppearance` nem
      `updateHighlightNote` — highlight permanece como estava (FR-007).
- [X] T019 [P] [US2] Teste em `ReaderScreen.test.tsx`: tocar no toast da
      feature 015 abre a caixa unificada em modo `edit` pro highlight
      recém-criado (substitui o teste antigo que abria um sheet só de
      nota).

### Implementation

- [X] T020 [US2] Em `src/components/reader/EpubViewer.tsx`: em
      `renderHighlightMenuActionsHtml` (modo `'root'`), colapsar os
      botões "Anotar/Editar anotação" e "appearance" (cor/estilo) num
      ÚNICO botão; remover o modo `'colors'` dessa função e os branches
      agora mortos do click handler (`data-nr-highlight-open-colors`/
      `-color`/`-style`/`-back`). Renomear a prop `onAnnotateHighlight` →
      `onEditHighlight`; remover a prop `onChangeHighlightAppearance` da
      interface (não é mais chamada de dentro do iframe). O branch do
      botão único chama `onEditHighlightRef.current?.(alvo)` e fecha o
      menu — mesmo formato do branch antigo de "Anotar".
- [X] T021 [US2] Em `src/screens/ReaderScreen.tsx`: o handler que hoje é
      `handleAnnotateHighlight` passa a abrir `highlightComposer` em modo
      `edit` (em vez de só `highlightNoteTarget`); branch `edit` de
      `handleSaveHighlightComposer` (de T012) chama
      `updateHighlightAppearance(id, {color, style})` e
      `updateHighlightNote(id, note)` (via `Promise.all`). Remove
      `handleChangeHighlightAppearance`/`handleSaveHighlightNote`
      (antigos, agora substituídos). `handleTapAnnotateToast` (feature
      015) passa a abrir `highlightComposer` em modo `edit` pro highlight
      do toast, em vez de `highlightNoteTarget` direto.
- [X] T022 [US2] Limpeza de código morto em `EpubViewer.tsx`: remover
      `SelectionMenuMode`/`setSelectionMenuMode`/`setHighlightMenuAppearance`
      se não sobrar nenhum uso real (checar antes de remover — podem
      seguir necessários só pra reposicionar o menu ao reabrir); remover
      classes CSS específicas do submenu de cores (`.nr-sel-color` e afins)
      SE não forem usadas em mais nenhum lugar (cuidado: `.nr-sel-icon-btn`/
      `.nr-sel-text-btn`/`.nr-sel-divider` continuam em uso pelos menus
      'root').

**Critério de Conclusão**: Editar um highlight só acontece através da
caixa unificada — cor/estilo deixam de aplicar imediatamente. "Remover"
continua imediato e separado. Todos os testes de T014-T019 passando, mais
os testes pré-existentes de `EpubViewer.test.tsx`/`ReaderScreen.test.tsx`
não relacionados a este fluxo continuando verdes (SC-005 da spec).

**Checkpoint**: User Story 2 funcional — feature completa (criação +
edição unificadas).

**Registro da Fase**:

- Status: Concluída
- Feito: `EpubViewer.tsx`: `renderHighlightMenuActionsHtml` colapsada pra 1 função sem modo (Remover + botão único "Editar" com preview de cor/estilo, sem `hasNote`); `getHighlightMenuButtonAtPoint` simplificado (`[data-nr-highlight-remove], [data-nr-highlight-edit]`); prop `onAnnotateHighlight` renomeada pra `onEditHighlight`, `onChangeHighlightAppearance` removida da interface; branch do click handler colapsado (Remover imediato / Editar abre a caixa). Limpeza de código morto (além do previsto): `SelectionMenuMode`/`setSelectionMenuMode`/`renderStyleButtonsHtml` removidos por completo (zero uso restante, não só "se sobrar"); CSS `.nr-sel-color`/`.nr-sel-style-btn[aria-pressed]` removido. `ReaderScreen.tsx`: `handleEditHighlight` (já existia da US1) agora é o único handler de edição; `onChangeHighlightAppearance`/`handleChangeHighlightAppearance` removidos do wiring — `handleSaveHighlightComposer`'s branch `edit` (já escrito na US1) passou a ser exercitado de verdade. Reescritos 7 testes de `EpubViewer.test.tsx` (T030/T032/T035 redesenhados; T030b/T032b/T032c/T033/T034 removidos — cenários obsoletos de submenu imediato) e 4 de `ReaderScreen.test.tsx` (T016/T016b/T017/T018 novos, mais o rename do teste do toast). `grep -r HighlightNoteSheet src/` confirma zero import remanescente (só 1 comentário histórico em `HighlightComposerSheet.tsx`, R-003 satisfeito).
- Testes executados: `npm run lint` (limpo), `npx tsc --noEmit -p tsconfig.app.json` (limpo), `npx vitest run src/__tests__/components/EpubViewer.test.tsx` (116/116), `npx vitest run src/__tests__/screens/ReaderScreen.test.tsx` (51/51), `npx vitest run src/__tests__/components/reader/HighlightComposerSheet.test.tsx` (4/4), `npm test` (919 passando, 2 skipped pré-existentes), `npm run build` (limpo, exit 0)
- Pendências: nenhuma — feature completa (criação + edição unificadas), falta só a Fase Polish

---

## Phase 5: Polish & Cross-Cutting Concerns

**Purpose**: Gates finais, validação manual, limpeza, documentação.

- [X] T023 Rodar `npm run lint && npx tsc --noEmit && npm test && npm run build` limpos.
- [X] T024 Rodar `quickstart.md` num browser real (`npm run dev`) — cenário
      ponta a ponta US1+US2 + edge cases (cancelar criação, cancelar
      edição, toast condicional, Remover não regride) + validação de
      performance percebida (R-002). Instalar no device Android como
      reforço, dado o risco visual maior desta feature (mexe na árvore DOM
      do iframe).
- [X] T025 Rodar `grep -r "HighlightNoteSheet" src/` e confirmar zero
      referências remanescentes (R-003 de `plan.md`).
- [X] T026 Atualizar `README.md` (seção "Highlights") — os bullets que
      descrevem o submenu de cores imediato (features 010/013) e o toast
      sempre-aparece (015) precisam refletir o fluxo novo (caixa unificada,
      toast condicional).

### Checklist de Release

<!--
  Itens marcados pelo sdd-execute conforme cada fase fecha, mais gates
  cross-cutting da feature. Ecoa o pre-acceptance checklist da constitution.md.
-->

- [X] Fase 2 (Foundational) concluída
- [X] Fase 3 (User Story 1) concluída
- [X] Fase 4 (User Story 2) concluída
- [X] `npm run lint && npx tsc --noEmit && npm test && npm run build` limpos
- [X] `quickstart.md` executado com sucesso (browser real; ver ressalva sobre o gesto de tocar num highlight existente no Registro da Fase)
- [X] Zero referências a `HighlightNoteSheet` remanescentes
- [X] `README.md` atualizado
- [X] Backlog (`.planning/backlog.md`) atualizado para `Implementada`

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: sem dependências (vazia nesta feature).
- **Foundational (Phase 2)**: depende do Setup — BLOQUEIA as duas user stories.
- **User Story 1 (Phase 3)**: depende do Foundational. Entrega valor
  isoladamente (criação unificada) mesmo se a Fase 4 não rodar ainda.
- **User Story 2 (Phase 4)**: depende do Foundational E do componente
  `HighlightComposerSheet` criado na Fase 3 (T009) — não pode rodar antes
  da Fase 3 terminar, mesmo sendo P2.
- **Polish (Phase 5)**: depende das duas user stories completas.

### Parallel Opportunities

- T001/T002 (Foundational) tocam arquivos diferentes — podem rodar em paralelo.
- T003-T008 (Testes da Fase 3) e T014-T019 (Testes da Fase 4) tocam
  arquivos de teste compartilhados mas describes/its independentes — podem
  ser escritos em paralelo dentro da mesma fase.

---

## Parallel Example: Foundational

```bash
Task: "T001 [Foundational] settings.ts — lastHighlightColor/Style"
Task: "T002 [Foundational] messages.ts — chave highlightComposer.title"
```

---

## Implementation Strategy

### MVP First (User Story 1 apenas)

1. Completar Fase 1: Setup (vazia).
2. Completar Fase 2: Foundational.
3. Completar Fase 3: User Story 1.
4. **PARAR E VALIDAR**: criar um highlight pela caixa unificada, com e sem
   nota, confirmar e cancelar — editar um highlight já existente ainda usa
   o fluxo antigo (estado intermediário esperado, não é bug).

### Incremental Delivery

1. Setup + Foundational → fundação pronta.
2. User Story 1 → testar isoladamente → considerar entrega parcial (só
   criação unificada).
3. User Story 2 → testar isoladamente → feature completa.

## Notes

- `[P]` = arquivos diferentes, sem dependência.
- `[Story]` mapeia a task pra US1 ou US2.
- Commitar após cada fase ou grupo lógico coerente.
- Parar em qualquer checkpoint pra validar a story isoladamente.
- Diferente de features anteriores (014/015), esta REMOVE comportamento
  coberto por testes — escrever/ajustar o teste JUNTO da mudança de
  código correspondente, nunca numa fase de "arrumar depois" (ver R-001 de
  `plan.md`).

<!-- sdd-converge anexa "## Phase N: Convergence" abaixo desta linha -->
