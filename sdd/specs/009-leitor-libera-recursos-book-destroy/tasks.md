---
description: "Lista de tasks para: Liberar recursos do leitor EPUB ao trocar de livro"
---

# Tasks: Liberar recursos do leitor EPUB ao trocar de livro

**Input**: Documentos de design de `sdd/specs/009-leitor-libera-recursos-book-destroy/`

**Prerequisites**: plan.md, spec.md, quickstart.md

**Organization**: Feature de story única (P1) — sem P2/P3, conforme escopo decidido na spec (Fora de Escopo exclui a mitigação de eviction "pra trás").

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Pode rodar em paralelo (arquivos diferentes, sem dependência)
- **[Story]**: A qual user story esta task pertence (US1)
- Caminhos de arquivo exatos incluídos em cada descrição

## Path Conventions

- Projeto único (React + TypeScript + Vite), sem separação backend/frontend.
- Componente do leitor: `src/components/reader/EpubViewer.tsx`.
- Tipos de terceiro sem tipagem nativa: `src/types/foliate.d.ts`.
- Testes espelham `src/` em `src/__tests__/` — mock global compartilhado em `src/__tests__/setup.ts`, teste do componente em `src/__tests__/components/EpubViewer.test.tsx`.

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Confirmar baseline limpo antes de qualquer mudança.

- [X] T001 Rodar `npm run lint && npm test && npm run build` e confirmar que passam antes de qualquer alteração — baseline pra garantir que qualquer falha depois da Fase 2 é da feature, não preexistente.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Tipo e mock precisam existir antes de qualquer implementação/teste da User Story 1.

**⚠️ CRITICAL**: T006 (implementação) e T004/T005 (testes) não compilam/passam sem T002 e T003.

- [X] T002 [P] Adicionar `destroy?(): void` à interface do `book` em `src/types/foliate.d.ts` (dentro de `View.book`, ~linhas 40-49) — reflete a API real de `EPUB.destroy()` em `node_modules/foliate-js/epub.js:1220-1222`, opcional porque é uma declaração manual de tipos de terceiro.
- [X] T003 [P] Adicionar `destroy = vi.fn()` ao objeto `book` do `FoliateViewMock` em `src/__tests__/setup.ts` (~linhas 127-140), no mesmo padrão dos demais métodos mockados da classe (ex: `close = vi.fn()` na linha 68).

**Checkpoint**: Tipo e mock prontos — User Story 1 pode começar.

---

## Phase 3: User Story 1 - Memória do leitor não acumula ao trocar de livro (Priority: P1) 🎯 MVP

**Objetivo**: Ao sair do leitor ou trocar de livro, os recursos (blob URLs de imagens/fontes/CSS) do livro fechado são liberados — não ficam retidos na memória do app.

**Independent Test**: Abrir um livro, trocar para outro (ou sair do leitor), e confirmar via teste automatizado que a instância anterior teve seus recursos liberados; opcionalmente confirmar em device real que blob URLs não se acumulam a cada troca (`quickstart.md`).

### Testes da Fase

- [X] T004 [P] [US1] Em `src/__tests__/components/EpubViewer.test.tsx`: teste que renderiza o `EpubViewer` com um `book.id`, guarda a referência ao `foliate-view` mockado, faz rerender com um `book.id` diferente, e confirma que `book.destroy` da instância **anterior** foi chamado (cobre FR-002/SC-002 — troca de livro).
- [X] T005 [P] [US1] Em `src/__tests__/components/EpubViewer.test.tsx`: teste que renderiza o `EpubViewer`, desmonta o componente (`unmount()`), e confirma que `book.destroy` da instância ativa foi chamado (cobre FR-001/SC-001 — saída do leitor).

### Implementation

- [X] T006 [US1] Em `src/components/reader/EpubViewer.tsx`, no cleanup do `useEffect` principal (~linha 3257, logo após `view?.close()` e antes de `view?.remove()`), adicionar `view?.book?.destroy?.()` com um comentário curto explicando que `view.close()` do foliate-js não libera os recursos do `book` (blob URLs) por conta própria — gap confirmado por leitura do vendor code na assessment de origem (Constitution II: comentário só onde o "porquê" não é óbvio). Optional chaining cobre FR-003 (book pode não existir ainda) sem guarda adicional; a idempotência de FR-004 vem de `URL.revokeObjectURL` ser um no-op seguro em URL já revogada (R-002 em `plan.md` — não coberto por teste dedicado, garantido pela forma do código).

**Critério de Conclusão**: T004 e T005 passam contra a implementação de T006 (não contra stubs); `npx vitest run src/__tests__/components/EpubViewer.test.tsx` verde; nenhuma mudança de comportamento visível na leitura (FR-005) — confirmado manualmente via `quickstart.md` na Fase 4.

**Checkpoint**: User Story 1 completa e testável isoladamente — é a única story desta feature (MVP = feature completa).

**Registro da Fase**:

- Status: Concluída
- Feito: T004/T005 escritos primeiro (confirmado que falhavam sem a implementação — `book.destroy` chamado 0 vezes); T006 implementado (`view?.book?.destroy?.()` no cleanup de `EpubViewer.tsx:3257-3260`, com comentário explicando o gap do vendor code).
- Testes executados: `npx vitest run src/__tests__/components/EpubViewer.test.tsx` → 76 passed (76), incluindo os 2 novos casos.
- Pendências: nenhuma.

---

## Phase 4: Polish & Cross-Cutting Concerns

**Purpose**: Validação final de suíte completa e verificação manual exigida pela constitution para mudanças de UI/frontend.

- [X] T007 Rodar a suíte completa: `npm run lint && npm test && npm run build` — confirmar zero regressão em qualquer teste existente de `EpubViewer` ou de telas que o consomem (ex: `ReaderScreen`).
- [X] T008 Executar o cenário manual ponta a ponta de `quickstart.md` (abrir livro → trocar de livro → sair do leitor, repetido algumas vezes) em browser real ou device Android — obrigatório pela constitution antes de reportar a feature como concluída.
- [X] T009 [OPCIONAL, PULADO] Verificação de memória via DevTools/profiler (SC-004) não executada nesta sessão — coberta parcialmente pelo roteiro real do T008 (device físico, 5+ ciclos de abrir/trocar/sair sem erro), decisão já registrada como não-bloqueante em `plan.md`/`spec.md`; medição formal de heap fica como follow-up opcional futuro, não bloqueia o fechamento da feature.

### Checklist de Release

- [X] Fase 3 (User Story 1) concluída
- [X] `npm run lint && npm test && npm run build` passam sem erro
- [X] Cenário manual de `quickstart.md` executado em browser real ou device Android
- [X] Verificação de memória (SC-004) executada ou explicitamente registrada como pulada (não bloqueante)

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: sem dependências.
- **Foundational (Phase 2)**: depende do Setup — BLOQUEIA a User Story 1 (T002/T003 antes de T004/T005/T006).
- **User Story 1 (Phase 3)**: depende do Foundational; é a única story, não há paralelismo entre stories nesta feature.
- **Polish (Phase 4)**: depende da User Story 1 completa.

### Parallel Opportunities

- T002 e T003 (Phase 2) podem rodar em paralelo — arquivos diferentes, sem dependência entre si.
- T004 e T005 (Phase 3) podem rodar em paralelo — ambos são testes novos no mesmo arquivo, mas descrevem cenários independentes (podem ser escritos em paralelo antes de rodar; a suíte roda sequencialmente por padrão do Vitest, o que não impede a escrita paralela).

---

## Parallel Example: Phase 2

```bash
# T002 e T003 podem ser feitas juntas
Task: "T002 [P] Adicionar destroy?(): void em src/types/foliate.d.ts"
Task: "T003 [P] Adicionar destroy = vi.fn() em src/__tests__/setup.ts"
```

---

## Implementation Strategy

### MVP First (única story)

1. Completar Fase 1: Setup (baseline).
2. Completar Fase 2: Foundational (tipo + mock).
3. Completar Fase 3: User Story 1 (testes + implementação).
4. **PARAR E VALIDAR**: rodar `quickstart.md` manualmente.
5. Completar Fase 4: Polish (suíte completa + checklist de release).

### Incremental Delivery

Não aplicável de forma incremental — feature é pequena o suficiente para entregar como uma unidade única (Setup → Foundational → US1 → Polish), sem quebra em entregas parciais.

## Notes

- `[P]` = arquivos diferentes, sem dependência.
- `[Story]` mapeia a task pra US1 (única story desta feature).
- Commitar após cada task ou grupo lógico coerente (ex: T002+T003 juntas, T004+T005+T006 juntas).
- Parar no checkpoint da Fase 3 pra validar a story isoladamente antes do Polish.

<!-- sdd-converge anexa "## Phase N: Convergence" abaixo desta linha -->
