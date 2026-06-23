# Relatorio de Code Review - Tela de Leitura

Data: 2026-06-22

## Resumo executivo

A tela de leitura esta bem encaminhada nos fluxos principais: abertura do EPUB, renderizacao via Foliate, progresso, indice, bookmarks, ajustes de aparencia, traducao inline e TTS. A separacao entre `ReaderScreen` e `EpubViewer` e adequada para o nivel de complexidade atual: o `ReaderScreen` coordena estado React, banco e UI externa; o `EpubViewer` concentra a integracao com o documento EPUB dentro do iframe.

Nao encontrei achado P1 na revisao. Os principais riscos estao em:

- navegacao inicial duplicada quando a tela abre com `startHref`;
- fluxo de arquivo ausente detectado em runtime nao refletir imediatamente a UI de remocao;
- pequenos problemas de ciclo de vida em timers;
- lacunas de UX e arquitetura para evoluir de toque simples para toque longo com selecao de texto.

O comportamento atual de touch funciona para o modelo existente: toque simples em paragrafo abre o menu contextual/traducao, toque na lateral direita abre o chrome/menu do leitor, e scroll curto tenta ser filtrado para evitar click residual no Android WebView. Para implementar toque longo com selecao, a base e viavel, mas precisa de uma camada explicita de estado de gesto para evitar conflito com o handler de `click` atual.

## Escopo revisado

Arquivos principais:

- `src/screens/ReaderScreen.tsx`
- `src/components/reader/EpubViewer.tsx`
- `src/components/reader/ReaderChrome.tsx`
- `src/components/reader/TocDrawer.tsx`
- `src/components/reader/BookmarkSheet.tsx`
- `src/components/reader/ReaderAppearanceControls.tsx`
- `src/hooks/useReaderProgress.ts`
- `src/hooks/useReaderAppearance.ts`
- `src/hooks/useChromeAutoHide.ts`
- `src/hooks/useCapacitorAppListener.ts`
- `src/store/readerStore.ts`

Testes inspecionados/executados:

- `src/__tests__/screens/ReaderScreen.test.tsx`
- `src/__tests__/components/EpubViewer.test.tsx`
- `src/__tests__/components/ReaderChrome.test.tsx`
- `src/__tests__/components/TocDrawer.test.tsx`
- `src/__tests__/hooks/useReaderProgress.test.tsx`
- `src/__tests__/hooks/useReaderAppearance.test.tsx`
- `src/__tests__/hooks/useChromeAutoHide.test.ts`

## Funcionamento atual

### Abertura e renderizacao do livro

`ReaderScreen` espera o progresso salvo e as preferencias carregarem antes de montar o viewer. O `EpubViewer` cria o custom element `foliate-view`, abre o arquivo via `BookFileResolver`, configura o renderer em modo `scrolled`, injeta CSS de leitura e registra listeners nos documentos carregados pelo Foliate.

Pontos positivos:

- O viewer limpa estado interno no cleanup.
- O renderer e configurado uma vez por livro.
- O codigo trata CFI salvo, `startHref`, indice e fallback para inicio do texto.
- Ha sanitizacao passiva de conteudo EPUB para remover scripts e handlers inline.
- Ha timeout de abertura para evitar loading infinito em EPUB problemático.

### Progresso de leitura

O progresso e salvo por debounce e tambem em momentos de saida:

- botao voltar;
- back fisico do Android;
- `appStateChange` inativo;
- `visibilitychange`;
- `pagehide`;
- cleanup do componente.

Isso reduz bem a chance de perda da ultima posicao.

### Indice

O TOC usa matching por `href`, label e normalizacao de prefixos/sufixos. Ha testes para casos em que o `href` do indice e o path do spine usam prefixos diferentes.

### Bookmarks

Bookmarks sao lidos via `useLiveQuery`, filtrados por `deletedAt`, renderizados dentro do EPUB por atributo `data-nr-bookmark` e mutados por soft delete/restore. O fluxo de toggle evita duplicacao por CFI equivalente e usa `pendingBookmarkKeysRef` para evitar mutacao repetida enquanto uma operacao esta em andamento.

### Traducao inline

O toque em paragrafo seleciona uma frase, injeta loading inline, chama o servico de traducao pelo `ReaderScreen` e depois injeta o resultado no documento. O viewer bloqueia novas selecoes enquanto ha traducao em progresso, evitando dois paragrafos ativos simultaneamente.

### TTS

O TTS integrado ao leitor usa chunks por frase, highlight de paragrafo/palavra, navegacao entre paragrafos e auto-avanco entre secoes. O comportamento especifico de TTS foi revisado em relatorio separado: `docs/relatorio-code-review-tts.md`.

## Findings

### P2 - Navegacao inicial duplicada para `startHref`

Evidencia:

- `ReaderScreen` passa `initialTarget={startHref ?? null}` para o `EpubViewer`.
- O `EpubViewer` ja tenta navegar para esse alvo durante a abertura, em `navigateToInitialReaderTarget`.
- Depois, no `onLoad`, o `ReaderScreen` chama `viewerRef.current?.goTo(startHref)` novamente.

Arquivos:

- `src/screens/ReaderScreen.tsx:826`
- `src/screens/ReaderScreen.tsx:831`
- `src/components/reader/EpubViewer.tsx:2674`

Impacto:

- Possivel duplo `relocate`.
- Possivel re-scroll/flicker na abertura por indice/bookmark.
- Estado de loading fica mais dificil de razonar, porque dois componentes tentam ser donos da navegacao inicial.

Recomendacao:

Escolher um unico dono para a navegacao inicial. A opcao mais limpa e deixar o `EpubViewer` navegar com `initialTarget` e fazer o `ReaderScreen` apenas esperar o `relocate`/`onSectionReady` compativel para liberar progresso e loading. Se o fallback do `ReaderScreen` ainda for necessario, ele deve ser condicionado a uma falha explicita da navegacao inicial, nao ao `onLoad` normal.

### P2 - Arquivo ausente detectado em runtime nao atualiza imediatamente a UI de remocao

Evidencia:

- `BookFileResolver` marca `missingFile: true` no banco quando nao consegue resolver/abrir o arquivo.
- `ReaderScreen` decide mostrar titulo e botao de remover usando apenas `book.missingFile` recebido por props.

Arquivos:

- `src/services/BookFileResolver.ts:15`
- `src/services/BookFileResolver.ts:37`
- `src/screens/ReaderScreen.tsx:1065`
- `src/screens/ReaderScreen.tsx:1076`

Impacto:

Se o arquivo desapareceu desde a ultima listagem, a abertura falha e o banco e atualizado, mas a tela atual pode mostrar apenas erro generico e botao de voltar, sem o CTA de remover da biblioteca ate a tela ser reaberta/atualizada.

Recomendacao:

Quando `onError` receber erro de arquivo ausente, refletir isso em estado local da tela ou recarregar o livro atualizado do banco. O ideal e um estado local como `isMissingFile = book.missingFile || detectedMissingFile`.

### P3 - Timer do chrome auto-hide nao e limpo no unmount

Evidencia:

- `useChromeAutoHide` agenda `setTimeout(() => setChromeVisible(false), delayMs)`.
- O hook nao tem cleanup para limpar o timer quando desmonta.

Arquivo:

- `src/hooks/useChromeAutoHide.ts:17`

Impacto:

Pequeno vazamento de timer e possibilidade de update apos desmontagem em navegacoes rapidas.

Recomendacao:

Adicionar `useEffect(() => () => clearTimeout(timerRef.current), [])` ou helper de cleanup.

### P3 - `handleTtsPrev` nao protege contra lista vazia de chunks

Evidencia:

- `handleTtsPrevSentence` e `handleTtsNext` retornam quando `chunks.length === 0`.
- `handleTtsPrev` nao faz essa checagem e pode chamar `startPlay([], 0)`.

Arquivo:

- `src/screens/ReaderScreen.tsx:523`

Impacto:

Em secao sem texto legivel ou estado stale do mini player, o botao de voltar paragrafo pode deixar a UI de TTS em estado inconsistente.

Recomendacao:

Adicionar guarda `if (chunks.length === 0) return`.

### P3 - Estado de progresso nao e totalmente escopado por `bookId` se o hook for reutilizado

Evidencia:

- `lastPersistedKeyRef` e `pendingProgressRef` sobrevivem a mudanca de `bookId` dentro da mesma instancia do hook.
- A chave de deduplicacao nao inclui `bookId`.

Arquivo:

- `src/hooks/useReaderProgress.ts:22`

Impacto:

O fluxo atual tende a desmontar a tela ao sair do leitor, entao o risco pratico e menor. Ainda assim, se a tela for reutilizada com outro livro no futuro, pode haver deduplicacao incorreta ou flush de payload anterior.

Recomendacao:

Resetar `lastPersistedKeyRef` e `pendingProgressRef` em efeito dependente de `bookId`, ou incluir `bookId` na chave persistida.

## Analise de touch atual

### Comportamento implementado

O touch/click do EPUB fica dentro do `EpubViewer`, em listeners registrados no `Document` do iframe carregado pelo Foliate.

Fluxo atual:

1. `touchstart` salva coordenadas iniciais.
2. `touchmove` marca `didScroll = true` se o deslocamento passar de `TAP_SLOP_PX`.
3. `click` residual e ignorado se `didScroll` estiver ativo.
4. Botoes do bloco de traducao tem prioridade maxima.
5. Toque dentro do bloco de traducao nao abre selecao nova.
6. A secao ativa e atualizada pelo documento tocado.
7. A lateral direita abre/fecha o chrome.
8. Zona superior/inferior abre/fecha o chrome apenas se o toque nao acertou texto legivel.
9. Toque no marcador visual de bookmark remove o bookmark.
10. Toque em texto com chrome aberto fecha o chrome e continua a acao de texto.
11. Toque fora de paragrafo legivel abre o chrome se ele estiver fechado.
12. Durante TTS ativo, toque em paragrafo navega o TTS em vez de abrir traducao.
13. Durante traducao em loading, novos taps sao bloqueados.
14. Toque no mesmo paragrafo ativo limpa a traducao.
15. Toque em outro paragrafo seleciona frase e abre traducao.

Constantes relevantes:

- `TAP_SLOP_PX = 12`
- `TOP_CHROME_TAP_ZONE_PX = 140`
- `BOTTOM_CHROME_TAP_ZONE_PX = 156`
- `CHROME_TAP_ZONE_MAX_VIEWPORT_RATIO = 0.28`
- `RIGHT_CHROME_TAP_ZONE_MIN_PX = 48`
- `RIGHT_CHROME_TAP_ZONE_MAX_PX = 72`

Arquivos:

- `src/components/reader/EpubViewer.tsx:22`
- `src/components/reader/EpubViewer.tsx:238`
- `src/components/reader/EpubViewer.tsx:248`
- `src/components/reader/EpubViewer.tsx:2478`
- `src/components/reader/EpubViewer.tsx:2491`
- `src/components/reader/EpubViewer.tsx:2552`

### Avaliacao do toque simples

O comportamento atual e coerente com a regra de produto existente: toque simples em paragrafo abre contextual/traducao; toque em zonas de chrome abre menu do leitor.

Pontos positivos:

- Ha protecao contra click residual apos scroll curto.
- A zona superior/inferior respeita texto: se o usuario toca diretamente em texto no topo, o texto ganha prioridade.
- Os botoes do bloco inline tem prioridade sobre selecao de texto.
- O modo TTS evita abrir traducao por engano.
- Ha testes cobrindo lateral direita, zona superior, toque no texto, toque fora de paragrafo, loading de traducao e TTS ativo.

Pontos de atencao:

- A lateral direita sempre ganha prioridade mesmo se o toque cair sobre texto. Em telas estreitas, os ultimos 48-72 px da direita podem roubar taps em palavras no fim da linha.
- `getTapReadableBlock` escolhe o paragrafo mais proximo quando o alvo direto nao e um bloco legivel. Isso melhora tolerancia de toque, mas faz toque em espaco entre paragrafos abrir contextual.
- Nao existe zona lateral esquerda para chrome.
- Os testes simulam `MouseEvent`/click; nao validam uma sequencia real de touch em Android WebView.

## Evolucao proposta: toque longo com selecao de texto

### Situacao atual para long press

A base e viavel:

- nao ha `user-select: none` global;
- nao ha listener de `contextmenu`;
- nao ha listener de `selectstart`;
- nao ha `preventDefault()` geral no documento;
- o codigo ja tem infraestrutura de coordenadas, hit testing e menu inline dentro do iframe.

O conflito principal e que um long press no Android WebView pode gerar um `click` residual. Sem protecao, esse click cairia no handler atual e abriria o menu contextual de paragrafo/traducao.

### Risco de conflito

Se o usuario fizer long press para selecionar texto:

1. o WebView pode abrir selecao nativa;
2. no fim do gesto pode disparar `click`;
3. o handler atual em `doc.addEventListener('click', ...)` pode interpretar como tap simples;
4. o app pode abrir a traducao de frase, limpar selecao ou sobrepor um segundo menu.

Portanto, o long press nao deve ser implementado apenas adicionando `contextmenu` ou `selectionchange`. E necessario um estado explicito de gesto.

### Arquitetura recomendada

Adicionar estado por documento carregado:

- `longPressTimer`
- `longPressActive`
- `suppressNextClickUntil`
- `touchStartX`
- `touchStartY`
- `selectionMenuOpen`

Fluxo recomendado:

1. No `touchstart` ou `pointerdown`, se o alvo for texto/paragrafo valido, iniciar timer de long press, por exemplo 450-550 ms.
2. No `touchmove`, cancelar o timer se passar de `TAP_SLOP_PX`.
3. Quando o timer disparar, marcar `longPressActive = true` e `suppressNextClickUntil = Date.now() + 700`.
4. Permitir selecao nativa do WebView; nao chamar `preventDefault()` globalmente.
5. No `touchend` ou `selectionchange`, ler `doc.getSelection()?.toString().trim()`.
6. Se houver texto selecionado, abrir o novo menu de selecao.
7. No inicio do handler de `click`, retornar cedo se `longPressActive` ou se `Date.now() < suppressNextClickUntil`.
8. Ao fechar o menu de selecao, limpar selecao nativa e estado do gesto.

### Onde renderizar o novo menu

Recomendacao: renderizar o menu de selecao dentro do proprio documento EPUB, no `EpubViewer`.

Motivos:

- As coordenadas do range selecionado pertencem ao iframe/documento do Foliate.
- `Range.getBoundingClientRect()` retorna coordenadas relativas ao viewport do documento.
- Evita conversoes frageis de coordenadas entre iframe, tela React e scroll do renderer.
- O viewer ja injeta o bloco de traducao e consegue estilizar elementos dentro do EPUB.

### Regras de produto sugeridas

Toque simples:

- Paragrafo: abre contextual/traducao atual.
- Lateral direita: abre/fecha chrome.
- Superior/inferior fora de texto: abre/fecha chrome.
- Fora de texto: abre chrome se estiver fechado.

Toque longo:

- Texto selecionavel: ativa selecao nativa e abre menu de selecao.
- Fora de texto: nao deve abrir traducao.
- Durante loading de traducao: bloquear long press.
- Durante TTS ativo: recomendacao inicial e bloquear long press ou pausar TTS antes de permitir selecao.
- Dentro do bloco de traducao: manter prioridade dos botoes e nao abrir selecao.

### Menu de selecao recomendado

Acoes candidatas:

- Traduzir selecao
- Copiar
- Ouvir selecao
- Salvar vocabulario
- Criar bookmark com snippet selecionado

Cuidados:

- O menu de selecao nao deve reutilizar diretamente `activeTranslationParaRef`, porque a selecao pode atravessar inline elements ou parte de um paragrafo.
- A traducao por selecao deve carregar `sourceText` diretamente da selecao, nao de `getSentenceFromClick`.
- Se a selecao atravessar mais de um paragrafo, limitar a primeira versao a texto selecionado plano e nao tentar highlight por frase.

### Testes recomendados para a evolucao

Adicionar testes em `src/__tests__/components/EpubViewer.test.tsx`:

- long press em texto nao chama `onTranslate` do tap simples;
- long press com selecao abre menu de selecao;
- `click` residual apos long press e ignorado;
- movimento acima de `TAP_SLOP_PX` cancela long press e preserva scroll;
- tap simples continua abrindo traducao;
- lateral direita continua abrindo chrome;
- zona superior em texto continua selecionando/traduzindo no tap simples;
- long press durante `translationInProgress` e ignorado;
- long press durante TTS ativo segue a regra definida;
- fechar menu de selecao limpa selecao nativa e estado interno.

Validacao manual recomendada:

- Android WebView real, porque JSDOM nao reproduz fielmente long press, selecao nativa e click residual.
- Testar em tela estreita, com texto no fim da linha, para avaliar conflito com zona lateral direita.
- Testar em EPUB com paragrafos curtos, headings, links e texto em elementos inline.

## Verificacoes executadas

Comandos executados durante a revisao:

```bash
npm test -- --run src/__tests__/screens/ReaderScreen.test.tsx src/__tests__/components/EpubViewer.test.tsx src/__tests__/components/ReaderChrome.test.tsx src/__tests__/components/TocDrawer.test.tsx src/__tests__/hooks/useReaderProgress.test.tsx src/__tests__/hooks/useReaderAppearance.test.tsx src/__tests__/hooks/useChromeAutoHide.test.ts
```

Resultado:

- 7 arquivos de teste passaram.
- 100 testes passaram.

```bash
npx eslint src/screens/ReaderScreen.tsx src/components/reader/EpubViewer.tsx src/components/reader/ReaderChrome.tsx src/components/reader/TocDrawer.tsx src/components/reader/BookmarkSheet.tsx src/components/reader/ReaderAppearanceControls.tsx src/hooks/useReaderProgress.ts src/hooks/useReaderAppearance.ts src/hooks/useChromeAutoHide.ts src/hooks/useCapacitorAppListener.ts src/store/readerStore.ts
```

Resultado:

- passou sem erros.

```bash
npm test -- --run src/__tests__/components/EpubViewer.test.tsx
```

Resultado:

- 1 arquivo de teste passou.
- 52 testes passaram.

```bash
adb devices
```

Resultado:

- nenhum dispositivo conectado.

## Recomendacao de prioridade

Prioridade recomendada antes de evoluir touch longo:

1. Remover a duplicidade da navegacao inicial por `startHref`.
2. Ajustar UI de arquivo ausente detectado em runtime.
3. Adicionar cleanup do timer em `useChromeAutoHide`.
4. Adicionar guarda de chunks vazios em `handleTtsPrev`.
5. Implementar camada de estado de gesto para long press.
6. Implementar menu de selecao dentro do iframe/documento EPUB.
7. Validar em Android real com WebView.

## Conclusao

A tela de leitura tem uma base solida para continuar evoluindo. O touch simples atual funciona e esta coberto por testes unitarios, mas a proxima evolucao para long press precisa tratar explicitamente o ciclo de gesto para nao conflitar com o `click` atual. A decisao tecnica mais importante e separar semanticamente `tap`, `scroll`, `long press` e `click residual`; sem essa separacao, a selecao nativa pode competir com a traducao inline existente.
