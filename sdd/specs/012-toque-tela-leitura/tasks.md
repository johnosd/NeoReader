---
description: "Tasks de implementação: Controle de toque na tela de leitura"
---

# Tasks: Controle de toque na tela de leitura

**Input**: Documentos de design de `sdd/specs/012-toque-tela-leitura/`

**Prerequisites**: `plan.md`, `spec.md`, `quickstart.md`

**Organization**: Tasks agrupadas por user story pra permitir implementação e teste independentes de cada uma.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Pode rodar em paralelo (arquivos diferentes, sem dependência)
- **[Story]**: A qual user story esta task pertence (US1, US2)

## Path Conventions

Projeto único (React + TypeScript + Vite), sem separação backend/frontend.

- Componentes do leitor: `src/components/reader/`
- Componentes de Settings: `src/components/settings/`
- Telas: `src/screens/`
- i18n: `src/i18n/messages.ts`
- Testes espelham `src/` em `src/__tests__/` (`components/`, `screens/`)

---

## Phase 1: Setup (Shared Infrastructure)

Nenhuma task de setup necessária — a feature reaproveita infraestrutura
já existente (foliate-js, provider de i18n local, harness de teste de
`EpubViewer.test.tsx`). Nenhuma dependência nova, nenhum scaffolding.

---

## Phase 2: Foundational (Blocking Prerequisites)

Nenhuma infraestrutura compartilhada bloqueia as duas user stories — US1
(zona de índice) e US2 (diagrama) são completamente independentes entre
si (arquivos diferentes, sem dependência de código). Pular direto pras
fases de user story.

---

## Phase 3: User Story 1 - Abrir o índice tocando a borda esquerda (Priority: P1) 🎯 MVP

**Objetivo**: Tocar na faixa esquerda da tela de leitura abre o índice
(TOC) diretamente, sem passar pelo menu primeiro.

**Independent Test**: Abrir qualquer livro, tocar a faixa esquerda
(região central verticalmente) e confirmar que o painel de índice abre —
testável sem a User Story 2 existir.

> **Nota de pivot (2026-09-10)**: T001 era originalmente um spike pra
> escolher entre duas semânticas de *navegação* (pular capítulo vs.
> rolar viewport). O spike rodou, funcionou tecnicamente, mas o usuário
> decidiu que a ação da zona deveria ser **abrir o índice**, não navegar
> — ver `plan.md` R-001 e `spec.md` Clarifications (sessão de
> continuação) para o histórico completo. T002-T005 abaixo já refletem
> a implementação final (abrir índice), não o spike descartado.

### Spike de Decisão (bloqueava o resto da fase — resolvido)

- [X] T001 [US1] **Checkpoint com o usuário**: prototipado e testado no
      device Android real. Resultado: usuário rejeitou a premissa de
      "navegar capítulo" e pediu pra trocar a ação por "abrir o índice".
      Decisão registrada em `plan.md` → R-001 e `spec.md` →
      Clarifications; marcador `[NEEDS CLARIFICATION]` removido de
      `spec.md`.

### Implementation

- [X] T002 [US1] ~~Extrair lógica de `prevToEnd()`~~ — **revertido**: a
      extração (`navigateToPreviousSection()`) foi desfeita depois do
      pivot; `prevToEnd()` voltou ao corpo original em
      `src/components/reader/EpubViewer.tsx`, sem chamador novo (não é
      mais reaproveitada por esta feature).
- [X] T003 [US1] Adicionadas em `src/components/reader/EpubViewer.tsx`
      as constantes `LEFT_TOC_TAP_ZONE_MIN_PX`/`MAX_PX` e a função
      `isLeftTocTapZone(ev, doc, physical)`, espelhando o padrão de
      `isRightChromeTapZone`/`isVisibleChromeTapZone` — zona limitada à
      faixa vertical entre as zonas de chrome de topo e rodapé.
- [X] T004 [US1] Nova prop `onOpenToc: () => void` em `EpubViewerProps`
      (`src/components/reader/EpubViewer.tsx`), sincronizada via
      `useSyncRef` (`onOpenTocRef`) e chamada no tap handler quando
      `isLeftTocTapZone` bate e `!tapHitsReadableText` — inserida na
      mesma posição das checagens de chrome-zone (antes do branch de
      TTS ativo). Em `src/screens/ReaderScreen.tsx`, extraído
      `handleOpenToc` (reaproveitado tanto por `onTocOpen` do
      `ReaderChrome` quanto por `onOpenToc` do `EpubViewer`) — mesmo
      handler, dois pontos de entrada.

### Testes da Fase

- [X] T005 [P] [US1] Testes em `src/__tests__/components/EpubViewer.test.tsx`
      (describe `EpubViewer — zona de atalho pro índice`):
      - Tap na faixa esquerda abre o índice (`onOpenToc`), sem chamar `onTranslate`/`onCenterTap`/`goTo`.
      - Tap na faixa esquerda abre o índice independente da seção atual (testado na última seção do livro).
      - Tap na faixa esquerda abre o índice mesmo com TTS ativo (`ttsGlobalActive=true`).
      - Tap no canto superior-esquerdo e no canto inferior-esquerdo continua abrindo/fechando o chrome (`onCenterTap`), não abre o índice.
      - Tap em parágrafo perto da borda esquerda continua chamando `onTranslate`, nunca abre o índice.
      - Suite completa de `EpubViewer.test.tsx` (108→ agora com as 6 novas) e `ReaderScreen.test.tsx` — 142 testes, 100% passando, zero regressão.

**Critério de Conclusão**: Usuário consegue abrir o índice tocando a
faixa esquerda em qualquer ponto do livro, sem regressão nas zonas de
chrome/tradução/TTS já existentes. **Validado no device real pelo
usuário em 2026-09-10** ("funcionou bem, gostei").

**Checkpoint**: User Story 1 funcional e testável isoladamente (não
depende da User Story 2). **Concluído.**

**Registro da Fase**:

- Status: Concluída
- Feito: T001 (spike + pivot pra "abrir índice"), T002 (revert do spike de navegação), T003 (geometria da zona `isLeftTocTapZone`), T004 (prop `onOpenToc` + wiring em `ReaderScreen.tsx` reaproveitando `handleOpenToc`), T005 (6 testes novos)
- Testes executados: `npx tsc --noEmit` (limpo), `npx vitest run src/__tests__/components/EpubViewer.test.tsx src/__tests__/screens/ReaderScreen.test.tsx` (142 passando), `npm run build` (limpo), validação manual em device real (SM-S911B) confirmada pelo usuário
- Pendências: nenhuma para esta story — `npm run lint`/`npm test` completos e o Checklist de Release ficam pra Fase Polish (T010-T011)

---

## Phase 4: User Story 2 - Visualizar o mapa de zonas de toque do leitor (Priority: P2)

**Objetivo**: Settings > Aparência mostra um diagrama read-only
descrevendo o que cada zona de toque da tela de leitura faz.

**Independent Test**: Abrir Settings > Aparência e conferir que o
diagrama e a legenda descrevem corretamente as zonas ativas — testável
mesmo que a User Story 1 ainda não tenha sido implementada (documentaria
só as 3 zonas hoje existentes nesse caso hipotético; como ambas serão
feitas na mesma rodada, o diagrama final reflete as 4 zonas incluindo a
nova borda esquerda).

### Implementation

- [ ] T006 [P] [US2] Criar `src/components/settings/TouchZonesDiagram.tsx`
      — componente somente-leitura, sem `onClick`/handlers de ação, com
      um diagrama simples (blocos CSS ou SVG inline) representando a
      tela de leitura com as 4 zonas marcadas (topo/rodapé/direita =
      menu, centro/texto = tradução, borda esquerda = abrir índice) e
      uma legenda ao lado, recebendo os textos via props
      (sem chamar `useI18n` internamente, pra manter "um arquivo = uma
      responsabilidade" e facilitar teste isolado).
- [ ] T007 [US2] Adicionar as novas chaves de i18n
      (`settings.appearance.touchZones.*` — título da seção, descrição,
      e um rótulo por zona) nos 3 locales de `src/i18n/messages.ts`
      (pt-BR, en, es), seguindo o padrão alfabético já usado nas outras
      chaves `settings.appearance.*`.
- [ ] T008 [US2] Integrar `TouchZonesDiagram` em
      `src/screens/SettingsAppearanceScreen.tsx`, dentro de um novo
      `SettingBlock`/`SettingsGroup` (mesmo padrão dos outros blocos da
      tela), passando os textos traduzidos via `t(...)`.

### Testes da Fase

- [ ] T009 [P] [US2] Teste em `src/__tests__/screens/SettingsAppearanceScreen.test.tsx`:
      - A seção do mapa de zonas renderiza a legenda das 4 zonas (`getByText` nos rótulos esperados).
      - Clicar em qualquer parte do diagrama não chama `updateReaderDefaults`/`updateAppSettings` nem dispara nenhuma navegação.
      - (Opcional, se o padrão de teste de i18n do projeto permitir facilmente) legenda muda conforme o locale mockado.

**Critério de Conclusão**: Usuário abre Settings > Aparência e vê um
diagrama read-only descrevendo corretamente as 4 zonas de toque ativas,
traduzido nos 3 idiomas suportados, sem nenhuma ação executável a partir
dele.

**Checkpoint**: User Story 2 funcional e testável isoladamente.

**Registro da Fase**:

- Status: (vazio — preenchido pelo sdd-execute ao fechar o checkpoint)
- Feito:
- Testes executados:
- Pendências:

---

## Phase 5: Polish & Cross-Cutting Concerns

**Purpose**: Validação final cross-cutting, cobrindo os gates da
constitution e o `quickstart.md`.

- [ ] T010 Rodar `npm run lint && npm test && npx tsc --noEmit && npm run build` — Constitution IV ("build limpo é a definição de pronto").
- [ ] T011 Executar o cenário ponta a ponta de `quickstart.md` num device Android real (todos os 11 passos, incluindo os 3 idiomas).
- [ ] T012 Conferir se `README.md` já documenta os gestos de toque do leitor; se sim, atualizar a menção incluindo a nova zona esquerda (se não houver menção prévia, não é necessário criar uma seção nova só por causa desta feature).

### Checklist de Release

- [ ] Fase User Story 1 concluída (T001-T005)
- [ ] Fase User Story 2 concluída (T006-T009)
- [ ] Semântica do gesto decidida e documentada (R-001 resolvido, sem `[NEEDS CLARIFICATION]` remanescente em `spec.md`)
- [ ] `npm run lint && npm test && npx tsc --noEmit && npm run build` passando
- [ ] Validado em device Android real (`quickstart.md` completo)
- [ ] Nenhuma regressão nos testes existentes de tap (tradução, chrome-zone, bookmark, highlight, TTS-tap)

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: nenhuma task — sem dependências.
- **Foundational (Phase 2)**: nenhuma task — não bloqueia nada.
- **User Story 1 (Phase 3)**: bloqueada internamente por T001 (spike/checkpoint com o usuário) antes de T002-T005. Independente da User Story 2.
- **User Story 2 (Phase 4)**: independente da User Story 1 — pode rodar em paralelo ou antes/depois.
- **Polish (Phase 5)**: depende de ambas as user stories desejadas estarem completas.

### Parallel Opportunities

- T006 (US2) pode começar em paralelo com qualquer task de US1 — arquivos diferentes, sem dependência.
- T005 e T009 (testes de fase) rodam em paralelo entre si — arquivos de teste diferentes.

---

## Implementation Strategy

### MVP First (User Story 1 apenas)

1. Completar T001 (spike, aguardando decisão do usuário).
2. Completar T002-T004 (implementação).
3. Completar T005 (testes).
4. **PARAR E VALIDAR**: testar User Story 1 isoladamente no device (passos 1-7 de `quickstart.md`).

### Incremental Delivery

1. User Story 1 → testar isoladamente → considerar entrega (MVP funcional: atalho de índice por toque).
2. User Story 2 → testar isoladamente → entrega o mapa visual, sem quebrar a User Story 1.
3. Polish → gates de build/lint/testes + validação manual completa.

## Notes

- `[P]` = arquivos diferentes, sem dependência.
- `[Story]` mapeia a task pra uma user story específica.
- Commitar após cada task ou grupo lógico coerente.
- T001 é um checkpoint real de decisão do usuário, não uma task técnica comum — não prosseguir pras tasks seguintes da Fase 3 sem essa decisão registrada.

<!-- sdd-converge anexa "## Phase N: Convergence" abaixo desta linha -->
