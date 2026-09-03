---
description: "Tasks de implementação — Redimensionamento e recompressão de capas de EPUB no import"
---

# Tasks: Redimensionamento e recompressão de capas de EPUB no import

**Input**: Documentos de design de `sdd/specs/007-redimensionamento-capas/`

**Prerequisites**: `plan.md`, `spec.md`, `research.md` (técnica de resize,
ponto de inserção, formato, testabilidade), `quickstart.md` (verificação
manual final)

**Organization**: Tasks agrupadas por user story. US1 (import automático)
é P1/MVP; US2 (recriar capa / escolher imagem) é P2.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Pode rodar em paralelo (arquivos diferentes, sem dependência)
- **[Story]**: A qual user story esta task pertence (US1, US2)
- Incluir caminhos de arquivo exatos nas descrições

## Path Conventions

- Utilitário novo: `src/utils/imageResize.ts`
- Arquivo modificado: `src/services/BookImportService.ts`
- Testes espelhando `src/`: `src/__tests__/utils/`, `src/__tests__/services/`

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Confirmar baseline antes de qualquer código de produção. Sem
dependência nova pra instalar (Canvas API nativa — ver `research.md`
Decisão 1).

- [X] T001 Confirmar baseline: rodar `npm run lint && npm test && npx tsc --noEmit && npm run build`, anotar contagem de testes atual em `plan.md` → `Estado Atual`

**Checkpoint**: Baseline verde confirmado.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: O utilitário de redimensionamento compartilhado por US1 e
US2 — nenhuma user story pode começar antes disso.

**⚠️ CRITICAL**: Nenhuma user story pode começar antes desta fase terminar.

### Implementation

- [X] T002 Criar `src/utils/imageResize.ts` — `resizeCoverBlob(blob: Blob, maxDimension: number): Promise<Blob>`: (a) se `blob.type === 'image/svg+xml'`, retorna o blob original sem decodificar (FR-006); (b) decodifica via `createImageBitmap(blob)`; em caso de rejeição, retorna o blob original sem lançar (FR-004); (c) se `Math.max(bitmap.width, bitmap.height) <= maxDimension`, retorna o blob original sem modificação (FR-003, sem upscale); (d) caso contrário, calcula a escala, desenha num `<canvas>` do tamanho final via `drawImage`, exporta via `canvas.toBlob()` preservando o `type` original quando reencodável (`image/png`/`image/jpeg`/`image/webp`) ou caindo pra `image/jpeg` (ver `research.md` Decisão 3)

### Testes da Fase

- [X] T003 [P] `src/__tests__/utils/imageResize.test.ts` (novo): mockar `createImageBitmap`/`HTMLCanvasElement.prototype.getContext`/`toBlob` via `vi.stubGlobal`/`vi.spyOn` (jsdom não tem Canvas real — ver `research.md` Decisão 5/R-002 do `plan.md`); casos: bitmap dentro do teto → retorna o mesmo blob original (canvas não é chamado); bitmap acima do teto → escala calculada corretamente, canvas desenhado com as dimensões esperadas; `createImageBitmap` rejeita → retorna o blob original sem lançar; blob `image/svg+xml` → retorna original sem chamar `createImageBitmap`

**Critério de Conclusão**: `resizeCoverBlob` existe, compila, e tem testes
próprios passando — ainda não está plugado em `BookImportService.ts`
(isso é das próximas fases).

**Checkpoint**: Fundação pronta — user stories podem começar.

**Registro da Fase**:

- Status: Concluído
- Feito: `src/utils/imageResize.ts` criado (`resizeCoverBlob`) — pula SVG, decodifica via `createImageBitmap`, sem upscale, redimensiona via canvas preservando proporção, formato de saída preserva o original quando reencodável (senão cai pra JPEG), nunca lança (fallback pro blob original em qualquer falha).
- Testes executados: `npx vitest run src/__tests__/utils/imageResize.test.ts` (5/5 passed — dentro do teto sem upscale, redimensiona com proporção correta, fallback de formato pra JPEG, `createImageBitmap` rejeita sem lançar, SVG não decodificado) · `npm run lint` (limpo) · `npx tsc --noEmit` (sem erros).
- Pendências: nenhuma.

---

## Phase 3: User Story 1 - Importar um EPUB com capa em altíssima resolução (Priority: P1) 🎯 MVP

**Objetivo**: O caminho principal de import (`BookImportService.importSingleEpubRecord`,
cobrindo tanto import web quanto nativo Android) redimensiona a capa
antes de salvá-la, sem quebrar a transação Dexie existente.

**Independent Test**: Importar um EPUB com capa de resolução muito acima
do teto (ex: simulado/mockado em teste) e confirmar que `resizeCoverBlob`
é chamado com o `coverBlob` extraído, e que seu resultado (não o blob
original) é o que chega em `saveBookCover` — entrega valor mesmo que a
US2 (recriar capa / escolher imagem) ainda não esteja implementada, já
que import automático é o caminho mais comum de entrada de capas.

### Testes da Fase

- [X] T004 [P] [US1] Em `src/__tests__/services/BookImportService.test.ts`: mockar `resizeCoverBlob` (`@/utils/imageResize`) e confirmar que é chamado com `metadata.coverBlob` **antes** de `saveBookCover` no fluxo de `importSingleEpubRecord` (import web e nativo), e que o resultado de `resizeCoverBlob` — não o `coverBlob` original — é o argumento passado pra `saveBookCover`

### Implementation

- [X] T005 [US1] Em `src/services/BookImportService.ts` (`importSingleEpubRecord`, ~linha 693-758): após obter `metadata` (linha ~699) e **antes** de abrir `db.transaction(...)` (linha ~715), se `metadata.coverBlob` existir, substituí-lo pelo resultado de `await resizeCoverBlob(metadata.coverBlob, 2000)` — nunca dentro da transação (R-001 do `plan.md`, motivo Dexie)

**Critério de Conclusão**: importar um EPUB com capa grande (verificado
manualmente via `quickstart.md` passo 1) salva uma capa com dimensão
máxima de 2000px, sem quebrar o import; capas já dentro do teto não sofrem
upscale; FR-001 a FR-004 e FR-006 cobertos pra este caminho.

**Checkpoint**: User Story 1 funcional e testável isoladamente — pode
virar MVP mesmo sem US2.

**Registro da Fase**:

- Status: Concluído
- Feito: `importSingleEpubRecord` resolve `resizedCoverBlob` (via `resizeCoverBlob`) logo após obter `metadata`, **antes** de `db.transaction(...)` abrir — cobre import web e nativo Android, já que ambos convergem pra `metadata.coverBlob` nesse ponto. Diagnóstico `cover-save-start` atualizado pra logar tipo/tamanho da capa já redimensionada, não da original.
- Testes executados: `npx vitest run src/__tests__/services/BookImportService.test.ts` (22/22 passed, 3 novos) · `npm run lint` (limpo) · `npx tsc --noEmit` (sem erros).
- Pendências: nenhuma.

---

## Phase 4: User Story 2 - Recriar capa ou escolher imagem manualmente (Priority: P2)

**Objetivo**: As ações "Recriar capa" (`reextractCover`) e "Escolher
imagem" (`updateManualCover`) aplicam o mesmo redimensionamento da US1,
incluindo fotos de celular vindas da galeria.

**Independent Test**: Mockar `resizeCoverBlob` e confirmar que
`reextractCover`/`updateManualCover` chamam com o `coverBlob` correto
antes de `saveBookCover`, cada uma isoladamente — entrega valor
incremental sobre a US1, reaproveitando o mesmo utilitário da Fase 2.

### Testes da Fase

- [X] T006 [P] [US2] Em `src/__tests__/services/BookImportService.test.ts`: confirmar que `reextractCover` chama `resizeCoverBlob` com o `coverBlob` extraído antes de `saveBookCover`, e que o resultado (não o original) é o argumento passado
- [X] T007 [P] [US2] Em `src/__tests__/services/BookImportService.test.ts`: confirmar que `updateManualCover` chama `resizeCoverBlob` com o `coverBlob` recebido antes de `saveBookCover`, e que o resultado (não o original) é o argumento passado

### Implementation

- [X] T008 [US2] Em `src/services/BookImportService.ts` (`reextractCover`, ~linha 628-638): antes de `saveBookCover` (linha ~634), substituir `metadata.coverBlob` pelo resultado de `await resizeCoverBlob(metadata.coverBlob, 2000)`
- [X] T009 [US2] Em `src/services/BookImportService.ts` (`updateManualCover`, ~linha 640-642): antes de `saveBookCover` (linha ~641), substituir `coverBlob` pelo resultado de `await resizeCoverBlob(coverBlob, 2000)`

**Critério de Conclusão**: "Recriar capa" e "Escolher imagem" (verificado
manualmente via `quickstart.md` passos 4-5, incluindo uma foto de
celular de alta resolução) salvam capas dentro do mesmo teto de 2000px;
FR-001 a FR-004 cobertos pras duas ações.

**Checkpoint**: User Story 2 funcional e testável isoladamente,
consistente com o teto da User Story 1.

**Registro da Fase**:

- Status: Concluído
- Feito: `reextractCover` e `updateManualCover` chamam `resizeCoverBlob(coverBlob, 2000)` antes de `saveBookCover` — nenhuma das duas está dentro de transação Dexie, então o resize acontece direto antes da chamada.
- Testes executados: `npx vitest run src/__tests__/services/BookImportService.test.ts` (22/22 passed, incluindo os 2 novos desta fase) · `npm run lint` (limpo) · `npx tsc --noEmit` (sem erros).
- Pendências: nenhuma.

---

## Phase 5: Polish & Cross-Cutting Concerns

**Purpose**: Validação final ponta a ponta e checagens cross-cutting da
constitution.

- [X] T010 Rodar `quickstart.md` completo — import com capa grande, "Escolher imagem" com foto de alta resolução, "Recriar capa", conferindo exibição em `HeroBanner`/grid da Biblioteca em viewport largo (achado da spec) e os edge cases de fallback SVG/sem upscale
- [X] T011 Revisar os comentários curtos exigidos pelo Constitution Check (`plan.md`): por que o resize acontece antes da transação Dexie, por que SVG é pulado sem decodificar, por que só um `createImageBitmap`, por que o fallback de formato é JPEG
- [X] T012 Checagens finais: `npm run lint && npm test && npx tsc --noEmit && npm run build`

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
- [X] `quickstart.md` executado com sucesso — Playwright MCP (import real de EPUB do corpus `debug-books/`, `resizeCoverBlob` testado diretamente no console com imagem sintética 4000×6000 → 1333×2000, casos de sem-upscale/SVG/blob corrompido confirmados em Canvas real, 0 erros de console)

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: sem dependências
- **Foundational (Phase 2)**: depende do Setup — BLOQUEIA as duas user stories (ambas usam `resizeCoverBlob`)
- **User Story 1 (Phase 3)**: depende do Foundational; pode fechar como MVP sozinha
- **User Story 2 (Phase 4)**: depende do Foundational; não depende de US1 estar "fechada" (funções diferentes no mesmo arquivo), mas roda naturalmente depois já que ambas tocam `BookImportService.ts`
- **Polish (Phase 5)**: depende de US1 e US2 estarem completas

### Parallel Opportunities

- T003 (testes do utilitário) pode ser escrito em paralelo à finalização de T002, já que define o contrato esperado
- T006 e T007 (testes de US2) podem rodar em paralelo entre si — funções diferentes (`reextractCover`/`updateManualCover`)

---

## Implementation Strategy

### MVP First (User Story 1 apenas)

1. Completar Fase 1: Setup (baseline verde)
2. Completar Fase 2: Foundational (`resizeCoverBlob`, testado isoladamente)
3. Completar Fase 3: User Story 1 (import automático)
4. **PARAR E VALIDAR**: rodar `quickstart.md` passo 1 (import com capa grande), confirmar dimensão salva antes de seguir pra US2

### Incremental Delivery

1. Setup + Foundational → fundação pronta
2. User Story 1 (import automático) → testar isoladamente → considerar entrega (MVP, cobre o caminho mais comum)
3. User Story 2 (recriar capa / escolher imagem) → testar isoladamente → entrega completa da feature
4. Polish → `quickstart.md` completo + checagens finais

## Notes

- `[P]` = arquivos diferentes ou testes independentes, sem dependência
- `[Story]` mapeia a task pra uma user story específica (US1, US2)
- Commitar após cada task ou grupo lógico coerente
- Parar em qualquer checkpoint pra validar a story isoladamente
- Nenhuma task desta lista deve migrar/reprocessar capas já salvas — forward-only (FR-005)

<!-- sdd-converge anexa "## Phase N: Convergence" abaixo desta linha -->
