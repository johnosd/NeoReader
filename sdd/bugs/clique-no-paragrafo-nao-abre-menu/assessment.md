# Bug Assessment: Clique no parágrafo não abre o menu contextual perto do início/fim do capítulo

- **Slug**: clique-no-paragrafo-nao-abre-menu
- **Criado**: 2026-09-09
- **Atualizado**: 2026-09-09 (revisão após testes ao vivo — hipótese original refutada, nova causa confirmada por reprodução determinística)
- **Origem**: texto colado (usuário)
- **Veredito**: valid
- **Severidade**: high

## Report

"sempre que inicia um capitulo novo na tela de leitura o clique no paragrafro
que abre o menu contextual não funciona" — depois refinado pelo usuário: "não
é quando abre o livro. é quando estou com o livro aberto lendo, termina um
capitulo e entro no proximo capitulo" / "o que acontece é o seguinte: estou
lendo o livro, ao chegar no final do capitulo ou no inicio a tela não
responde ao clique no paragrafo".

## Histórico desta avaliação (importante pra quem retomar)

A primeira hipótese registrada aqui (lock `translationInProgressRef` travado
por reciclagem de iframe do foliate-js) foi **testada e refutada** via
Playwright (rolagem real por 6+ capítulos com tradução propositalmente
atrasada — nunca travou) e via device Android real (inconclusivo por
limitação de automação, mas nenhuma trava observada nos casos capturados).
Essa hipótese foi descartada. A causa raiz abaixo é uma reavaliação completa,
feita depois de capturar o console do navegador enquanto o usuário reproduzia
o bug ao vivo (via `npm run dev`, mesma janela Playwright compartilhada) — os
logs `NeoReaderEvent` pegaram o exato momento da falha, e a partir disso a
causa foi confirmada com reprodução determinística (um único clique).

## Symptom

Perto do início ou do fim de um capítulo, tocar num parágrafo pra abrir o
menu de tradução inline não faz nada — nenhum menu abre, sem erro visível.
Não é uma corrida/race condition: é **determinístico e reproduzível com um
único clique**, sempre que o parágrafo tocado cai perto do topo ou do fundo
da seção/iframe daquele capítulo.

## Reproduction

Capturado ao vivo (console do usuário, sessão `mtuithrm-2kkhkl`, livro "Como
fazer amigos e influenciar pessoas", `bookId 1503`): o usuário tocou um
parágrafo (abriu tradução com sucesso), e todos os toques seguintes no
parágrafo imediatamente depois falharam da mesma forma, repetidamente, por
~10s:

```
19:58:23.781 reader.selection.start sectionIndex=1 paragraphIndex=3 (abriu tradução, OK)
19:58:25.060 reader.tap.ignored reason="translation-block" sectionIndex=1 paragraphIndex=3
19:58:25.909 reader.tap.ignored reason="chrome-zone" zone="visible" sectionIndex=1 paragraphIndex=4
19:58:26.677 reader.tap.ignored reason="chrome-zone" zone="visible"   ← repetido
19:58:27.229 reader.tap.ignored reason="chrome-zone" zone="visible"   ← repetido
19:58:27.805 / 28.277 / 28.885 / 29.518 / 30.405 / 35.958  ← mesmo padrão, 9x no total
```

Reproduzi de forma **determinística e instantânea** (livro "The Lightning
Thief", capítulo 5, sectionIndex 9): toquei um parágrafo (abriu a tradução,
inserindo o painel — spinner + texto traduzido + botões — logo abaixo dele),
depois toquei o PRÓXIMO parágrafo visível, curto ("Bring him inside.""),
posicionado logo depois do painel:

```
20:02:57.501 reader.tap.ignored reason="chrome-zone" zone="visible" sectionIndex=9 paragraphIndex=140
```

Um único clique, sem qualquer corrida de tempo. Passos:
1. Tocar num parágrafo qualquer pra abrir a tradução inline (painel aparece
   embaixo dele).
2. Tocar no parágrafo seguinte, aquele que ficou empurrado pra baixo pelo
   painel recém-inserido.
3. Nada abre — `reader.tap.ignored` com `reason: "chrome-zone", zone: "visible"`.

**Confirmado também SEM nenhuma tradução aberta** (o usuário apontou que o
painel de tradução não é necessário pro bug — corrigido e reproduzido de
novo): livro
`debug-books/Como fazer amigos e influenciar pessoas -- Dale Carnegie...epub`,
capítulo "CAPÍTULO 4 Pingo de mel" (Parte III), aberto direto via TOC (sem
tocar em nada antes). O último parágrafo real da seção,
"Comece de maneira amigável.", termina a ~6871px do topo do documento HTML
daquela seção (`scrollHeight` total = 6883px) — sobra uma margem de só ~12px
até o fim do documento. Um toque nessa margem, ainda visualmente colado no
parágrafo (só um pouco abaixo da última linha de texto), produziu:

```
20:18:37.049 reader.tap.ignored reason="chrome-zone" zone="visible" sectionIndex=22 paragraphIndex=48
```

Sem qualquer tradução aberta antes. Isso confirma que o painel de tradução
era só UMA forma de empurrar um parágrafo pra essa margem — a causa real é
estrutural: qualquer conteúdo perto do topo ou do fundo do HTML de uma seção
(o que é inevitável pros primeiros/últimos parágrafos de um capítulo,
especialmente se há qualquer wrapper/espaçamento de abertura ou fechamento de
capítulo) cai na mesma armadilha — ver Root Cause abaixo.

## Suspected Code Paths

- `src/components/reader/EpubViewer.tsx:346-363` — `isVisibleChromeTapZone(ev, doc)`:
  ```js
  function isVisibleChromeTapZone(ev, doc) {
    const viewportHeight = getDocumentViewportHeight(doc)
    const topZone = getVisibleChromeTapZoneSize(viewportHeight, TOP_CHROME_TAP_ZONE_PX)   // 140px
    const bottomZone = getVisibleChromeTapZoneSize(viewportHeight, BOTTOM_CHROME_TAP_ZONE_PX) // 156px
    if (viewportHeight <= 0) return ev.clientY <= topZone
    return ev.clientY <= topZone || ev.clientY >= viewportHeight - bottomZone
  }
  ```
- `src/components/reader/EpubViewer.tsx:332-337` — `getDocumentViewportHeight(doc)`:
  ```js
  function getDocumentViewportHeight(doc) {
    return doc.defaultView?.innerHeight || doc.documentElement.clientHeight || doc.body?.clientHeight || 0
  }
  ```
  Isso lê a altura da JANELA DO IFRAME DA SEÇÃO — não a altura da tela
  visível. Confirmado ao vivo: no livro de teste, o iframe da seção que
  continha "Bring him inside."" tinha ~10798px de altura total (via
  `frameElement.boundingBox()`), e o parágrafo estava a ~10768px do topo
  DESSE IFRAME — ou seja, a ~30px do FIM do iframe, mesmo aparecendo no MEIO
  da tela visível pro usuário.
- `src/components/reader/EpubViewer.tsx:3885-3894` — uso da zona no handler de
  `click`:
  ```js
  const rightChromeTapZone = isRightChromeTapZone(ev, ownerDocument)
  const visibleChromeTapZone = !tapHitsReadableText && isVisibleChromeTapZone(ev, ownerDocument)
  if (rightChromeTapZone || visibleChromeTapZone) {
    logReaderTapIgnored('chrome-zone', para, { zone: ..., tapHitsReadableText })
    onCenterTapRef.current()
    return
  }
  ```
- `vite.config.ts` / `view.renderer.setAttribute('flow', 'scrolled')` (EpubViewer.tsx ~4009) —
  em modo `scrolled`, cada seção do EPUB é um iframe dimensionado pra caber
  TODO o conteúdo da seção (o scroll de verdade acontece na página externa,
  não dentro do iframe) — por isso `doc.defaultView.innerHeight` não reflete
  a tela física, e sim a altura total daquela seção.
- `src/services/DiagnosticsLogger.ts:38-63` (`CONTENT_KEYS`) — achado
  secundário, não é a causa do bug: o campo `tapHitsReadableText` (um
  booleano) aparece redigido como `[redacted:taphitsreadabletext]` nos logs
  porque o nome do campo contém a substring `"text"`, que está em
  `CONTENT_KEYS` — o sanitizador não devia redigir booleanos, só strings de
  conteúdo. Isso só dificultou um pouco a investigação (não pude confirmar o
  valor exato do campo pelo log, precisei confirmar pela ramificação do
  código); não faz parte do escopo da correção deste bug, mas vale registrar.

## Root Cause Hypothesis

**Confiança: high — confirmada por reprodução determinística, três vezes**
**(duas com painel de tradução empurrando o parágrafo, uma sem nenhuma**
**tradução envolvida, no livro e capítulo que o usuário pediu pra testar).**
`isVisibleChromeTapZone` usa `doc.defaultView.innerHeight` (a altura da
JANELA DO IFRAME daquela seção do EPUB) como se fosse a altura da tela
visível, para decidir se um toque caiu na faixa superior (140px) ou inferior
(156px) da "tela" — faixas que deveriam representar a barra de status/chrome
física do app. Mas no modo de leitura contínua (`flow=scrolled`), cada seção
carrega num iframe dimensionado para caber TODO o seu conteúdo (a rolagem de
verdade acontece na página externa) — então `innerHeight` desse iframe é a
altura total daquela seção (pode ser milhares de pixels), não a altura da
tela do dispositivo. Como consequência, **qualquer parágrafo que estruturalmente
esteja perto do topo ou do fundo do HTML daquela seção — o que é inevitável
para os primeiros/últimos parágrafos de um capítulo, ou para qualquer
parágrafo empurrado pra perto do fim por um painel de tradução aberto acima
dele — cai dentro da faixa de 140/156px "do topo/fundo da seção", mesmo
aparecendo no meio da tela física.** Quando isso acontece E o toque não bate
exatamente dentro do rect do próprio parágrafo (`tapHitsReadableText`), o
código interpreta como "toque na margem do chrome" e só alterna a barra de
navegação (`onCenterTapRef`), sem abrir a tradução — silenciosamente, sem
erro.

## Proposed Remediation

**Preferida**: trocar a fonte de "altura da tela visível" em
`isVisibleChromeTapZone`/`getDocumentViewportHeight` — em vez de
`doc.defaultView.innerHeight` (altura do iframe da seção), usar a altura real
do viewport físico do leitor (ex.: a altura do elemento contêiner externo do
`foliate-view`, ou `window.innerHeight` da janela de nível superior onde o
`EpubViewer` está montado — não a do documento do iframe). Isso provavelmente
exige passar essa altura como parâmetro pra `isVisibleChromeTapZone`, em vez
de derivá-la de dentro da função a partir do `doc` do iframe.

**Alternativas** (opcional):
- Calcular a distância do parágrafo tocado até o topo/fundo da ÁREA VISÍVEL
  (não do documento do iframe) usando `container.getBoundingClientRect()` do
  elemento externo que efetivamente contém a tela — equivalente à preferida,
  só descrita de outro ângulo.
- Restringir a zona de chrome a exigir também `!para` (nenhum parágrafo
  encontrado) além de `!tapHitsReadableText` — reduziria falsos positivos
  quando HÁ um parágrafo real ali, mas não resolve o caso em que o clique
  realmente cai fora do rect exato do parágrafo (linhas com pouco texto,
  espaçamento entre linhas) — tratamento mais parcial que a preferida.

**Files likely to change**:
- `src/components/reader/EpubViewer.tsx` (`getDocumentViewportHeight`,
  `isVisibleChromeTapZone`, e o(s) `addEventListener('click', ...)`/chamadas
  que hoje passam só `ownerDocument` — vai precisar repassar a altura real do
  viewport físico até esses pontos)

**Tests to add or update**:
- `src/__tests__/components/EpubViewer.test.tsx`: teste que simula um iframe
  de seção MUITO mais alto que a "tela" (mock de
  `doc.defaultView.innerHeight` grande, tipo o teste já faz com
  `injectFakeWindow`/`setViewportHeight`), posiciona um parágrafo perto do
  fim desse iframe alto, mas com coordenada de clique correspondente ao MEIO
  da tela física — e afirma que `onTranslate` É chamado (hoje seria ignorado
  como `chrome-zone`).
- Teste adicional reproduzindo o cenário exato capturado ao vivo: abrir
  tradução num parágrafo, depois clicar no parágrafo imediatamente seguinte
  (empurrado pra baixo pelo painel) — deve abrir tradução pra ele também, não
  ser ignorado.

## Risks & Considerations

- A zona de chrome (`isVisibleChromeTapZone`/`isRightChromeTapZone`) existe
  de propósito — toques nas bordas física da tela devem alternar a barra de
  navegação mesmo caindo sobre texto (comentário original: "toque na margem
  superior/inferior alterna o chrome, mesmo que caia sobre texto"). A
  correção não deve remover esse comportamento pras bordas FÍSICAS reais —
  só corrigir a métrica de altura usada pra decidir onde essas bordas estão.
- `isRightChromeTapZone` usa `getDocumentViewportWidth` (`innerWidth`) — a
  LARGURA do iframe provavelmente bate com a largura real da tela mesmo em
  modo `scrolled` (só a altura cresce pra caber o conteúdo, a largura não).
  Ainda assim, vale confirmar isso na fase Fix antes de assumir que só a
  altura precisa de correção.
- Achado secundário (não bloqueante): `tapHitsReadableText` sendo redigido
  nos logs de diagnóstico por causa do nome do campo conter "text" — vale
  registrar como possível fix futuro (não faz parte do escopo deste bug).

## Open Questions

Nenhuma pendente — causa confirmada por reprodução determinística direta
(não depende de mais informação do usuário).
