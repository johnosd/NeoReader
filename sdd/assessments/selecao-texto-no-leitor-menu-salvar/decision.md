# Assessment Decision: Seleção de texto no leitor com menu "salvar trecho"

- **Slug**: selecao-texto-no-leitor-menu-salvar
- **Decidido**: 2026-09-05
- **Problem**: ./problem.md
- **Veredito**: go

## Scorecard

| Critério | Avaliação | Notas |
| --- | --- | --- |
| Validade do problema | strong | Verificado no código, não hipótese: `getParagraphBookmarkPayload` faz `range.collapse(true)` ([EpubViewer.tsx:2185-2187](src/components/reader/EpubViewer.tsx#L2185-L2187)) — todo bookmark é um **ponto**, e o único outro caminho de salvar (`Salvar` → vocabulário, [EpubViewer.tsx:2782](src/components/reader/EpubViewer.tsx#L2782)) usa a frase inferida do clique. Não existe caminho para trecho arbitrário. |
| Força da evidência | adequate | API confirmada por leitura de vendor code com precisão de linha: `view.getCFI(index, range)` serializa range não colapsado (`node_modules/foliate-js/view.js:480`), `addAnnotation`/`overlayer` existem (`view.js:381`). Precedente funcional no mesmo motor (`readest`: `useTextSelector.ts` + `Annotator.tsx`). **`unknown` reconhecido**: (a) o comportamento atual do long-press no WebView do device nunca foi testado — não se sabe se hoje ele já seleciona, nem se o `click` de dispensa da seleção vaza pro fluxo de tradução; (b) nenhum dado de demanda de usuários reais do app — o sinal é o próprio dono do produto mais o hábito de leitores comerciais. Nenhum dos dois muda a decisão de construir; ambos viram tarefa de validação na fase de plan. |
| Valor vs. custo de inação | adequate | Custo de inação é baixo-médio e sem prazo — já existem dois caminhos parciais (marcador de parágrafo com sync no Drive, salvar frase no vocabulário), então ninguém fica sem salvar texto, só sem o recorte certo. Em contrapartida o custo de execução **não é trivial**: inclui mudança nativa Android (ver Abordagem 1). Valor > custo, mas por margem menor do que a ideia sugere à primeira vista. |
| Viabilidade / apetite | adequate | A favor: o delta técnico sobre o código existente é pequeno (o payload de bookmark está a um `collapse` de distância de um range CFI), `MainActivity.java` tem 30 linhas e já registra plugins, e o modo `flow=scrolled` elimina de saída os dois casos mais caros do `readest` (seleção cruzando páginas e auto page-turn por canto). Contra: o ponto de integração é o listener de `click` de ~10 ramos de guarda ([EpubViewer.tsx:2966](src/components/reader/EpubViewer.tsx#L2966)) num arquivo de 133 KB, e a supressão do menu flutuante do Android **não é resolvível em JS** — exige hook nativo. Não é `strong` por isso. |
| Fit estratégico | strong | Bate direto com os dois eixos declarados no `CLAUDE.md` — "incentivar a leitura" (colecionar citações) e "facilitar o aprendizado de inglês" (guardar construções de várias palavras). Nenhuma feature convergida (001-009) nem entrada do backlog cobre isso. |

## Abordagens Candidatas

### 1. Seleção nativa do WebView + supressão do `ActionMode` + menu React ancorado

- Deixa o WebView fazer o que já faz bem (long-press seleciona palavra, alças
  arrastam, `selectionchange` avisa). O NeoReader escuta `selectionchange` no doc
  do iframe, lê `doc.getSelection().getRangeAt(0)`, converte com
  `view.getCFI(index, range)` e ancora um menu próprio no rect da seleção.
  Suprime o menu flutuante do Android por override de `onWindowStartingActionMode`
  em `MainActivity.java` enquanto o leitor está ativo.
- O conflito com o tap rápido se resolve por **estado**, não por timer competindo:
  se há seleção não colapsada quando o `click` chega, o listener existente retorna
  cedo — mais um ramo de guarda, no mesmo padrão dos que já existem.
- **Recomendada**: sim — é o menor delta sobre o código atual, não recria o que a
  plataforma já entrega, e o único trabalho nativo é um override curto num arquivo
  que o projeto já edita.

### 2. Seleção 100% custom em JS (caret-from-point, ranges próprios, alças desenhadas)

- Ignora a seleção do WebView, monta o `Range` na mão a partir das coordenadas do
  toque e desenha as próprias alças. É parte do que o `readest` faz
  (`utils/sel.ts`, 958 linhas).
- **Recomendada**: não — recria comportamento que o WebView já dá de graça,
  multiplica o custo, e o motivo que levou o `readest` a esse caminho (modo
  paginado, seleção cruzando páginas) não existe aqui.

### 3. Modo "selecionar" explícito, acionado por botão no chrome

- Sem long-press: o usuário abre o chrome, ativa um modo de seleção, toca início e
  fim do trecho.
- **Recomendada**: não — contraria o gesto que o usuário pediu e o hábito de todo
  leitor digital. Fica registrada como **plano B** se, na validação em device, o
  conflito long-press × tap se provar insolúvel sem degradar o fluxo de tradução.

## Veredito

`go`, com escopo estreito na Abordagem 1. O problema é válido por verificação
direta de código (todo salvamento hoje é ponto ou parágrafo, nunca trecho), a
viabilidade está ancorada em API pública da lib já usada e num precedente
funcional sobre o mesmo motor, e o fit estratégico é o mais forte do scorecard.
Nenhum critério central está em `weak`. Os dois `unknown` — comportamento real do
long-press no device e ausência de dado de demanda — estão registrados
explicitamente e nenhum deles precisa ser resolvido **antes** de especificar: o
primeiro vira a primeira tarefa de validação da fase de plan (o projeto já tem o
skill `android-debug` e o device RXCX103NMVZ para isso), o segundo é aceito como
decisão de produto do dono.

O que **não** entra no `go`: grifo persistente renderizado no texto, notas,
copiar/compartilhar/traduzir no menu novo, e seleção cruzando capítulos — todos já
registrados como Non-Goals em `problem.md`. O menu nasce com uma ação só, como
pedido.

### Se go — Handoff

- **Problema**: o leitor só consegue salvar parágrafo inteiro (`Marcador`) ou a
  frase inferida do clique (`Salvar` → vocabulário). Não há como capturar um trecho
  arbitrário — o recorte que o leitor realmente quer guardar.

- **Abordagem recomendada**: Abordagem 1 — seleção nativa do WebView + supressão do
  `ActionMode` nativo + menu React próprio ancorado na seleção. Três peças:
  1. **Gesto**: escutar `selectionchange` (e `touchend`) no doc de cada iframe
     carregado, no mesmo handler de `load` onde os listeners de toque já são
     instalados ([EpubViewer.tsx:2953-2964](src/components/reader/EpubViewer.tsx#L2953-L2964)).
     O conflito com o tap rápido vira **um ramo de guarda a mais** no listener de
     `click` ([EpubViewer.tsx:2966](src/components/reader/EpubViewer.tsx#L2966)):
     seleção não colapsada presente → retorna cedo, com `logReaderTapIgnored`,
     seguindo o padrão dos ramos existentes. Sem timer de long-press competindo com
     o `didScroll`/`TAP_SLOP_PX` — é o WebView que decide quando virou seleção.
  2. **CFI de intervalo**: reusar `getParagraphBookmarkPayload`
     ([EpubViewer.tsx:2174](src/components/reader/EpubViewer.tsx#L2174)) **sem** o
     `range.collapse(true)`, passando o range da seleção para `view.getCFI(index, range)`.
  3. **Menu**: componente React novo no leitor, com uma ação (`salvar trecho`),
     ancorado no `getBoundingClientRect()` da seleção — atenção à memória
     `feedback_android_webview_iframe` (overlay React não intercepta eventos do
     iframe; passar estado por prop + `useSyncRef`, não resolver por z-index).

- **Escopo sugerido**:
  - *Entra*: gesto de seleção + guarda contra conflito com o tap; menu de uma ação;
    persistência do trecho com CFI de intervalo + texto; override nativo do
    `ActionMode` em `MainActivity.java`; superfície mínima para reler o que foi
    salvo; testes cobrindo a guarda do `click` e a geração do CFI de intervalo.
  - *Fica fora*: tudo listado em Non-Goals de `problem.md` — grifo renderizado,
    notas, ações extras no menu, seleção cross-capítulo, modo paginado, e qualquer
    refatoração do roteamento de toque do `EpubViewer`.

- **Métricas de sucesso**: as de `problem.md` — seleção + menu em ≥ 9/10 tentativas
  no device sem o menu do Android por cima; zero regressão no tap de tradução
  (testes atuais verdes + tap dispara em ≤ 1 tentativa); trecho recuperável pelo
  CFI de intervalo gravado; scroll sobre o texto não vira seleção;
  `npm run lint && npm test && npm run build` limpos.

- **Perguntas em aberto pro sdd-specify**:
  1. **Onde o trecho salvo é lido depois?** Reaproveitar `BookmarkSheet` (já exibe
     `snippet`, [BookmarkSheet.tsx:105](src/components/reader/BookmarkSheet.tsx#L105))
     ou criar lista própria? Sem isso a feature é write-only.
  2. **Modelo de dados — com um alerta concreto.** Estender `bookmarks` herda o sync
     do Drive de graça, **mas** `createBookmarkSyncKey` normaliza via `normalizeCfi`
     → `CFI.collapse(cfi)` ([cfi.ts:12](src/utils/cfi.ts#L12)), e `collapse` sem
     `toEnd` devolve **só o início** do range (`node_modules/foliate-js/epubcfi.js:134`).
     Consequência: dois trechos que começam no mesmo ponto — ou um trecho e um
     marcador de parágrafo no mesmo início — colidiriam no `syncKey`, e
     `areCfisEquivalent` os trataria como o mesmo registro. Se a spec escolher
     estender `bookmarks`, a chave de sync **precisa** incorporar o fim do range; a
     alternativa é tabela nova (Dexie v19 — a atual é v18 em
     [database.ts:376](src/db/database.ts#L376); o `CLAUDE.md` está desatualizado
     dizendo v16) com história de sync própria.
  3. **Ordem de validação**: confirmar em device, **antes** de escrever o gesto, o
     que o long-press faz hoje no WebView e se o `click` de dispensa da seleção vaza
     pro fluxo de tradução. É o `unknown` do scorecard e a premissa da Abordagem 1 —
     se cair, o plano B é a Abordagem 3.
