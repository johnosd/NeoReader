# Plano: Visualizacao E Zoom De Imagens No Leitor

## Metadados

- Feature: visualizar imagens tocadas dentro do leitor EPUB, com zoom por pinch no mobile.
- Data: 2026-07-08.
- Status: concluido; QA Android aprovado.
- Contexto de autoria: plano criado via skill `plan-feature`, a partir do item "Permitir clicar em imagens para poder visualizar imagem, pode dar zoom na imagem, sem entrar em conflito com menu de contexto de traducao".
- Plataforma prioritaria: Android/mobile; manter web funcional como regressao basica.

## Acompanhamento

- Ao concluir cada fase, atualizar este plano com:
  - resumo objetivo do que foi feito;
  - arquivos alterados;
  - comandos de verificacao executados e resultado;
  - proximo passo recomendado.
- Fase atual concluida: Fase 5.
- Proximo passo recomendado: preparar commit/PR da feature.

## Registro De Progresso

### 2026-07-08: Fase 1 Concluida

O que foi feito:

- Criado o contrato `ReaderImageOpenPayload` e a prop opcional `onOpenImage` em `EpubViewer`.
- Adicionado `readerImagePreview` em `ReaderScreen`.
- Integrado `ImageZoomModal` ao leitor usando `handleOpenImage`.
- Ajustado o Back fisico do Android para fechar a imagem antes de fechar sheets ou sair do leitor.
- Adicionados testes de abertura/fechamento do modal e fechamento pelo Back Android.

Arquivos alterados:

- `src/components/reader/EpubViewer.tsx`
- `src/screens/ReaderScreen.tsx`
- `src/__tests__/screens/ReaderScreen.test.tsx`
- `docs/features/visualizacao-zoom-imagens-leitor.md`

Verificacao:

- `npm test -- ReaderScreen.test.tsx`: passou.
- `npm run build`: passou.
- `npx eslint src/components/reader/EpubViewer.tsx src/screens/ReaderScreen.tsx src/__tests__/screens/ReaderScreen.test.tsx`: passou.

Proximo passo:

- Iniciar a Fase 2 em `src/components/reader/EpubViewer.tsx`, criando a deteccao de imagem no listener `doc.addEventListener('click', ...)` antes do fluxo de paragrafo/traducao/TTS.

### 2026-07-08: Fase 2 Concluida

O que foi feito:

- Criados helpers de deteccao de imagem no iframe do EPUB.
- Toques em `img`, `picture img` e `svg image` agora resolvem um `ReaderImageOpenPayload`.
- A imagem e detectada tambem via `document.elementFromPoint` quando o alvo direto nao e o elemento de imagem.
- O clique em imagem agora tem prioridade sobre traducao, chrome e TTS, mas continua respeitando gesto de scroll e bloco de traducao.
- O evento diagnostico `reader.image.open` registra apenas metadados seguros, sem URL da imagem.
- Adicionados testes para abertura por imagem, fallback `elementFromPoint`, TTS/chrome, scroll-gesture e imagem dentro do bloco de traducao.

Arquivos alterados:

- `src/components/reader/EpubViewer.tsx`
- `src/__tests__/components/EpubViewer.test.tsx`
- `docs/features/visualizacao-zoom-imagens-leitor.md`

Verificacao:

- `npm test -- EpubViewer.test.tsx`: passou.
- `npm test -- ReaderScreen.test.tsx`: passou.
- `npx eslint src/components/reader/EpubViewer.tsx src/__tests__/components/EpubViewer.test.tsx src/screens/ReaderScreen.tsx src/__tests__/screens/ReaderScreen.test.tsx`: passou.
- `npm run build`: passou.

Validacao manual:

- Usuario tocou em uma imagem no leitor: a imagem abriu.
- Usuario fechou a imagem aberta: voltou ao leitor.
- Menu contextual/traducao continuou funcionando no texto.
- TTS leu os textos e pulou as imagens, sem conflito observado.

Proximo passo:

- Iniciar a Fase 3 revisando `src/components/reader/ImageZoomModal.tsx`, adicionando acessibilidade basica e validando se o pinch nativo e suficiente no Android WebView.

### 2026-07-08: Fase 3 Concluida

O que foi feito:

- `ImageZoomModal` agora aceita `alt` vindo do payload da imagem.
- O modal ganhou `role="dialog"`, `aria-modal="true"` e foco inicial no botao fechar.
- O botao fechar respeita safe area no topo e nao propaga clique para o fundo.
- `Escape` fecha o modal na web/desktop.
- O toque dentro da area da imagem nao fecha o modal por acidente.
- Na primeira implementacao, o pinch nativo foi mantido com `touch-action: pinch-zoom`; pinch/pan customizado ainda nao tinha sido implementado por falta de evidencia de falha no Android.

Arquivos alterados:

- `src/components/reader/ImageZoomModal.tsx`
- `src/screens/ReaderScreen.tsx`
- `src/__tests__/components/ImageZoomModal.test.tsx`
- `src/__tests__/screens/ReaderScreen.test.tsx`
- `docs/features/visualizacao-zoom-imagens-leitor.md`

Verificacao:

- `npm test -- ImageZoomModal.test.tsx`: passou.
- `npm test -- ReaderScreen.test.tsx`: passou.
- `npm test -- ImageZoomModal.test.tsx ReaderScreen.test.tsx EpubViewer.test.tsx`: passou, 80 testes.
- `npx eslint src/components/reader/ImageZoomModal.tsx src/__tests__/components/ImageZoomModal.test.tsx src/screens/ReaderScreen.tsx src/__tests__/screens/ReaderScreen.test.tsx src/components/reader/EpubViewer.tsx src/__tests__/components/EpubViewer.test.tsx`: passou.
- `npm run build`: passou. O build manteve avisos ja conhecidos do Vite sobre modulos `http`/`https`/`fs`/`url` externalizados em `pdfjs` e chunks grandes.

Risco residual:

- JSDOM nao valida pinch real. Esse risco se confirmou em QA manual Android e foi tratado depois no registro "Ajuste QA - Pinch/Pan Customizado".

Proximo passo:

- Iniciar a Fase 4 com regressao focada dos fluxos que compartilham o listener de clique: traducao em texto, bloco inline, chrome, TTS, bookmark e ausencia de troca/flush indevido ao abrir imagem.

### 2026-07-08: Fase 4 Concluida

O que foi feito:

- Revalidada a cobertura automatizada dos fluxos que compartilham o listener de clique do leitor.
- Confirmado por testes existentes que tap em texto, zonas do chrome, TTS, bookmark, bloco inline e botoes do bloco inline continuam funcionando.
- Adicionado teste especifico para garantir que abrir a visualizacao de imagem nao desmonta o viewer, nao salva progresso, nao faz flush e nao troca a localizacao do leitor.

Arquivos alterados:

- `src/__tests__/screens/ReaderScreen.test.tsx`
- `docs/features/visualizacao-zoom-imagens-leitor.md`

Verificacao:

- `npm test -- ImageZoomModal.test.tsx ReaderScreen.test.tsx EpubViewer.test.tsx`: passou, 81 testes.
- `npx eslint src/components/reader/EpubViewer.tsx src/__tests__/components/EpubViewer.test.tsx src/components/reader/ImageZoomModal.tsx src/__tests__/components/ImageZoomModal.test.tsx src/screens/ReaderScreen.tsx src/__tests__/screens/ReaderScreen.test.tsx`: passou.
- `npm run build`: passou. O build manteve avisos ja conhecidos do Vite sobre modulos `http`/`https`/`fs`/`url` externalizados em `pdfjs` e chunks grandes.
- `npm run lint`: passou.

Risco residual:

- A Fase 4 validou regressao automatizada em JSDOM. Pinch real e comportamento do Android WebView continuam dependendo da Fase 5.

Proximo passo:

- Iniciar a Fase 5 com QA manual em Android/mobile, incluindo pinch, pan, Back fisico, texto/traducao antes e depois do modal, TTS ativo e imagens com proporcoes diferentes.

### 2026-07-08: Ajuste QA - Pinch/Pan Customizado

O que foi encontrado:

- QA manual em celular confirmou que a imagem abre no leitor.
- O gesto de pinca com dois dedos nao ampliava a imagem usando apenas o pinch nativo do WebView.

O que foi feito:

- `ImageZoomModal` passou a usar Pointer Events para pinch/pan customizado.
- Dois dedos ajustam `scale`, com limite de `1` a `4`.
- Um dedo arrasta a imagem apenas quando ela esta ampliada.
- Ao voltar para escala `1`, o deslocamento e zerado.
- O modal usa `touch-none`/`touch-action: none` na superficie de gesto para evitar conflito com o zoom nativo da pagina.
- O estado de zoom e recriado a cada imagem aberta, evitando reaproveitar zoom/pan de uma imagem anterior.
- Adicionado teste unitario simulando pinca e pan no modal.

Arquivos alterados:

- `src/components/reader/ImageZoomModal.tsx`
- `src/__tests__/components/ImageZoomModal.test.tsx`
- `docs/features/visualizacao-zoom-imagens-leitor.md`

Verificacao:

- `npm test -- ImageZoomModal.test.tsx`: passou, 4 testes.
- `npm test -- ImageZoomModal.test.tsx ReaderScreen.test.tsx EpubViewer.test.tsx`: passou, 82 testes.
- `npx eslint src/components/reader/ImageZoomModal.tsx src/__tests__/components/ImageZoomModal.test.tsx src/screens/ReaderScreen.tsx src/__tests__/screens/ReaderScreen.test.tsx src/components/reader/EpubViewer.tsx src/__tests__/components/EpubViewer.test.tsx`: passou.
- `npm run build`: passou. O build manteve avisos ja conhecidos do Vite sobre modulos `http`/`https`/`fs`/`url` externalizados em `pdfjs` e chunks grandes.
- `npm run lint`: passou.

Proximo passo:

- Gerar/sincronizar nova build Android e repetir a Fase 5 no celular, especialmente pinch para ampliar/reduzir e pan com imagem ampliada.

### 2026-07-08: QA Android - Pinch/Pan Aprovado

Validacao manual:

- Usuario confirmou que a nova build funcionou perfeitamente no celular.
- A imagem abriu no leitor.
- O gesto de pinca com dois dedos passou a ampliar/reduzir a imagem.
- O pan da imagem ampliada foi considerado funcional no fluxo testado.

Proximo passo:

- Concluir a regressao manual restante da Fase 5: fechamento por botao/Back, traducao antes/depois do modal, botoes do bloco inline, TTS ativo e imagens com proporcoes diferentes.

### 2026-07-08: Fase 5 Concluida

Validacao manual Android:

- Fechamento pelo Back fisico Android aprovado.
- Traducao inline antes e depois de abrir imagem aprovada.
- Bloco inline aprovado nos botoes Next, ouvir, marcar e salvar.
- Toque em area vazia para chrome, depois toque em imagem, aprovado.
- Com TTS ativo, toque em texto e imagem confirmou a prioridade esperada.
- Imagem pequena, imagem larga e imagem alta aprovadas.
- Tema claro e tema escuro aprovados.
- Fechamento pelo botao ja havia sido validado anteriormente e continua coberto por teste automatizado.

Resultado:

- Feature aceita no fluxo Android/mobile principal.
- Nao houve conflito perceptivel com traducao inline, chrome ou TTS.

Proximo passo:

- Preparar commit/PR da feature, mantendo as alteracoes de imagem separadas de outros trabalhos em andamento quando possivel.

## Objetivo

Permitir que o usuario toque em uma imagem renderizada dentro do leitor EPUB e veja essa imagem em uma visualizacao dedicada, com suporte a zoom por pinch em mobile. O toque em imagem nao deve disparar traducao, abrir/fechar indevidamente o chrome do leitor, acionar TTS por paragrafo ou interferir nos botoes/bloco de traducao inline.

## Fora De Escopo

- Download, compartilhar, copiar imagem, OCR ou salvar imagem.
- Visualizacao de capas fora do leitor, imagens da biblioteca, notas ou detalhes do livro.
- Zoom por botoes `+/-` ou roda do mouse nesta primeira versao.
- Alteracoes no pipeline de importacao do EPUB.

## Decisoes E Premissas

- A visualizacao sera um modal/lightbox full-screen sobre o leitor. Isso preserva a posicao de leitura e evita uma rota dedicada.
- O gesto principal de abertura sera toque simples na imagem dentro do iframe do `foliate-js`.
- O zoom prioritario sera pinch no Android WebView/mobile. A implementacao pode partir do componente existente `ImageZoomModal`, mas deve validar se o pinch nativo e suficiente; se nao for, implementar pinch/pan controlado no proprio modal.
- O fluxo de traducao atual usa tap em texto, `caretRangeFromPoint` e bloco inline dentro do iframe. O codigo registra diagnostico `reader.contextMenu.open`, entao este plano trata "menu de contexto de traducao" como esse fluxo de traducao inline.
- Ao tocar em imagem com TTS ativo, a imagem deve abrir; o TTS nao deve pular para paragrafo.
- Ao tocar em imagem com chrome visivel, a imagem deve abrir. Fechar o chrome junto e aceitavel, desde que nao impeca a abertura.
- Nao registrar `src` da imagem em logs, para evitar expor caminhos locais, blob URLs ou conteudo embutido.

## Perguntas Em Aberto

- Resolvido em QA: pinch nativo de `ImageZoomModal` falhou no Android WebView; pinch/pan customizado foi implementado no modal.
- Decidir durante a implementacao se SVG inline deve abrir como imagem serializada. A primeira versao pode focar em `img`/`picture` e ignorar SVG inline sem URL se isso reduzir risco.

## Contexto Atual

- `src/components/reader/EpubViewer.tsx`
  - Carrega `foliate-js` sob demanda e recebe `doc` dos iframes no evento `load`.
  - Injeta CSS no iframe, incluindo regra para `img, svg, figure, picture` com `max-width: 100%` e `height: auto`.
  - Centraliza a interacao do leitor em `doc.addEventListener('click', ...)`.
  - A prioridade atual do clique e: gesto de scroll, botoes do bloco de traducao, bloco de traducao, ativar secao, encontrar paragrafo legivel, zonas de chrome, bookmark, fechar chrome, vazio, TTS, lock de traducao, toggle off e traducao.
  - `BLOCK` inclui texto (`p`, `li`, `blockquote`, headings), mas nao inclui `figure` nem `img`.
  - `getTapReadableBlock` pode escolher o bloco textual mais proximo quando o alvo nao e texto; por isso imagem dentro ou perto de paragrafo precisa ser detectada antes da selecao de texto.
- `src/screens/ReaderScreen.tsx`
  - Mantem estado do leitor, chrome, TOC, sheets, TTS e traducao.
  - Passa callbacks ao `EpubViewer`, incluindo `onTranslate`, `onCenterTap`, `onSpeakOne`, `onParagraphTapForTts`, `onBookmarkTap`, `onBookmarkParagraph` e `onOpenImage`.
  - Intercepta Back do Android para fechar a imagem aberta, depois sheets, antes de voltar.
- `src/components/reader/ImageZoomModal.tsx`
  - Renderiza overlay full-screen com imagem, botao fechar e pinch/pan customizado por Pointer Events.
  - Ja esta integrado a `ReaderScreen` via `readerImagePreview`.
  - O comentario depende do viewport permitir zoom; `index.html` usa `width=device-width, initial-scale=1.0, viewport-fit=cover` e nao bloqueia `user-scalable`.
- `src/__tests__/components/EpubViewer.test.tsx`
  - Tem helpers para carregar documento falso no `foliate-view` mock e testar taps no iframe.
  - Ja cobre traducao, zonas de chrome, scroll-gesture, TTS, bloco inline e bookmarks.
- `src/__tests__/screens/ReaderScreen.test.tsx`
  - Mocka `EpubViewer` e captura props em `mocks.epubViewerProps`, bom ponto para testar integracao do modal.

## Arquitetura Proposta

1. `EpubViewer` recebe uma nova prop, por exemplo `onOpenImage?: (payload: ReaderImageOpenPayload) => void`.
2. No listener de clique do documento do iframe, depois de tratar scroll e botoes/bloco de traducao, detectar se o ponto tocado corresponde a uma imagem do EPUB.
3. Resolver a URL exibivel da imagem a partir de `HTMLImageElement.currentSrc || HTMLImageElement.src || getAttribute('src')`, ignorando valores vazios ou `javascript:`.
4. Ao encontrar imagem valida, chamar `ev.preventDefault()`, `ev.stopPropagation()` e `onOpenImage(payload)`.
5. `ReaderScreen` guarda o payload em estado local e renderiza `ImageZoomModal` acima de `ReaderChrome`, footer, TTS e sheets.
6. `ImageZoomModal` exibe a imagem com fundo preto, botao fechar, fechamento por Back/Esc/clique fora quando aplicavel e pinch/pan no mobile.

Payload sugerido:

```ts
export interface ReaderImageOpenPayload {
  src: string
  alt?: string
  naturalWidth?: number
  naturalHeight?: number
  sectionIndex?: number
}
```

## Fase 1: Contrato E Estado No ReaderScreen

Proposito: criar a ponte React entre o iframe do EPUB e o modal ja existente.

Arquivos provaveis:

- `src/components/reader/EpubViewer.tsx`
- `src/screens/ReaderScreen.tsx`
- `src/components/reader/ImageZoomModal.tsx`
- `src/__tests__/screens/ReaderScreen.test.tsx`

Checklist:

- [x] Exportar tipo `ReaderImageOpenPayload` em `EpubViewer.tsx`.
- [x] Adicionar prop opcional `onOpenImage` em `EpubViewerProps`.
- [x] Criar `onOpenImageRef` com `useSyncRef`, seguindo o padrao dos callbacks existentes.
- [x] Importar `ImageZoomModal` em `ReaderScreen.tsx`.
- [x] Adicionar estado local `readerImagePreview: ReaderImageOpenPayload | null`.
- [x] Passar `onOpenImage={handleOpenImage}` ao `EpubViewer`.
- [x] Renderizar `ImageZoomModal` quando houver imagem selecionada.
- [x] Ajustar `useCapacitorBackButton` para fechar o modal antes de TOC, bookmark sheet, appearance sheet ou voltar.
- [x] Considerar `resetAutoHide()` ao abrir imagem para evitar chrome reabrindo sobre o modal.

Testes:

- [x] Em `ReaderScreen.test.tsx`, disparar `mocks.epubViewerProps.onOpenImage({ src: 'blob:test', alt: 'Figura' })` e validar que o modal aparece.
- [x] Testar que o botao fechar remove o modal.
- [x] Testar que Back do Android fecha o modal antes de chamar `onBack`.

Aceite:

- O modal pode ser aberto por callback do viewer.
- Fechar modal retorna ao leitor sem desmontar o `EpubViewer`.
- O Back fisico fecha a imagem primeiro.

Riscos e validacao:

- `ReaderScreen.test.tsx` ja mocka muitos componentes; manter o teste focado para nao aumentar fragilidade.
- Cuidado com z-index: o modal deve ficar acima do footer, mini player, chrome e toasts.

## Fase 2: Deteccao De Toque Em Imagem No Iframe

Proposito: garantir que toque em imagem abre o modal e nao entra no fluxo de traducao.

Arquivos provaveis:

- `src/components/reader/EpubViewer.tsx`
- `src/__tests__/components/EpubViewer.test.tsx`

Checklist:

- [x] Criar helper `getImageTapTarget(target, doc, clientX, clientY)`.
- [x] Detectar imagem por alvo direto e por `doc.elementFromPoint`, usando `img`, `picture img` e, se simples, `svg image`.
- [x] Evitar detectar imagens dentro de `#nr-translation-block`.
- [x] Resolver `src` com prioridade para `currentSrc`, depois `src`, depois atributo `src`.
- [x] Capturar `alt`, `naturalWidth`, `naturalHeight` quando disponiveis.
- [x] Inserir a deteccao no listener de clique depois de `isTranslationBlockTap(...)` e antes de `getTapReadableBlock(...)` ou qualquer zona de chrome/TTS/traducao.
- [x] Chamar `preventDefault` e `stopPropagation` ao abrir a imagem.
- [x] Adicionar evento diagnostico `reader.image.open` sem incluir URL da imagem.
- [x] Nao implementado nesta fase: CSS `img { cursor: zoom-in; }`, por ser acabamento visual e a prioridade ser mobile.

Testes:

- [x] `tap em img chama onOpenImage`.
- [x] `tap em img nao chama onTranslate nem onCenterTap`.
- [x] `tap em img dentro de paragrafo nao traduz o paragrafo`.
- [x] `tap em img com chrome visivel abre imagem sem alternar indevidamente o chrome`.
- [x] `tap em img com ttsGlobalActive abre imagem e nao chama onParagraphTapForTts`.
- [x] `scroll gesture sobre img nao abre imagem`.
- [x] `tap em imagem/icone dentro do bloco de traducao continua sendo tratado pelo bloco de traducao`.

Aceite:

- O toque em imagem tem prioridade sobre traducao, chrome e TTS.
- O comportamento existente de tap em texto permanece igual.
- Logs nao vazam `src`.

Riscos e validacao:

- EPUBs podem ter imagens como background CSS; isso fica fora da primeira versao.
- EPUBs podem ter imagens dentro de links. Para esta feature, toque na imagem deve abrir a imagem, nao navegar o link.

## Fase 3: Modal Full-Screen E Pinch Mobile

Proposito: tornar a visualizacao util no Android/mobile.

Arquivos provaveis:

- `src/components/reader/ImageZoomModal.tsx`
- `src/__tests__/components/ImageZoomModal.test.tsx` ou teste junto de `ReaderScreen.test.tsx`
- `src/i18n/messages.ts`, se o texto "Fechar" precisar entrar no catalogo

Checklist:

- [x] Revisar `ImageZoomModal` existente antes de reescrever.
- [x] Aceitar `alt?: string`, mantendo fallback vazio quando nao houver texto alternativo confiavel.
- [x] Adicionar `role="dialog"` e `aria-modal="true"`.
- [x] Garantir safe area no botao fechar (`top: max(1rem, env(safe-area-inset-top))` ou classe equivalente).
- [x] Testar suporte a pinch nativo em QA Android: falhou no WebView atual.
- [x] Como o pinch nativo nao foi confiavel em QA Android, implementar pinch/pan customizado:
  - escala minima `1`, maxima aproximada `4`;
  - dois dedos ajustam `scale`;
  - arrastar com um dedo move a imagem apenas quando `scale > 1`;
  - soltar abaixo de `1` reseta para `1`;
  - manter transform origin/coordenadas estaveis para evitar saltos.
- [x] Evitar que gestos no modal fechem o overlay por acidente.
- [x] Fechar com botao, `Escape` na web e Back do Android via `ReaderScreen`.

Testes:

- [x] Renderiza imagem com `src` e `alt`.
- [x] Clique no botao fechar chama `onClose`.
- [x] Clique/gesto sobre a imagem nao fecha o modal.
- [x] Se houver pinch customizado, testar calculo de escala com eventos touch/pointer em unidade isolada quando possivel.

Aceite:

- Em Android/mobile, o usuario consegue ampliar uma imagem com pinch e mover a area ampliada.
- O botao fechar permanece acessivel.
- A imagem inicial cabe na tela sem corte incoerente.

Riscos e validacao:

- JSDOM nao valida pinch real; a confirmacao principal deve ser QA manual em Android WebView.
- Zoom nativo pode ampliar a pagina inteira em vez da imagem. Se isso ocorrer, usar a estrategia customizada.

## Fase 4: Integracoes E Regressao Do Leitor

Proposito: proteger os fluxos existentes que compartilham o mesmo listener de clique.

Arquivos provaveis:

- `src/components/reader/EpubViewer.tsx`
- `src/screens/ReaderScreen.tsx`
- `src/__tests__/components/EpubViewer.test.tsx`
- `src/__tests__/screens/ReaderScreen.test.tsx`

Checklist:

- [x] Revalidar traducao por tap em texto.
- [x] Revalidar botoes do bloco inline: Next, ouvir, marcar e salvar.
- [x] Revalidar tap no fundo do bloco inline.
- [x] Revalidar chrome: zona superior, lateral direita, chrome visivel e tap em texto.
- [x] Revalidar TTS: tap em paragrafo com TTS ativo ainda navega TTS, exceto quando o alvo e imagem.
- [x] Revalidar bookmark icon em paragrafo.
- [x] Confirmar que o modal nao causa flush extra de progresso nem troca de secao.

Testes:

- [x] `npm test -- EpubViewer.test.tsx ReaderScreen.test.tsx`
- [x] Se o modal ganhar teste proprio: `npm test -- ImageZoomModal.test.tsx`
- [x] Rodar `npm run lint`.
- [x] Rodar `npm run build`.

Aceite:

- A suite focada passa.
- Lint e build passam.
- Nenhum comportamento existente de traducao/TTS/chrome regride.

Riscos e validacao:

- A ordem do listener de clique e sensivel. Evitar refactors amplos; adicionar apenas helpers e a nova prioridade de imagem.
- A dependencia de `elementFromPoint` deve ter fallback para alvo direto, pois testes e alguns ambientes podem nao implementar a API.

## Fase 5: QA Manual Android/Mobile

Proposito: validar a experiencia real que testes unitarios nao cobrem.

Checklist:

- [x] Abrir EPUB com imagem no meio de capitulo e tocar na imagem.
- [x] Confirmar que a imagem abre em modal full-screen.
- [x] Pinch para ampliar e reduzir.
- [x] Pan com imagem ampliada.
- [x] Fechar pelo botao.
- [x] Fechar pelo Back fisico Android.
- [x] Tocar em texto antes e depois de abrir imagem para confirmar traducao inline.
- [x] Abrir traducao inline e tocar nos botoes Next/ouvir/marcar/salvar.
- [x] Tocar em area vazia para chrome, depois tocar em imagem.
- [x] Com TTS ativo, tocar em texto e imagem para confirmar a prioridade esperada.
- [x] Testar imagem pequena, imagem larga e imagem alta.
- [x] Testar tema claro e escuro.

Aceite:

- A feature funciona no fluxo mobile principal.
- Nao ha conflito perceptivel com traducao inline.
- O usuario consegue retornar a leitura sem perder posicao.

## Acessibilidade

- Modal deve usar `role="dialog"` e `aria-modal="true"`.
- Botao fechar deve ter label traduzivel ou ao menos texto acessivel claro.
- `alt` do EPUB deve ser reaproveitado quando existir; quando nao existir, manter `alt=""` para nao anunciar URL.
- Foco inicial pode ir para o botao fechar no web/desktop. No Android WebView, garantir que o botao seja alcancavel por leitor de tela.

## Performance

- Nao copiar bytes da imagem quando `img.src`/`currentSrc` ja for exibivel.
- Evitar criar object URLs salvo se for necessario serializar SVG inline; se criar, revogar no fechamento.
- Nao manter imagens em estado global.
- A deteccao de imagem deve ser O(1) por clique, usando `closest`/`elementFromPoint`, sem varrer todas as imagens do documento.

## Seguranca E Privacidade

- Nao registrar URL da imagem em diagnosticos.
- Ignorar `javascript:` e valores vazios.
- Manter a sanitizacao existente de conteudo EPUB em `stripExecutableEpubContent`.
- Nao adicionar permissao nova no Android.
- Nao fazer fetch manual de URLs externas na primeira versao; usar o que o renderer ja carregou.

## Rollout E Backout

- Rollout: comportamento ativado automaticamente no leitor, sem flag ou configuracao.
- Backout: remover a prop `onOpenImage`, a deteccao de imagem no listener e o uso do `ImageZoomModal` em `ReaderScreen`.
- Baixo risco de dados: nao altera banco local, schema, progresso ou importacao.

## Commits Sugeridos

1. `reader: wire image preview modal`
   - Concluido na Fase 1: contrato `onOpenImage`, estado no `ReaderScreen`, renderizacao do modal e Back Android.
2. `reader: detect epub image taps`
   - Concluido na Fase 2: helpers de deteccao/resolucao de imagem no iframe, prioridade no listener e testes de `EpubViewer`.
3. `reader: harden image zoom modal`
   - Acessibilidade, pinch/pan se necessario, testes do modal.
4. `test: cover reader image preview regressions`
   - Testes focados adicionais e ajustes finais.

## Handoff Para Proxima Sessao

Proximos passos exatos:

1. Preparar commit/PR da feature de visualizacao e zoom de imagens.
2. Separar, quando possivel, as alteracoes desta feature de outros trabalhos em andamento no worktree.
3. Antes de abrir PR ou entregar build final, rodar novamente:

```bash
npm test -- ImageZoomModal.test.tsx
npm test -- ReaderScreen.test.tsx
npm test -- EpubViewer.test.tsx
npx eslint src/components/reader/EpubViewer.tsx src/__tests__/components/EpubViewer.test.tsx src/components/reader/ImageZoomModal.tsx src/__tests__/components/ImageZoomModal.test.tsx src/screens/ReaderScreen.tsx src/__tests__/screens/ReaderScreen.test.tsx
npm run build
```

Decisoes nao resolvidas:

- SVG inline sem URL pode ficar para uma iteracao posterior se aumentar o escopo.
