# Bug Assessment: Highlight some ao tocar no mesmo parágrafo pra abrir tradução

- **Slug**: highlight-some-ao-tocar-no-mesmo
- **Criado**: 2026-09-10
- **Origem**: texto colado (relato do usuário, testando a feature 014 num device Android real — SM-S911B)
- **Veredito**: valid
- **Severidade**: high

## Report

> "eu criei o highlight em uma palavra de uma frase, depois cliquei na
> mesma frase (sem clicar na palavra com highlight) neste momento a
> marcação sumiu"
>
> Repro sugerida pelo usuário: texto "esse é um exemplo de texto" — cria
> highlight na palavra "texto" — clica no INÍCIO da frase (fora da palavra
> destacada) — isso abre o menu contextual (tradução inline) — o highlight
> desaparece.

## Symptom

Um highlight existente desaparece visualmente da tela quando o usuário
toca em outra parte do MESMO parágrafo/frase pra abrir a tradução inline
— sem tocar diretamente no trecho destacado. Esperado: o highlight
continuar visível normalmente, já que a ação do usuário foi só traduzir
o parágrafo, não mexer no highlight.

## Reproduction

1. Destacar uma palavra/trecho curto dentro de uma frase (ex: a palavra
   "texto" em "esse é um exemplo de texto").
2. Tocar em outra parte da MESMA frase/parágrafo (fora do trecho
   destacado) — isso aciona a tradução inline daquele parágrafo.
3. Observar que o highlight criado no passo 1 não aparece mais na tela.

[NEEDS CLARIFICATION: não confirmado ao vivo (via device ou Playwright)
se o highlight volta a aparecer corretamente ao sair e reabrir o
capítulo/livro — a hipótese de causa raiz abaixo sugere que sim (o CFI
persistido no banco não é alterado, só o DOM/overlay JÁ CARREGADO na
sessão de leitura atual fica desalinhado), mas isso não foi verificado
na prática.]

## Suspected Code Paths

- `src/components/reader/EpubViewer.tsx:205` — `highlightSentenceInParagraph(para, sentence)`:
  envolve a frase sendo traduzida num `<span class="nr-hl-sentence">` via
  `range.surroundContents(span)` — mutação real de DOM (extrai e
  reinsere o conteúdo do range, podendo dividir nós de texto existentes).
- `src/components/reader/EpubViewer.tsx:931` (bloco de `buildReaderCSS`) —
  `.nr-hl-sentence { padding: .10em .28em !important; ... }` — a
  `padding` é uma propriedade que AFETA LAYOUT (reflow), diferente de
  `background-color`/`box-shadow` puros que não deslocam texto.
- `src/components/reader/EpubViewer.tsx:~3143` (dentro de `paintHighlight`,
  handler de `draw-annotation`) — o overlay do highlight é um `<rect>`/
  `<path>` SVG desenhado UMA VEZ a partir de `range.getClientRects()`
  (coordenadas fixas, nunca recalculadas automaticamente depois — só se
  algo chamar `repaintHighlightsForSection`/`paintHighlight` de novo pro
  mesmo CFI).
- `src/components/reader/EpubViewer.tsx:~2181-2220` — `selectTextForInlineTranslation`,
  chamada sempre que o usuário toca pra traduzir; é quem chama
  `highlightSentenceInParagraph`. Nenhum repaint de highlights acontece
  logo depois (confirmado por leitura — não há chamada a
  `repaintHighlightsForSection`/`paintHighlight` nesse fluxo).

## Root Cause Hypothesis

**Confiança: high** (fundamentado no código; sem reprodução ao vivo —
tentativa via Playwright MCP não foi concluída por limitação real de
automação, ver Open Questions). O overlay visual de um highlight é
desenhado uma única vez, a partir de `range.getClientRects()` no momento
da pintura — coordenadas de pixel FIXAS, nunca recalculadas
automaticamente. `highlightSentenceInParagraph` (acionada sempre que o
usuário toca pra traduzir um parágrafo) envolve a frase traduzida num
`<span class="nr-hl-sentence">`, cujo CSS inclui `padding` — uma
propriedade que REFLUI o texto ao redor (desloca a posição visual de
tudo depois do wrapper na mesma linha, e pode até mudar em qual linha um
trecho cai). Se o trecho destacado está na mesma frase/parágrafo sendo
traduzido, esse reflow desalinha a posição real do texto em relação às
coordenadas já fixadas no overlay do highlight — o highlight passa a
"flutuar" sobre uma posição que não corresponde mais ao texto destacado,
o que na prática aparenta ter "sumido" (não sobrepõe mais nenhum glifo
visível, ou fica fora da área lida pelo usuário).
Fator agravante (confiança menor, não confirmado): `range.surroundContents(span)`
por si só já é uma mutação de DOM que pode dividir nós de texto
existentes — o próprio comentário de `paintHighlight` (linha ~2777)
alerta explicitamente contra esse tipo de técnica pro highlight em si,
por "mutilar o DOM do EPUB e desestabilizar os CFIs de tudo ao redor";
essa mesma cirurgia acontece aqui, só que numa feature diferente
(tradução), sem essa mesma cautela — se uma repintura futura da seção
tentar re-resolver o CFI do highlight contra o DOM já mutilado, pode
falhar silenciosamente (capturado pelo `catch` de FR-017) ou resolver
errado.

## Proposed Remediation

**Preferida**: Depois que `highlightSentenceInParagraph` (ou o fallback
de parágrafo inteiro, `para.classList.add('nr-hl')`) terminar de mutar o
DOM dentro de `selectTextForInlineTranslation`, chamar
`repaintHighlightsForSection(sectionIndex)` pra aquela seção — isso
re-resolve o CFI de cada highlight contra o DOM JÁ MUTADO/refluído e
recalcula os rects do zero, "curando" qualquer highlight que tenha ficado
desalinhado por causa do reflow. Reaproveita um mecanismo já existente e
já idempotente (`paintHighlight`/`view.addAnnotation` já removem a
pintura antiga antes de desenhar de novo) — sem inventar um caminho novo.
Resolve o sintoma independente de qual dos dois fatores (reflow ou
CFI/DOM) é a causa dominante, porque um repaint completo corrige os dois.

**Alternativas** (opcional):
- Fazer `.nr-hl-sentence` não usar `padding` (só `background-color`/
  `box-shadow`) — remove o gatilho de reflow especificamente identificado,
  mas não cobre o fator agravante de `surroundContents` mutilar nós de
  texto que outro highlight referencia. Mais cirúrgico, mas potencialmente
  incompleto.
- Fazer `highlightSentenceInParagraph` evitar envolver texto que já
  contém um highlight ativo (checar `overlayer.hitTest` ou os highlights
  da seção antes de decidir o range a envolver) — mais invasivo, muda o
  comportamento visual da tradução em parágrafos com highlight (perderia
  o destaque da frase sendo traduzida nesses casos).

**Files likely to change**:
- `src/components/reader/EpubViewer.tsx` (dentro de
  `selectTextForInlineTranslation`, adicionar a chamada de repaint; talvez
  `.nr-hl-sentence` no CSS se a remediação preferida não for suficiente
  sozinha)

**Tests to add or update**:
- `src/__tests__/components/EpubViewer.test.tsx`: um teste que (a) pinta
  um highlight existente numa seção, (b) aciona
  `selectTextForInlineTranslation` pra um parágrafo que contém (ou está
  próximo d)o highlight, (c) confirma que `paintHighlight`/`overlayer.add`
  é chamado de novo pro CFI do highlight depois da tradução (prova que a
  repintura de cura rodou).

## Risks & Considerations

- Repintar TODA a seção a cada toque de tradução tem custo — mas
  `repaintHighlightsForSection` já é chamado hoje em vários outros
  gatilhos (`load`, `create-overlay`, mudança da lista de highlights) sem
  problema de performance percebido; o número de highlights por seção
  tende a ser pequeno.
- Se o fator agravante (CFI corrompido por `surroundContents`) for
  dominante, a remediação preferida ainda cobre o caso — repintar chama
  `view.addAnnotation` de novo, que tenta resolver o CFI contra o DOM
  atual; se a resolução falhar, cai no `catch` de FR-017 (não pinta, sem
  quebrar a leitura) em vez de continuar mostrando uma posição errada —
  ainda seria uma lacuna (highlight some de vez, não só desalinha), mas
  não pior que o estado atual.
- Fix não pode assumir que basta esperar o reflow "acontecer" — precisa
  confirmar que a chamada de repaint roda DEPOIS que o navegador já
  aplicou o reflow síncrono da mutação de DOM (deve ser automático, já
  que mutações de DOM refluem de forma síncrona antes do próximo código
  JS rodar, mas vale confirmar na fase Fix/Test).

## Open Questions

- [NEEDS CLARIFICATION: não foi possível reproduzir ao vivo (device
  reinstalado só capturou uma tentativa que na prática só abriu tradução
  em texto sem highlight, sem repetir o bug; tentativa via Playwright MCP
  não foi concluída — o leitor usa shadow DOM aninhado dentro de
  `<foliate-view>` mais uma tradução de coordenada física própria
  (`getPhysicalTapPosition`) que tornou a simulação de toque real inviável
  no tempo disponível). A fase Fix deve, se possível, confirmar o
  mecanismo exato com um teste automatizado que exercite
  `selectTextForInlineTranslation` sobre um parágrafo com highlight antes
  de aplicar a correção "às cegas".]
- [NEEDS CLARIFICATION: o highlight reaparece corretamente ao sair e
  reabrir o capítulo/livro (recarregando o DOM do zero)? Se sim, isso
  reforça que o problema é só de estado visual da sessão atual (DOM já
  mutado), não de dado persistido — relevante pra severidade real
  percebida pelo usuário no dia a dia.]
