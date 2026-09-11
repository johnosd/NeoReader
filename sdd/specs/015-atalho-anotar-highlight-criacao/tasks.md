---
description: "Tasks de implementação: Atalho pra anotar highlight logo após criar"
---

# Tasks: Atalho pra anotar highlight logo após criar

**Input**: Documentos de design de `sdd/specs/015-atalho-anotar-highlight-criacao/`

**Prerequisites**: `plan.md`, `spec.md`, `quickstart.md`

**Organization**: Tasks agrupadas por user story pra permitir
implementação e teste independentes de cada uma.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Pode rodar em paralelo (arquivos diferentes, sem dependência)
- **[Story]**: A qual user story esta task pertence (US1)

## Path Conventions

Projeto único (React + TypeScript + Vite), sem separação backend/frontend.

- Componente compartilhado: `src/components/ui/Toast.tsx`
- Tela do leitor: `src/screens/ReaderScreen.tsx`
- i18n: `src/i18n/messages.ts`
- Testes: `src/__tests__/screens/ReaderScreen.test.tsx`

---

## Phase 1: Setup (Shared Infrastructure)

Nenhuma task de setup necessária — sem dependência nova, sem scaffolding.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Tornar `Toast` tocável (opt-in) + texto de i18n — bloqueia
a US1, que depende de ambos.

**⚠️ CRITICAL**: Nenhuma user story pode começar antes desta fase terminar.

### Implementation

- [X] T001 [Foundational] Em `src/components/ui/Toast.tsx`: adicionar
      prop opcional `onAction?: () => void` à interface `ToastProps`.
      Quando presente, envolver `children` num
      `<button type="button" onClick={onAction} className="flex-1 text-left ...">`
      em vez do `<span>` atual (mesmas classes de texto já usadas);
      quando ausente, manter o `<span>` de hoje sem mudança nenhuma. O
      elemento raiz (`<div role="status">`) não muda.
- [X] T002 [Foundational] Adicionar a chave `highlightAnnotateToast.message`
      (ex.: pt-BR "Highlight criado. Toque para anotar.", en "Highlight
      created. Tap to annotate.", es "Highlight creado. Toca para
      anotar.") nos 3 locales de `src/i18n/messages.ts`, no mesmo estilo
      do bloco `highlightNote.*` já existente (pt-BR/es sem acentos).

**Critério de Conclusão**: `Toast` aceita `onAction` sem quebrar nenhum
dos 7 usos existentes (nenhuma mudança de comportamento neles); a chave
de i18n existe nos 3 locales, pronta pra US1 consumir.

**Checkpoint**: Fundação pronta — User Story 1 pode começar.

**Registro da Fase**:

- Status: Concluída
- Feito: T001 (`Toast.tsx` ganhou prop opcional `onAction` — quando presente, envolve `children` num `<button type="button">` em vez do `<span>`; raiz `<div role="status">` inalterada), T002 (chave `highlightAnnotateToast.message` nos 3 locales de `messages.ts`)
- Testes executados: `npx tsc --noEmit` (limpo)
- Pendências: nenhuma — pronto pra User Story 1 consumir

---

## Phase 3: User Story 1 - Anotar um highlight logo depois de criá-lo (Priority: P1) 🎯 MVP

**Objetivo**: Um toast tocável aparece logo após criar um highlight;
tocando nele, `HighlightNoteSheet` abre direto associado ao highlight
recém-criado; ignorado, some sozinho sem deixar nota; um segundo
highlight criado com o toast ainda visível substitui o toast anterior.

**Independent Test**: Criar um highlight, ver o toast aparecer, tocar
nele, confirmar que o sheet abre com o highlight certo, escrever uma
nota e salvar — confirmar que a nota fica associada ao highlight certo
(indicador visual da feature 014 aparece nele).

### Testes da Fase

- [X] T003 [P] [US1] Teste: disparar `mocks.epubViewerProps.onCreateHighlight(payload)`
      (com `addHighlight` mockado via `mockResolvedValue(<id>)`) faz o
      toast aparecer na tela com o texto de `highlightAnnotateToast.message`
      — `src/__tests__/screens/ReaderScreen.test.tsx`.
- [X] T004 [P] [US1] Teste: tocar no toast abre `HighlightNoteSheet`
      vazio (placeholder, sem texto pré-preenchido), associado ao id
      retornado por `addHighlight` — mesmo arquivo.
- [X] T005 [P] [US1] Teste: salvar a nota a partir do sheet aberto pelo
      toast chama `updateHighlightNote` com o id certo e o texto digitado
      (reaproveita `mocks.updateHighlightNote` já existente) — mesmo
      arquivo.
- [X] T006 [P] [US1] Teste: cancelar a partir do sheet aberto pelo toast
      NÃO chama `updateHighlightNote` — idêntico ao cancelar pelo fluxo
      de menu já testado (FR-007) — mesmo arquivo.
- [X] T007 [P] [US1] Teste: criar um SEGUNDO highlight (2º
      `onCreateHighlight`, 2º id) enquanto o toast do primeiro ainda está
      montado substitui o toast — só um toast no DOM, referente ao 2º
      highlight (FR-005) — mesmo arquivo.
- [X] T008 [P] [US1] Teste: chamar `mocks.epubViewerProps.onAnnotateHighlight`
      (fluxo de menu já existente) enquanto um toast de criação está
      visível remove o toast do DOM — mesmo arquivo.

### Implementation

- [X] T009 [US1] Em `src/screens/ReaderScreen.tsx`: novo estado
      `const [highlightAnnotateToast, setHighlightAnnotateToast] = useState<Highlight | null>(null)`,
      perto de `highlightNoteTarget`.
- [X] T010 [US1] `handleCreateHighlight` (`ReaderScreen.tsx:1038`) vira
      `async function`; troca `void addHighlight(...)` por
      `const id = await addHighlight(...)`; monta o `Highlight` completo
      (payload + `id` + `bookId` + `createdAt`, mesmo objeto que teria
      sido gravado) e chama `setHighlightAnnotateToast(highlight)`.
- [X] T011 [US1] `handleAnnotateHighlight` (`ReaderScreen.tsx:1068`)
      ganha uma linha extra: `setHighlightAnnotateToast(null)` (limpa
      qualquer toast pendente ao abrir o sheet por QUALQUER caminho).
- [X] T012 [US1] Novo handler local em `ReaderScreen.tsx` (ex.:
      `handleTapAnnotateToast`): chama
      `setHighlightNoteTarget(highlightAnnotateToast)` seguido de
      `setHighlightAnnotateToast(null)` — só roda se
      `highlightAnnotateToast` não for `null`.
- [X] T013 [US1] JSX novo em `ReaderScreen.tsx` (perto do bloco de
      `TtsFinishedToast`/outros toasts do leitor):
      `{highlightAnnotateToast && <Toast tone="info" durationMs={5500} onAction={handleTapAnnotateToast} onDismiss={() => setHighlightAnnotateToast(null)}>{t('highlightAnnotateToast.message')}</Toast>}`.

**Critério de Conclusão**: Criar um highlight sempre mostra o toast;
tocar nele abre o sheet certo; ignorar faz o toast sumir sem nota;
Cancelar a partir do toast se comporta como o fluxo de menu; um segundo
highlight criado substitui o toast do primeiro; abrir o sheet por
qualquer caminho (toast ou menu) limpa qualquer toast pendente. Todos os
testes de T003-T008 passando, mais os testes pré-existentes de
`onAnnotateHighlight`/`HighlightNoteSheet` continuando verdes (SC-003).

**Checkpoint**: User Story 1 funcional e testável isoladamente.

**Registro da Fase**:

- Status: Concluída
- Feito: `handleCreateHighlight` (`ReaderScreen.tsx`) virou `async`, aguarda o id de `addHighlight` e grava o highlight completo em `highlightAnnotateToast`; novo handler `handleTapAnnotateToast` (abre `HighlightNoteSheet` e limpa o toast); `handleAnnotateHighlight` também limpa o toast (evita ficar pairando quando o sheet abre por qualquer via); JSX novo do `<Toast onAction ...>` perto do `TtsFinishedToast`. 6 testes novos em `ReaderScreen.test.tsx` (T003-T008: toast aparece, toque abre sheet vazio, salvar grava no id certo, cancelar não grava, 2º highlight substitui o toast do 1º, abrir pelo menu limpa o toast).
- Testes executados: `npx vitest run src/__tests__/screens/ReaderScreen.test.tsx` (47/47), `npm run lint` (limpo), `npx tsc --noEmit` (limpo), `npm test` (918 passando, 2 skipped pré-existentes), `npm run build` (limpo, exit 0)
- Pendências: nenhuma — falta só a Fase Polish (validação manual via `quickstart.md`, README, backlog)

---

## Phase 4: Polish & Cross-Cutting Concerns

**Purpose**: Gates finais, validação manual, documentação.

- [X] T014 Rodar `npm run lint && npx tsc --noEmit && npm test && npm run build` limpos.
- [X] T015 Rodar `quickstart.md` num browser real (`npm run dev`) —
      cenário ponta a ponta + os 4 edge cases (ignorar, criação rápida,
      Cancelar, não regressão do fluxo de menu). Device Android é reforço
      opcional, não bloqueio (ver Estratégia de Testes em `plan.md`).
- [X] T016 Atualizar `README.md` (seção "Highlights") com um bullet
      sobre o toast de atalho pra anotar logo após criar.

### Checklist de Release

<!--
  Itens marcados pelo sdd-execute conforme cada fase fecha, mais gates
  cross-cutting da feature. Ecoa o pre-acceptance checklist da constitution.md.
-->

- [X] Fase 2 (Foundational) concluída
- [X] Fase 3 (User Story 1) concluída
- [X] `npm run lint && npx tsc --noEmit && npm test && npm run build` limpos
- [X] `quickstart.md` executado com sucesso (browser real; device opcional)
- [X] `README.md` atualizado
- [X] Backlog (`.planning/backlog.md`) atualizado para `Implementada`

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: sem dependências (vazia nesta feature).
- **Foundational (Phase 2)**: depende do Setup — BLOQUEIA a User Story 1.
- **User Story 1 (Phase 3)**: depende do Foundational.
- **Polish (Phase 4)**: depende da User Story 1 completa.

### Parallel Opportunities

- T001/T002 (Foundational) tocam arquivos diferentes — podem rodar em paralelo.
- T003-T008 (Testes da Fase 3) tocam o mesmo arquivo de teste mas
  describes/its independentes — podem ser escritos em paralelo e depois
  reunidos num único arquivo antes de rodar.

---

## Parallel Example: Foundational

```bash
Task: "T001 [Foundational] Toast.tsx — prop onAction"
Task: "T002 [Foundational] messages.ts — chave highlightAnnotateToast.message"
```

---

## Implementation Strategy

### MVP First (User Story 1 apenas)

1. Completar Fase 1: Setup (vazia).
2. Completar Fase 2: Foundational (`Toast` tocável + i18n).
3. Completar Fase 3: User Story 1.
4. **PARAR E VALIDAR**: testar User Story 1 isoladamente (`Independent Test` acima).

### Incremental Delivery

1. Setup + Foundational → fundação pronta.
2. User Story 1 → testar isoladamente → considerar entrega (é a única
   story desta feature — entrega = feature completa).

## Notes

- `[P]` = arquivos diferentes, sem dependência.
- `[Story]` mapeia a task pra User Story 1 (única story desta feature).
- Commitar após cada fase ou grupo lógico coerente.
- Parar no checkpoint da Fase 3 pra validar a story isoladamente antes
  do Polish.

<!-- sdd-converge anexa "## Phase N: Convergence" abaixo desta linha -->

## Phase 5: Convergence

**Purpose**: Fecha lacunas encontradas pelo `sdd-converge` entre a spec e o
código real (2026-09-11).

**Convergence Findings** (ver relatório completo no histórico da sessão):
`FR-001`/`FR-002`/`FR-006` desta spec descrevem o comportamento ORIGINAL do
toast (sempre aparece; abre `HighlightNoteSheet`) — a feature
`016-caixa-unificada-highlight-nota` revisou isso de propósito (toast só
aparece se a nota ficou vazia na caixa unificada; `HighlightNoteSheet` foi
substituído por `HighlightComposerSheet`, que agora também é o destino do
toque no toast). `FR-008` já estava corretamente rastreado como revertido no
`Input`/"Reverte/Supersede" de `016/spec.md`.

- [X] T017 Anotar em `sdd/specs/015-atalho-anotar-highlight-criacao/spec.md`
      que `FR-001`/`FR-002`/`FR-006` foram revisadas pela feature 016 (toast
      condicional à nota vazia; sheet renomeado pra
      `HighlightComposerSheet`) — nota curta apontando pra
      `016-caixa-unificada-highlight-nota/spec.md`, sem reescrever o resto
      do corpo.

**Registro da Fase**:

- Status: Concluída
- Feito: Nota de supersessão adicionada no topo de `spec.md` (após o `Input`)
  e uma nota curta ao final de FR-001, FR-002 e FR-006, apontando pra
  `016-caixa-unificada-highlight-nota`. Nenhuma mudança de código — achado
  puramente documental.
- Testes executados: N/A (mudança só em `spec.md`)
- Pendências: nenhuma
