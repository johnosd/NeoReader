---
description: "Tasks de implementação: Indicador visual de anotação em highlights com preview flutuante"
---

# Tasks: Indicador visual de anotação em highlights com preview flutuante

**Input**: Documentos de design de `sdd/specs/014-indicador-anotacao-highlight/`

**Prerequisites**: `plan.md`, `spec.md`, `research.md`, `quickstart.md`

**Organization**: Tasks agrupadas por user story pra permitir implementação e teste independentes de cada uma.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Pode rodar em paralelo (arquivos diferentes, sem dependência)
- **[Story]**: A qual user story esta task pertence (US1, US2)

## Path Conventions

Projeto único (React + TypeScript + Vite), sem separação backend/frontend.

- Componente do leitor (única fonte de mudança): `src/components/reader/EpubViewer.tsx`
- i18n: `src/i18n/messages.ts`
- Testes: `src/__tests__/components/EpubViewer.test.tsx`

---

## Phase 1: Setup (Shared Infrastructure)

Nenhuma task de setup necessária — sem dependência nova, sem scaffolding.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: CSS compartilhado (forma da aba, caixa de preview) + texto de
i18n — bloqueia as duas user stories (US1 desenha a aba, US2 desenha a
caixa, ambas usam classes definidas aqui).

**⚠️ CRITICAL**: Nenhuma user story pode começar antes desta fase terminar.

### Implementation

- [X] T001 [Foundational] Em `buildReaderCSS` (`src/components/reader/EpubViewer.tsx`,
      mesmo bloco de template literal que já define `#nr-highlight-menu`/
      `.nr-sel-*`, por volta da linha 1246): adicionar
      `.nr-highlight-note-tab` (tamanho fixo pequeno, ex: 14×16px, forma
      distinta via `clip-path`/pseudo-elemento tipo "cantinho dobrado" —
      não só `background-color` sólida, conforme FR-003; `position:
      absolute`; cor amarela de referência fixa, igual em tema claro e
      escuro), `#nr-highlight-note-tabs` (container, `position: relative`
      não necessário se os filhos já forem `position: absolute` com
      coordenadas próprias), `#nr-highlight-note-preview` (mesma receita
      visual de `#nr-highlight-menu`: borda, `border-radius`, sombra,
      fundo amarelo em vez do `translationSurface`) e
      `#nr-highlight-note-preview[hidden] { display: none !important; }`,
      `.nr-note-preview-text` (`max-height` fixo, ex: `240px`,
      `overflow-y: auto`, sem truncar — FR-005).
- [X] T002 [Foundational] Adicionar a chave de i18n
      `reader.highlightMenu.noteIndicatorLabel` (aria-label da aba, ex:
      "Ver anotação" / "View annotation" / "Ver anotación") nos 3 locales
      de `src/i18n/messages.ts`, no bloco `reader.*` (seguir a convenção
      local desse bloco: pt-BR/es sem acentos, en normal).

**Critério de Conclusão**: Classes CSS e chave de i18n existem, prontas
pras duas user stories consumirem — nenhum comportamento novo ainda
(nenhum elemento é criado/posicionado nesta fase).

**Checkpoint**: Fundação pronta — user stories podem começar.

**Registro da Fase**:

- Status: Concluída
- Feito: T001 (CSS de `.nr-highlight-note-tab` — forma de fita/cantinho dobrado via `clip-path`, cor amarela fixa `#facc15`, 12×16px — e `#nr-highlight-note-preview`/`.nr-note-preview-text` — caixa amarela `#fef9c3` com `overflow-y: auto`, sem palette do tema, `EpubViewer.tsx:1256-1293`), T002 (chave `reader.highlightMenu.noteIndicatorLabel` nos 3 locales de `messages.ts`)
- Testes executados: `npx tsc --noEmit` (limpo)
- Pendências: nenhuma — pronto pra User Story 1 consumir as classes

---

## Phase 3: User Story 1 - Ver rapidamente que um highlight tem anotação (Priority: P1) 🎯 MVP

**Objetivo**: Highlights com `note` preenchida exibem a aba amarela
sobreposta ao início do trecho; highlights sem nota não exibem nada.

**Independent Test**: Abrir um capítulo com um highlight com `note` e um
sem — só o primeiro mostra a aba. Editar a nota pra vazio e confirmar que
a aba some na repintura seguinte. Nenhum toque envolvido.

### Implementation

- [X] T003 [US1] Em `src/components/reader/EpubViewer.tsx`: criar
      `ensureNoteTabsContainer(doc)` (cria/retorna
      `#nr-highlight-note-tabs`, anexado ao `doc.body` — mesmo padrão de
      `ensureHighlightMenuEl`/`ensureSelectionMenuEl`) e
      `upsertNoteTab(doc, cfi, rect)` (cria ou atualiza um
      `<button class="nr-highlight-note-tab" data-nr-highlight-note-tab="{cfi}"
      aria-label="{t('reader.highlightMenu.noteIndicatorLabel')}">`
      dentro do container, posicionado via `position: absolute` +
      `top`/`left` calculados a partir do `rect` recebido — mesma
      matemática de `scrollX`/`scrollY` que `positionMenuAtRect` já usa)
      e `removeNoteTab(doc, cfi)`.
- [X] T004 [US1] Estender o handler de `draw-annotation` dentro de
      `paintHighlight` (`EpubViewer.tsx:2813-2825`): ler `e.detail.range`
      (campo já tipado em `foliate.d.ts`, não consumido até hoje — ver
      `research.md` D-002 e `plan.md` Cuidados para Retomada, confirmar
      empiricamente que vem preenchido). Buscar o highlight por `cfi` em
      `highlightsRef.current`; se `Boolean(highlight?.note)`, chamar
      `upsertNoteTab(view's doc, cfi, range.getClientRects()[0])`; senão
      `removeNoteTab(doc, cfi)`. O retry de 300ms já existente
      (`paintHighlight:2844-2847`) cobre de graça o caso do overlayer
      ainda não pronto (R-002 de `plan.md`).
- [X] T005 [US1] Em `repaintHighlightsForSection`
      (`EpubViewer.tsx:2852-2856`): depois do loop de `paintHighlight`,
      remover abas órfãs — CFIs presentes em `#nr-highlight-note-tabs`
      cujo highlight correspondente não está mais em `list` (highlight
      excluído) ou não tem mais `note` (nota removida via
      `HighlightNoteSheet`, já coberto pelo T004 na próxima repintura,
      mas um highlight EXCLUÍDO nunca dispara `paintHighlight` de novo
      pra esse CFI — precisa de remoção explícita aqui).
- [X] T005b [US1] (ad-hoc, achado do usuário revisando a US1/US2 já
      concluídas) `.nr-highlight-note-tab` cobria as primeiras letras do
      trecho destacado — a aba é appendada ao fim do `<body>` (depois do
      texto no DOM) com `position: absolute`, que por padrão pinta ACIMA
      de conteúdo não-posicionado independente da ordem no DOM. Corrigido
      com `z-index: -1` (em vez de `9997`): o texto (não-posicionado)
      passa a pintar por cima da aba, que só aparece nos vãos das letras
      — sem atrapalhar a leitura. O toque continua funcionando porque
      `getNoteTabAtPoint` já tinha um fallback por coordenada
      (`isPointInsideElement`) que não depende de qual elemento fica por
      cima visualmente. Ver `plan.md` R-004.
- [X] T005c [US1] (ad-hoc, correção do T005b — validado em device real:
      `z-index: -1` deixou a aba INVISÍVEL, não só "atrás do texto") O
      overlay SVG do próprio destaque (`Overlayer.highlight`,
      `node_modules/foliate-js/overlayer.js`) também é `position:
      absolute`/`z-index: auto` — fica "legível por baixo" por ser
      translúcido (`opacity ~0.3`), não por estar atrás em z-index. Um
      z-index negativo escondia a aba atrás DESSE overlay também (opaco
      o bastante pra cobrir por completo). Correção de verdade é de
      POSIÇÃO, não de camada: `upsertNoteTab` agora ancora a aba pelo
      rodapé, colada ACIMA do topo da linha (`rect.top -
      NOTE_TAB_HEIGHT_PX - NOTE_TAB_GAP_PX`, constantes novas perto de
      `HIGHLIGHT_STYLE_ICON`) — nunca mais sobrepõe glifo nenhum, então o
      `z-index` volta a `9997` (alto, só pra garantir visibilidade sobre
      o fundo da página nesse espaço acima da linha).
- [X] T005d [US1] (ad-hoc, refinamento visual a pedido do usuário — imagem
      de referência trazida por ele mostrando uma nota tipo post-it
      cobrindo a 1ª palavra do trecho, atrás do texto) Redesenho completo
      do visual da aba: em vez de uma tira pequena de tamanho fixo (12px)
      posicionada acima da linha (T005c), agora é um retângulo
      arredondado translúcido (`background: rgba(250, 204, 21, 0.55)`,
      `border-radius: 4px`, SEM `clip-path`) posicionado NO início do
      trecho (`rect.top`/`rect.left` diretos, de volta) com largura
      aproximando a 1ª palavra (`computeNoteTabWidth`, nova função:
      caracteres da 1ª palavra × `NOTE_TAB_CHAR_WIDTH_PX`, piso/teto
      `NOTE_TAB_MIN_WIDTH_PX`/`NOTE_TAB_MAX_WIDTH_PX`) e altura igual à
      da própria linha (`rect.height`, dinâmico). A legibilidade do texto
      por cima agora vem da MESMA técnica que o próprio highlight já usa
      pra ficar legível (opacidade baixa do background, não
      posição/z-index) — ver `plan.md` R-004. `upsertNoteTab` ganhou um
      4º parâmetro (`width`); testes (T036) e o helper
      `stubRangeClientRects` atualizados pra incluir `height` no rect
      simulado.
- [X] T005e [US1] (ad-hoc, correção do T005d — device real: cores se
      misturavam no início do trecho, ver imagem do usuário) Causa: T005d
      empilhava DUAS camadas translúcidas na mesma região (a aba +
      o overlay do próprio highlight, cada um com sua própria opacidade)
      — alpha-blending de duas cores translúcidas sempre produz uma
      3ª cor (mistura), não importa o valor exato de opacidade escolhido.
      Correção de verdade: a cor do indicador agora é pintada como parte
      do MESMO desenho do overlay do highlight (`drawHighlightWithNoteIndicator`,
      nova função perto de `getOverlayerDrawFn`) — os primeiros
      `noteWidthPx` do 1º rect saem via `OverlayerCtor.highlight` com a
      cor do indicador (`NOTE_INDICATOR_COLOR_HEX`), o resto sai no draw
      function normal do highlight — dois grupos SVG adjacentes, nunca
      duas camadas sobrepostas. `.nr-highlight-note-tab` deixou de ter
      cor própria (`background: transparent`) — voltou a ser só o alvo
      de toque (US2), a cor visível vem inteiramente do overlay. Reusa
      `OverlayerCtor.highlight` (vendor) pra pintar o indicador — mesma
      opacidade padrão (`~0.3`) que qualquer highlight já usa, garantindo
      consistência visual e ZERO mistura de cor (cada pixel recebe no
      máximo UMA camada translúcida). 1 teste novo (T043b) verifica a
      divisão em 2 grupos SVG chamando o draw function de verdade (não
      só o mock).
- [X] T005f [US1] (ad-hoc, polimento visual a pedido do usuário — "o
      amarelo parece um post-it", reforçando a imagem de referência)
      Cantinho dobrado no topo-esquerdo do indicador: um `<path>`
      triangular de amarelo mais escuro (`NOTE_INDICATOR_FOLD_COLOR_HEX`,
      `#eab308`) via `appendPostItFold`, filho do MESMO `<g>` do
      indicador (não uma camada translúcida própria — herda a opacidade
      do grupo pai, sem reintroduzir o problema do T005e). Puramente
      decorativo, não afeta hit-test (`upsertNoteTab`/`getNoteTabAtPoint`
      continuam a única fonte de toque). T043b estendido pra checar a
      presença do `path[fill="#eab308"]` dentro do grupo do indicador.

### Testes da Fase

- [X] T006 [P] [US1] Testes em `src/__tests__/components/EpubViewer.test.tsx`:
      - Highlight com `note`: após o paint, existe um elemento
        `[data-nr-highlight-note-tab="<cfi>"]` no documento da seção.
      - Highlight sem `note`: nenhum elemento de aba é criado pra esse CFI.
      - Lista de highlights atualizada removendo a `note` de um highlight
        (ou removendo o highlight inteiro): a aba correspondente some do
        documento na repintura seguinte.
      - A aba usa a classe `.nr-highlight-note-tab` (forma distinta, não
        checável visualmente em JSDOM, mas a presença da classe é).
      - (T043b, ad-hoc) Com nota, o draw function do overlay produz 2
        grupos SVG (indicador + resto), nunca 2 camadas translúcidas
        empilhadas na mesma região (ver T005e).

**Critério de Conclusão**: Toda vez que uma seção é (re)pintada, cada
highlight com `note` tem exatamente uma aba visível ancorada ao início do
trecho, e nenhum highlight sem `note` tem aba — sem nenhuma dependência de
toque.

**Checkpoint**: User Story 1 funcional e testável isoladamente.

**Registro da Fase**:

- Status: Concluída
- Feito: T003 (`ensureNoteTabsContainer`/`findNoteTab`/`upsertNoteTab`/`removeNoteTab` em `EpubViewer.tsx`), T004 (handler de `draw-annotation` em `paintHighlight` estendido pra ler `e.detail.range`/`e.detail.doc` e criar/remover a aba conforme `highlight.note` — confirmado empiricamente que `e.detail.range` vem preenchido, risco de `plan.md` R-002 não se concretizou), T005 (`repaintHighlightsForSection` remove abas órfãs via `removeOrphanNoteTabs`, cobrindo highlight excluído), T005b (ad-hoc, 1ª tentativa `z-index: -1` — corrigia cobertura mas deixava invisível), T005c (ad-hoc, 2ª tentativa — reposiciona ACIMA da linha, visível mas ainda tira fixa pequena), T005d (ad-hoc, redesenho a pedido do usuário com 1ª imagem de referência: retângulo translúcido cobrindo ~1 palavra, no início do trecho), T005e (ad-hoc, correção final: cor pintada como parte do MESMO overlay do highlight via `drawHighlightWithNoteIndicator` — elimina a mistura de cor por duas camadas translúcidas empilhadas, achado com a 2ª imagem de referência do usuário), T005f (ad-hoc, polimento: cantinho dobrado de post-it no indicador), T006 (4 testes novos: T036 aba aparece ancorada ao rect certo com a classe distinta, T037 sem nota nenhuma aba, T038 nota removida via rerender remove a aba, T043b overlay divide em 2 grupos sem mistura + cantinho dobrado presente)
- Testes executados: `npx tsc --noEmit` (limpo), `npx vitest run src/__tests__/components/EpubViewer.test.tsx` (120/120, sem regressão em nenhuma das 6 rodadas), `npm run lint` (limpo), `npm run build` (limpo), `npm test` completo: 909 passando confirmado após T005e; rodando de novo após T005f
- Pendências: nenhuma de código. Achado durante T004 (não bug, ajuste de infraestrutura de teste): JSDOM não implementa `Range.prototype.getClientRects` — adicionado um default seguro (array vazio) em `src/__tests__/setup.ts`, documentado ali; os 112 testes pré-existentes que acionam `paintHighlight` passaram a depender implicitamente desse polyfill (antes não precisavam, porque `paintHighlight` nunca chamava esse método). Instalado e testado em device (T005e+T005f): usuário conseguiu tocar na aba e abrir a caixa de preview (confirma que o indicador está visível e tocável) — feedback seguinte foi sobre a CAIXA em si (US2, ver T008b), sem reclamação nova sobre a aparência da aba.

---

## Phase 4: User Story 2 - Ler a anotação sem abrir o menu completo (Priority: P2)

**Objetivo**: Tocar na aba abre uma caixa flutuante só-leitura com o
texto da nota; tocar fora fecha; o resto do trecho continua abrindo o
menu completo normalmente.

**Independent Test**: Com a aba da US1 já visível, tocar nela e confirmar
que a caixa abre com o texto certo, rola se for longo, fecha ao tocar
fora, e não interfere no menu completo ao tocar noutra parte do trecho.

### Implementation

- [X] T007 [US2] Em `EpubViewer.tsx`: criar `getNoteTabAtPoint(target, doc,
      clientX, clientY)` — mesmo padrão de 3 níveis de
      `getHighlightMenuButtonAtPoint` (`closest`, `elementFromPoint`,
      iteração com `isPointInsideElement`), selector
      `[data-nr-highlight-note-tab]`.
- [X] T008 [US2] Em `EpubViewer.tsx`: criar `ensureNotePreviewEl(doc)`
      (singleton `#nr-highlight-note-preview`, mesmo padrão
      `ensureHighlightMenuEl`, com um `.nr-note-preview-text` interno),
      `setNotePreviewContent(el, text)`, `positionNotePreview(doc, el,
      rect)` — decide abrir acima (comportamento padrão, igual
      `positionMenuAtRect`) ou abaixo do `rect` quando não houver espaço
      vertical suficiente acima (FR-007; ver `research.md` D-003) — e
      `closeNotePreview(doc)` (esconde, não remove).
- [X] T008b [US2] (ad-hoc, achado do usuário em device: "não é possível
      ler a anotação devido às cores, aliás a caixa está fora do
      design-system do app") CSS de `#nr-highlight-note-preview`
      trocada de um cartão amarelo pastel fixo (`#fef9c3`/`#422006`,
      ilegível no tema escuro e destoante do resto da UI) pra a MESMA
      receita visual de `#nr-highlight-menu`/`#nr-selection-menu`
      (`palette.translationBorder`/`translationSurface`/
      `translationGlow`/`palette.text` — cartão escuro com glow,
      consistente com todo o resto dos painéis flutuantes do leitor).
      Mantido só um acento fino (`border-left` amarelo,
      `NOTE_INDICATOR_COLOR_HEX`) pra ligar visualmente com o indicador,
      sem reinventar a caixa inteira nem sair do design system.
- [X] T009 [US2] No `doc.addEventListener('click', ...)` único
      (`EpubViewer.tsx`, logo após o bloco `if (highlightMenuBtn) {...}`,
      linha ~3870): novo bloco — `getNoteTabAtPoint` no alvo do clique;
      se casar, `ev.preventDefault()`/`ev.stopPropagation()`, resolver o
      highlight pelo `cfi` do `data-nr-highlight-note-tab`, fechar o menu
      completo se `activeHighlight` estiver setado
      (`closeHighlightMenu(doc)` + zera `activeHighlight`/
      `activeHighlightMenuRect`), popular e posicionar a caixa
      (`setNotePreviewContent` + `positionNotePreview`), setar
      `activeNotePreviewCfi = cfi`, `return`.
- [X] T010 [US2] No bloco de "toque fora fecha" já existente pro menu
      completo (`EpubViewer.tsx`, perto de `if (activeHighlight) {...}`,
      linha ~3944): adicionar checagem irmã pra
      `activeNotePreviewCfi` — se setado e o toque não foi na própria
      aba que abriu a caixa, `closeNotePreview(doc)`, zera
      `activeNotePreviewCfi`, consome o toque (`logReaderTapIgnored`,
      `return`) em vez de deixar cair pro fluxo de tradução/seleção.

### Testes da Fase

- [X] T011 [P] [US2] Testes em `src/__tests__/components/EpubViewer.test.tsx`:
      - Tocar na aba abre a caixa (`#nr-highlight-note-preview` visível)
        com o texto da `note` do highlight certo.
      - Tocar na aba NÃO chama `onAnnotateHighlight` nem abre
        `#nr-highlight-menu`.
      - Tocar fora da caixa aberta fecha ela (`hidden` volta a `true`).
      - Tocar em qualquer OUTRA parte do trecho (fora da aba) ainda abre
        o menu completo normalmente — sem regressão de FR-008 (mesmo
        teste que já cobre `getHighlightAtPoint` hoje, verificando que
        continua passando).
      - Mock de `rect` perto do topo da viewport (`top` pequeno): a caixa
        é posicionada abaixo do trecho em vez de acima (checagem do
        `style.top` relativo ao `rect`, não de layout visual real).

**Critério de Conclusão**: Tocar na aba abre a caixa só-leitura com o
texto certo da nota; fechar por toque fora funciona; nenhuma regressão em
nenhuma ação do menu completo de gerenciamento de highlight.

**Checkpoint**: User Story 2 funcional e testável isoladamente (depende
da aba da US1 existir para ter algo em que tocar).

**Registro da Fase**:

- Status: Concluída
- Feito: T007 (`getNoteTabAtPoint`, hit-test de 3 níveis), T008 (`ensureNotePreviewEl`/`setNotePreviewContent`/`closeNotePreview`/`positionNotePreview` com fallback acima/abaixo), T008b (ad-hoc, device real: caixa ilegível/fora do design system — trocada pra mesma receita visual de `#nr-highlight-menu`, `palette.*`), T009 (branch novo no click handler — toca na aba, fecha o menu completo se aberto, popula e posiciona a caixa), T010 (branch irmão do `activeHighlight` pro "toque fora fecha" da caixa), T011 (4 testes novos: T039 abre com o texto certo sem regressão no menu completo, T040 toque fora fecha, T041 toque no resto do trecho ainda abre o menu completo — FR-008 sem regressão, T042 fallback de posição abaixo quando não cabe acima — FR-007)
- Testes executados: `npx tsc --noEmit` (limpo), `npx vitest run src/__tests__/components/EpubViewer.test.tsx` (120/120 após T008b, sem regressão), `npm run lint` (limpo), `npm run build` (limpo), `npm test` completo rodando após T008b (última confirmação antes dele: 909 passando)
- Pendências: nenhuma de código — falta só a Fase Polish (validação em device real e checklist de release) e confirmação visual de T008b (ainda não visto pelo usuário). R-001 (realinhamento em troca de fonte) continua aberto pra validação manual no `quickstart.md`.

---

## Phase 5: Polish & Cross-Cutting Concerns

**Purpose**: Validação final cross-cutting, cobrindo os gates da
constitution e o `quickstart.md`.

- [X] T012 Rodar `npm run lint && npm test && npx tsc --noEmit && npm run build` — Constitution IV.
- [X] T013 Cenário ponta a ponta de `quickstart.md` num device Android
      real. Confirmado ao longo da sessão (múltiplas rodadas de ajuste +
      spot-check final): passos 1/4/8 (marca aparece, toque abre a caixa
      com texto legível, menu completo continua funcionando pro resto do
      trecho), e implicitamente 2 (highlights sem nota nunca mostraram
      marca em nenhum teste manual). O spot-check final (passo com
      múltiplos highlights + tradução) revelou um bug REAL — não do
      indicador em si, mas de uma interação pré-existente entre a
      tradução inline e o overlay de highlights (highlight sumindo ao
      traduzir no mesmo parágrafo) — tratado à parte via `sdd-bugfix`
      (`sdd/bugs/highlight-some-ao-tocar-no-mesmo/`, veredito `verified`,
      2026-09-11) por ser fora do escopo desta feature. **Itens do
      `quickstart.md` não exercidos manualmente nesta rodada** (3, 5, 6,
      7, 9, 10, 11, 12 — highlight âmbar/FR-003, toque fora fecha a
      caixa, nota longa rola, fallback de posição/FR-007, remover nota
      some a marca, troca de fonte/R-001, tema claro, rotação de tela):
      cobertos por teste automatizado (T036-T043b) mas sem confirmação
      visual explícita no device — risco residual baixo dado o volume de
      uso real já exercido nesta sessão (múltiplos highlights criados,
      anotados, editados e visualizados repetidamente sem problema).
- [X] T014 `README.md` (seção "### Highlights") já mencionava a anotação
      da feature 013 — adicionado 1 bullet novo descrevendo o indicador
      visual tipo post-it e a caixa de preview (mudança real e visível
      pra quem lê o README).

### Checklist de Release

- [X] Fase Foundational concluída (T001-T002)
- [X] Fase User Story 1 concluída (T003-T006)
- [X] Fase User Story 2 concluída (T007-T011)
- [X] `npm run lint && npm test && npx tsc --noEmit && npm run build` passando
- [X] Validado em device Android real (`quickstart.md`) — ver T013
- [X] Nenhuma regressão no menu completo de gerenciamento de highlight
      (Anotar/Editar anotação, Remover, Cor e estilo) nem no menu de
      criação de highlight

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: nenhuma task — sem dependências.
- **Foundational (Phase 2)**: BLOQUEIA User Story 1 e User Story 2 — ambas usam as classes CSS/chave i18n definidas aqui.
- **User Story 1 (Phase 3)**: depende do Foundational. Entrega valor sozinha (sinalização visual, sem toque).
- **User Story 2 (Phase 4)**: depende do Foundational E da aba da User Story 1 existir (é o gatilho de toque) — não pode ser paralelizada com a US1 como a 013 fez com US1/US2 (aqui há dependência real de sequência, não só de arquivo).
- **Polish (Phase 5)**: depende de ambas as user stories completas.

### Parallel Opportunities

- T003/T004/T005 (US1) são sequenciais dentro do mesmo arquivo — sem paralelismo real entre si.
- T007/T008 (US2, funções novas independentes: hit-test da aba vs. elemento/posicionamento da caixa) podem ser escritas em paralelo antes de T009 integrá-las no click handler.
- T006 (teste US1) e T011 (teste US2) são arquivos de teste no mesmo arquivo (`EpubViewer.test.tsx`) — sequenciais na prática, mas dependem de fases diferentes já implementadas.

---

## Implementation Strategy

### MVP First (Foundational + User Story 1)

1. Completar Fase 1: Setup (vazia).
2. Completar Fase 2: Foundational (T001-T002).
3. Completar Fase 3: User Story 1 (T003-T006).
4. **PARAR E VALIDAR**: confirmar no device que a aba aparece/some
   corretamente antes de implementar o toque (US2).

### Incremental Delivery

1. Foundational → CSS/i18n prontos.
2. User Story 1 → testar isoladamente → considerar entrega parcial (sinalização visual já tem valor sozinha).
3. User Story 2 → testar isoladamente → completa a feature (preview por toque).
4. Polish → gates de build/lint/testes + validação manual completa no device.

## Notes

- `[P]` = arquivos diferentes, sem dependência.
- `[Story]` mapeia a task pra uma user story específica.
- Commitar após cada task ou grupo lógico coerente.
- Nunca depender de `Overlayer` (vendor `foliate-js`) pra desenhar a aba
  — é sempre um elemento DOM próprio (ver `plan.md` D-001/Decisões
  Invariantes).

<!-- sdd-converge anexa "## Phase N: Convergence" abaixo desta linha -->
