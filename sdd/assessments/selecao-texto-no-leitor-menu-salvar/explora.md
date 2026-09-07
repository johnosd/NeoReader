# Assessment Explora: Seleção de texto no leitor com menu "salvar trecho"

- **Slug**: selecao-texto-no-leitor-menu-salvar
- **Criado**: 2026-09-05
- **Origem**: texto colado (pedido direto do usuário)

## Ideia Bruta

No leitor, um toque **longo** sobre o texto deve iniciar seleção e, ao arrastar,
estender essa seleção. Ao soltar, abre um **menu novo** — inicialmente com uma
única ação: **salvar o trecho selecionado**. Restrição explícita: esse gesto
**não pode conflitar** com o toque rápido no parágrafo, que hoje já dispara o
fluxo de tradução inline + ações (`Próximo` / `Ouvir` / `Marcador` / `Salvar`).

## Evidência a Favor

- **A lib já expõe a API necessária.** `foliate-js` tem `view.getCFI(index, range)`
  (`node_modules/foliate-js/view.js:480`) que serializa um `Range` **não
  colapsado** em CFI de intervalo, e `addAnnotation()` / `deleteAnnotation()`
  (`view.js:381`, `view.js:432`) + `overlayer.js` para desenhar o grifo. Nada
  disso precisa ser escrito do zero nem exige patch de vendor.
- **O código de bookmark já chega a 90% do caminho.** `getParagraphBookmarkPayload`
  ([EpubViewer.tsx:2174-2194](src/components/reader/EpubViewer.tsx#L2174-L2194))
  monta um `Range`, faz `range.collapse(true)` e gera o CFI. Um trecho selecionado
  é literalmente o mesmo código **sem o collapse** — a diferença é o range vir da
  seleção do usuário em vez de `selectNodeContents`.
- **Nada bloqueia seleção nativa hoje.** Não existe `user-select: none`,
  `-webkit-touch-callout` nem `::selection` customizado em nenhum CSS injetado no
  iframe (grep limpo em `EpubViewer.tsx` e `src/index.css`). O comportamento
  padrão do WebView (long-press seleciona palavra, alças arrastam) já deve estar
  ativo. `ASSUMPTION`: não foi verificado em device real.
- **Precedente forte, no mesmo motor.** O `readest` (leitor open-source também
  em cima de `foliate-js`, disponível em `C:/Users/johns/Documents/Projetos/readest`)
  implementa exatamente isso: `useTextSelector.ts` + `Annotator.tsx` + utilitários
  de seleção. Existe um caminho conhecido, incluindo as armadilhas já resolvidas.
- **Feature de mesa em leitores comerciais** (Kindle, Google Play Books, Apple
  Books): selecionar trecho → menu com grifar/copiar/nota. `ASSUMPTION`: leitores
  do NeoReader esperam isso por hábito — não há dado de uso do próprio app.
- **Fit com a tese do produto.** "Incentivar a leitura" + "aprendizado de inglês":
  salvar trechos alimenta o mesmo eixo que vocabulário e marcadores já ocupam.

## Evidência Contra

Não é "nenhuma encontrada" — há três achados concretos que empurram o custo pra
cima e o valor incremental pra baixo:

1. **O menu flutuante nativo do Android não morre no JS.** No Chromium/WebView, o
   `ActionMode` flutuante (Copiar / Compartilhar / Selecionar tudo) sobe por
   caminhos que **não disparam um evento `contextmenu` cancelável** — então
   `preventDefault()` não resolve. O `readest` precisou de um supressor **nativo**
   (`SelectionMenuSuppressor.kt` + hook na `MainActivity`, documentado no
   comentário do `bridge.ts:160-170` como issue #5427). No NeoReader isso significa
   editar `android/app/src/main/java/com/johnny/neoreader/MainActivity.java` —
   viável (o arquivo é minúsculo), mas é trabalho **nativo**, não só React, e
   quebra a promessa de "só web" que o resto da feature teria.
2. **A referência gastou muito mais código do que parece à primeira vista.** No
   `readest`: `useTextSelector.ts` (1158 linhas), `utils/sel.ts` (958),
   `crossDocSelection.ts` (238), `Annotator.tsx` (2330) — ~4.2k linhas. Boa parte
   é para casos que o NeoReader **não** tem (modo paginado, seleção cruzando
   páginas, auto page-turn por canto), mas o resíduo — race entre hold e scroll,
   seleção que "pula", alças arrastadas gerando `selectionchange` em rajada — é
   inerente a touch e vai aparecer aqui também.
3. **Sobreposição com o que já existe.** O tap no parágrafo já oferece `Marcador`
   (salva o parágrafo inteiro com CFI + snippet, com sync no Drive) e `Salvar`
   (manda pro vocabulário) — [EpubViewer.tsx:2781-2782](src/components/reader/EpubViewer.tsx#L2781-L2782).
   O ganho real da feature é **granularidade sub-parágrafo**, não "salvar texto",
   que já dá pra fazer. Isso reduz o custo de inação.
4. **O ponto de integração é o trecho mais denso do app.** Todo o roteamento de
   toque vive num único listener de `click` no doc do iframe
   ([EpubViewer.tsx:2966](src/components/reader/EpubViewer.tsx#L2966)), com ~10
   ramos de guarda (scroll residual, botões de ação, bloco de tradução, imagem,
   zona de chrome, ícone de bookmark, TTS ativo, tradução em andamento…) e um
   `didScroll` calibrado em `TAP_SLOP_PX = 12` ([EpubViewer.tsx:25](src/components/reader/EpubViewer.tsx#L25)).
   Enfiar long-press aí é exatamente onde a restrição do usuário ("não pode
   conflitar") vira risco de regressão no fluxo que hoje funciona.

## Perguntas em Aberto

- **Onde o trecho salvo é lido depois?** Salvar sem tela de leitura é meia feature.
  Reaproveita `BookmarkSheet` (que já mostra `snippet`) ou pede lista nova?
- **Modelo de dados**: estender `bookmarks` (ganha o sync do Drive de graça, mas
  mistura "ponto" com "intervalo" numa tabela que hoje só tem CFI colapsado) ou
  tabela nova `highlights` (Dexie v19 + toda a história de sync do zero)?
- **O trecho salvo fica grifado no texto** ao reabrir o livro, ou é só um registro
  em lista? Grifar exige o `overlayer` do foliate — mais escopo.
- **O tap-após-seleção dispara o fluxo de tradução por engano?** No Android, soltar
  um long-press que selecionou não costuma emitir `click`, mas o tap seguinte (para
  dispensar a seleção) emite. Precisa de teste em device — `ASSUMPTION` até lá.
