---
description: "Template de lista de tasks para implementação de feature"
---

# Tasks: Buffer e Lookahead de TTS na língua nativa

**Input**: Documentos de design de `sdd/specs/020-tts-buffer-lookahead/`

**Prerequisites**: plan.md (obrigatório), spec.md (obrigatório para user stories)

**Organization**: Tasks agrupadas por user story pra permitir implementação e teste independentes de cada uma.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Pode rodar em paralelo (arquivos diferentes, sem dependência)
- **[Story]**: A qual user story esta task pertence (ex: US1, US2)
- Incluir caminhos de arquivo exatos nas descrições

## Path Conventions

- Código do leitor TTS: `src/hooks/useTTS.ts`
- Testes do TTS: `src/__tests__/hooks/useTTS.test.tsx`

---

## Phase 1: Foundational (Abort Signal no Prefetch)

**Purpose**: Infraestrutura básica que permite abortar prefetches e controlar retries, antes de ampliarmos o tamanho da fila.

**⚠️ CRITICAL**: Nenhuma user story pode começar antes desta fase terminar.

### Goal
Preparar o `prefetchPremiumChunk` para aceitar um `AbortSignal` e garantir que seja interrompido caso o usuário efetue pule/pare a reprodução.

### Implementation

- [x] T001 [US3] Atualizar a tipagem de `prefetchPremiumChunk` em `src/hooks/useTTS.ts` para receber e utilizar o `AbortSignal`.
- [x] T002 [US3] Adicionar um novo `AbortController` global (`prefetchAbortControllerRef`) em `useTTS.ts` e despachá-lo no `stop()` e ao iniciar um novo `play()`.
- [x] T003 [US2] Implementar lógica simples de retentativa (ex: 1 retry com backoff) dentro de `prefetchPremiumChunk` capturando erros de rede silenciosamente.

### Tests

- [x] T004 Verifique em `src/__tests__/hooks/useTTS.test.tsx` se a limpeza (stop) aciona o aborto do sinal passado ao prefetch.

**Critério de Conclusão**: `prefetchPremiumChunk` propaga sinal de cancelamento, retenta silenciosamente em caso de erro de rede, e cancela downloads pendentes se a reprodução sofrer `stop`.

**Checkpoint**: Fundação pronta - user stories podem começar.

**Registro da Fase**:

- Status: Concluída
- Feito: T001 a T004 implementadas e validadas. `AbortController` e retry de prefetch foram adicionados a `useTTS.ts`.
- Testes executados: `npm test src/__tests__/hooks/useTTS.test.tsx` (24 testes rodados, 24 passaram).
- Pendências: Nenhuma.

---

## Phase 2: User Story 1 - Leitura sem gaps (Priority: P1) 🎯 MVP

**Objetivo**: Expandir o número de blocos (frases) carregados proativamente.

**Independent Test**: Pode ser verificado manualmente ativando logs e percebendo os requests disparando antes para N+1, N+2 e N+3.

### Testes da Fase

- [x] T005 [P] [US1] Adicionar testes unitários garantindo que o lookahead é chamado sequencialmente para os 3 chunks à frente em `src/__tests__/hooks/useTTS.test.tsx`.

### Implementation

- [x] T006 [P] [US1] Modificar o trecho "Lookahead" dentro do loop `play` em `src/hooks/useTTS.ts` para agendar `prefetchPremiumChunk` para `chunks[index + 1]`, `chunks[index + 2]` e `chunks[index + 3]` concorrentemente, em vez de apenas `index + 1`.

**Critério de Conclusão**: O app dispara downloads simultâneos ou enfileirados para as 3 próximas frases durante a reprodução da atual, garantindo abastecimento do cache e sem travamentos.

**Checkpoint**: User Story 1 funcional. O buffer preenche em background adiantado.

**Registro da Fase**:

- Status: Concluída
- Feito: T005 e T006 implementadas e validadas. O loop `play` agora agenda `prefetchPremiumChunk` para `chunks[index + 1]`, `chunks[index + 2]` e `chunks[index + 3]` concorrentemente, e o teste cobre que os 3 chunks à frente são pré-sintetizados (e o 4º não).
- Testes executados: `npx vitest run src/__tests__/hooks/useTTS.test.tsx` (25 testes rodados, 25 passaram) e `npm run build` (passou).
- Pendências: Nenhuma.

---

## Phase 3: Polish & Cross-Cutting Concerns

**Purpose**: Verificações finais e build limpo.

- [x] T007 Limpeza de logs inseridos para depuração, se houver.
- [x] T008 Rodar build completo para capturar regressões de typescript.

### Checklist de Release

- [x] Fase 1 e 2 concluídas.
- [ ] Comportamento de seek devidamente esvaziando o buffer avaliado em device real ou mock (User Story 3).
- [x] Testes unitários do hook passando integralmente sem "Unhandled Promise Rejections" e `npm run build` passando limpo.

---

## Dependencies & Execution Order

### Phase Dependencies

- **Foundational (Phase 1)**: sem dependências — BLOQUEIA a User Story 1.
- **User Stories (Phase 2)**: dependem do Foundational.
- **Polish (fase final)**: depende de todas as user stories estarem completas.

