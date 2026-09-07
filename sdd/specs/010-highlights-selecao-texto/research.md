# Fase 0 — Research: Highlights de trecho selecionado

**Slug**: `010-highlights-selecao-texto` | **Data**: 2026-09-06

Três incertezas técnicas genuínas restavam depois da spec. Todas foram
resolvidas por leitura do código real (do repositório e do vendor `foliate-js`),
não por suposição. Uma quarta continua aberta e vira validação em device.

---

## R0.1 — Como pintar o highlight no texto

**Decisão**: usar a maquinaria de anotação que o `foliate-js` já expõe —
`view.addAnnotation({ value: cfi })`, o evento `draw-annotation` para escolher a
pintura, e `Overlayer.highlight(rects, { color })`.

**Justificativa** (tudo verificado no vendor code):

- `view.js:266` já registra `create-overlayer` no renderer e anexa um `Overlayer`
  por seção **sozinho** — não é preciso instanciar nem conectar nada.
- `create-overlayer` é emitido pelo `paginator.js` em `1849` e `1916`, os
  caminhos usados pelo modo **scrolled** (o do NeoReader) — não é recurso só do
  modo paginado.
- `addAnnotation` (`view.js:381`) resolve o CFI, acha o overlayer da seção e
  emite `draw-annotation` com um `draw(func, opts)`; o app decide a pintura.
  `Overlayer.highlight` aceita `{ color, opacity }` (`overlayer.js:238-248`) —
  as cores saem de graça.
- O SVG do overlayer é criado com **`pointerEvents: 'none'`**
  (`overlayer.js:17-21`). Isso é decisivo para a restrição do usuário: a pintura
  **não intercepta toque nenhum**, não bloqueia seleção e não altera o
  roteamento de toque existente.
- `overlayer.redraw()` é chamado pelo próprio paginator no relayout
  (`paginator.js:566-571`), o que entrega FR-014 (fonte/tema/rotação) sem código
  nosso.
- Como bônus, `#createOverlayer` instala um `click` no doc que faz `hitTest` e
  emite **`show-annotation`** (`view.js:438-444`) com `{ value, index, range,
  rect }` — exatamente o gancho de FR-019 (tocar num highlight abre o menu do
  highlight), já com o retângulo para ancorar o menu.

**Alternativas consideradas**:

- *Envolver o texto em `<span>` como o vocabulário faz*
  (`injectVocabHighlight`, `EpubViewer.tsx:698-737`): **rejeitada**. Casa por
  regex de texto e marcaria toda ocorrência, violando FR-012; e mutila o DOM do
  EPUB, o que desloca CFIs (ver R0.4).
- *Desenhar retângulos próprios num canvas/overlay*: **rejeitada** — reimplementa
  `Overlayer` inteiro, incluindo redraw no reflow, sem ganho.

---

## R0.2 — Onde renderizar o menu de seleção

**Decisão**: injetar o menu **dentro do documento do iframe**, seguindo o padrão
já existente do `#nr-translation-block`, e **anexá-lo ao fim do `<body>`**.

**Justificativa**:

- O `ReaderScreen.tsx` (comentário na linha ~1084) registra explicitamente que
  overlay/backdrop sobre o iframe é menos confiável que passar estado por prop,
  "pois evita o problema de compositing do Android WebView". A memória de
  projeto sobre eventos do iframe diz o mesmo.
- O bloco de tradução inline já prova o padrão neste repositório: HTML injetado
  no doc, botões com `data-nr-action`, tratados pelo **mesmo** listener de
  `click` do doc (`EpubViewer.tsx:2977-3008`).
- As coordenadas da seleção (`range.getClientRects()`) já estão no espaço do
  iframe — ancorar um elemento do próprio doc dispensa conversão de coordenadas
  entre iframe e página.

**Por que no fim do `<body>` e não `para.after(...)`**: o bloco de tradução usa
`para.after(block)` (`EpubViewer.tsx:2726`), o que insere um elemento **no meio
do fluxo** e desloca os índices de filhos usados pelo CFI do conteúdo seguinte.
Anexar ao fim do `body` não altera índice de nada que venha antes, então os CFIs
já calculados continuam válidos enquanto o menu está aberto.

**Alternativas consideradas**:

- *Overlay React posicionado sobre o iframe*: **rejeitada como padrão**, mantida
  como plano B (R-004). Funciona para o `ReaderChrome`, mas carrega o risco de
  compositing já registrado e exige converter coordenadas do iframe.
- *`BottomSheet` como os marcadores usam*: **rejeitada** — tira o menu de perto
  da seleção e quebra o "um toque para marcar" (SC-005).

---

## R0.3 — Como impedir que a seleção dispare o toque curto

**Decisão**: guarda **por estado**, não por temporizador. Um `selectionActiveRef`
alimentado por `selectionchange`/`touchstart` no doc, consultado por um ramo novo
no listener de `click` já existente, que retorna cedo com
`logReaderTapIgnored('text-selection')`.

**Justificativa**:

- Não existe hoje nenhum timer de long-press no `EpubViewer` — o roteamento é um
  listener de `click` com guardas em cadeia (`EpubViewer.tsx:2966+`) e um
  `didScroll` calibrado em `TAP_SLOP_PX = 12` (`EpubViewer.tsx:25`). Introduzir
  um timer competindo com esse `didScroll` é justamente o que criaria o conflito
  que o usuário proibiu duas vezes.
- Quem decide "isto virou seleção" passa a ser o WebView, que já faz isso de
  forma nativa. O app só **observa** o resultado.
- Um ramo de guarda a mais é o padrão local: já existem ramos para resíduo de
  scroll, bloco de tradução, imagem, zona de chrome, ícone de marcador, TTS ativo
  e tradução em andamento — todos com o mesmo formato de log.

**Detalhe que a implementação não pode errar**: no Android, quando o toque que
dispensa a seleção chega, o WebView **já colapsou** a seleção — ler
`getSelection()` dentro do `click` devolveria vazio e a guarda falharia. Por isso
o estado precisa ser capturado **no início do gesto** (`touchstart`/`pointerdown`)
e só então consumido pelo `click`. Isso está travado como Decisão Invariante no
`plan.md`.

**Alternativas consideradas**:

- *Timer de long-press próprio + `preventDefault`*: **rejeitada** — recria o que
  o WebView já faz e disputa com o `didScroll`.
- *`user-select: none` e seleção 100% custom* (caminho parcial do `readest`,
  `utils/sel.ts`, 958 linhas): **rejeitada** — o motivo daquele projeto (modo
  paginado, seleção cruzando páginas) não existe aqui.

---

## R0.4 — Incerteza que permanece: estabilidade do CFI de intervalo

**Status**: **em aberto** — resolvida por validação em device/teste durante a
US1, não por decisão de mesa.

O CFI de um intervalo carrega índices de nó e deslocamento de caractere. O
NeoReader injeta no doc do EPUB coisas que mudam essa estrutura:
`injectVocabHighlight` envolve texto em `<span class="nr-vocab">`
(`EpubViewer.tsx:706-722`) e o bloco de tradução insere um elemento com
`para.after(block)`. Um CFI criado com essas injeções presentes pode não resolver
numa sessão em que elas estejam diferentes (ex: o usuário salvou mais vocabulário
depois).

O CFI de marcador escapa disso porque é colapsado no início do parágrafo
(`EpubViewer.tsx:2163-2167`) — um highlight não tem essa folga.

**Encaminhamento**: a entidade guarda `text` e `paraCfi` desde já, para que o
fallback por texto seja possível **sem migração de schema** caso a validação
mostre desvio real. Não implementar o fallback antes disso — a spec (FR-017) já
tolera highlight não localizável, e o Princípio III da constitution proíbe
construir para requisito hipotético. Registrado como **R-001** no `plan.md`.
