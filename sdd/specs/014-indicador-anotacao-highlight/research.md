# Research: Indicador visual de anotação em highlights com preview flutuante

**Slug**: `014-indicador-anotacao-highlight`

Decisões técnicas com alternativas genuínas, resolvidas via exploração do
código real de `EpubViewer.tsx` e do contrato TypeScript do `foliate-js`
(`src/types/foliate.d.ts`) antes de escrever `plan.md`.

## D-001: A aba de "tem anotação" é um elemento DOM, não uma 4ª draw function do Overlayer

**Decisão**: A marca amarela é um elemento HTML absolutamente posicionado
(um por highlight-com-nota visível), anexado ao `doc.body` da seção — mesmo
mecanismo já usado por `#nr-selection-menu`/`#nr-highlight-menu` — e não uma
nova forma desenhada via `Overlayer` do vendor `foliate-js`.

**Justificativa**: `view.addAnnotation({ value: cfi })` dispara
`draw-annotation` uma única vez por CFI, e quem desenha é uma das 3 funções
estáticas do vendor (`Overlayer.highlight`/`underline`/`squiggly` —
`foliate.d.ts:157-166`). Não há um 4º "draw" disponível, e o mesmo CFI já
está ocupado pelo destaque em si (`paintHighlight`,
`EpubViewer.tsx:2791`). Estender o overlayer do vendor pra desenhar duas
formas pro mesmo `value` mexeria em código de terceiro fora do nosso
controle — alto risco pra baixo ganho. O padrão de elemento DOM
absolutamente posicionado já existe, está provado em produção (menus de
seleção/gerenciamento de highlight) e é mais barato de estender —
Constitution III (explícito antes de mágico).

**Alternativas consideradas**:
- Estender `Overlayer.highlight` (vendor) pra desenhar também a aba —
  rejeitada: mexe em código de terceiro, sem precedente no projeto.
- `<mark>`/wrapping de DOM do texto (como `injectVocabHighlight` faz pro
  Word Lens) — rejeitada pelo mesmo motivo que `paintHighlight` já rejeita
  essa técnica pro highlight em si (comentário em `EpubViewer.tsx:2777`):
  casaria por texto, mutilaria o DOM do EPUB e desestabilizaria os CFIs
  vizinhos.

## D-002: Posição da aba vem de `range.getClientRects()[0]`, usando o `range` que `draw-annotation` já entrega

**Decisão**: `paintHighlight` passa a ler `e.detail.range` (campo já
tipado em `foliate.d.ts:114`, mas não consumido até hoje no código) e, se o
highlight tiver `note`, cria/atualiza a aba usando
`range.getClientRects()[0]` — a primeira linha visual do range, ou seja, o
início do trecho, exatamente o que a US1/FR-001 pedem. `getClientRects()`
(plural) é usado em vez de `getBoundingClientRect()` porque um highlight que
cruza linhas teria uma bounding box que não representa "o início" — o
primeiro rect da lista é a linha onde o trecho começa.

**Justificativa**: é a mesma fonte de dado que o próprio overlayer usa
internamente pra desenhar os rects do destaque — reaproveita o range já
resolvido pelo `view.addAnnotation`, sem re-resolver o CFI por conta
própria (sem nova chamada cara/duplicada).

**Alternativas consideradas**:
- Usar o `rect` que `overlayer.hitTest()` devolve (já usado pra posicionar
  o menu de gerenciamento, `EpubViewer.tsx:3962`) — rejeitada: esse rect só
  existe no momento de um toque específico (reage a onde o usuário tocou
  dentro do trecho). A aba precisa ser posicionada proativamente, ao
  pintar a seção, antes de qualquer toque existir.

## D-003: Caixa de preview é um singleton posicionado com fallback de "virar pra baixo"

**Decisão**: A caixa flutuante (US2) segue o mesmo padrão singleton de
`#nr-highlight-menu` (um elemento por documento, criado sob demanda via
`ensureNotePreviewEl(doc)`), mas usa uma função de posicionamento nova —
`positionNotePreview` — que decide abrir acima ou abaixo do trecho
conforme o espaço vertical disponível (FR-007), em vez de só fazer clamp
pro topo da viewport como `positionSelectionMenu`/`positionMenuAtRect` já
fazem hoje.

**Justificativa**: nenhuma das duas funções de posicionamento existentes
inverte o lado — ambas só empurram o elemento pra não sair pelo topo,
presumindo que sempre há espaço embaixo (verdade pros menus, que abrem por
cima de uma seleção geralmente no meio do texto; não necessariamente
verdade pra um trecho destacado perto do início do capítulo). É uma
extensão pequena e explícita do mesmo mecanismo, não uma dependência nova.

**Alternativas consideradas**:
- Sempre abrir abaixo do trecho, sem lógica condicional — mais simples,
  mas afasta a caixa do texto na maioria dos casos (trecho no meio da
  tela) e contraria a referência visual do usuário (caixa colada acima do
  trecho na imagem de referência). Rejeitada.
