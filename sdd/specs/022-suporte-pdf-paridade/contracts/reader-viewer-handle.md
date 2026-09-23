# Contrato: `EpubViewerHandle` implementado pelo `PdfPageViewer`

O `ReaderScreen` (e, por ele, `useTTS`/`useTranslatedAudiobook`) fala com o
viewer só por `viewerRef.current?.<método>` — ~20 chamadas hoje. A página fiel
implementa **a mesma interface**, exportada de
`src/components/reader/EpubViewer.tsx` (linhas ~1435-1468). A interface **não
muda** nesta feature (DI-001). O modo texto usa o próprio `EpubViewer`, então
não precisa deste contrato.

"Seção" na página fiel = **trecho** (DI-009). "Parágrafo" = bloco reconstruído
(`pdfParagraphs`) do trecho atual, em ordem de leitura.

| Método | Comportamento exigido na página fiel |
| --- | --- |
| `next()` / `prev()` | Rola uma altura de tela para baixo/cima. |
| `prevToEnd()` | Vai para o fim do trecho anterior. |
| `goToNextTtsSection()` | Carrega o próximo trecho como seção ativa do TTS; `false` no último. |
| `goTo(target)` | Aceita localizador `neopdf:` (string), índice de página (number) ou `{ fraction }`. Hrefs do sumário do PDF chegam já resolvidos para página. |
| `getVisibleLocation()` | `{ cfi: <localizador neopdf do topo visível>, fraction, percentage, tocLabel }`. O campo se chama `cfi` por compatibilidade (DI-006). |
| `getParagraphs()` | Textos dos parágrafos reconstruídos do trecho ativo. |
| `getSentenceChunks()` | Mesmo formato `TtsChunk` do EPUB (`paraIdx`, `offsetInPara`), gerado pelos mesmos utilitários de chunking de `src/utils/`. |
| `getFirstVisibleParagraphIndex()` | Primeiro parágrafo com área visível na tela. |
| `highlightTts(paraIdx, wordStart, wordEnd)` | Desenha destaque do parágrafo e da palavra sobre a página (retângulos derivados dos spans da camada de texto), inclusive quando o parágrafo cruza para a página seguinte. |
| `clearTts()` | Remove esses destaques. |
| `scrollToParagraph(idx)` | Rola para centralizar o parágrafo, respeitando rolagem manual do usuário (mesma regra do EPUB). |
| `resetTtsScroll(options?)` | Mesma semântica do EPUB. |
| `showTranslationLoading()` | Abre o **balão/sheet** de tradução ligado ao parágrafo ativo com spinner; devolve id da seleção. |
| `injectTranslation(text, selectionId?, provider?)` | Preenche o balão (com selo do provedor, mesma regra FR-008 da feature 017). |
| `clearTranslation()` | Fecha o balão e remove o destaque do parágrafo. |
| `showWordLensDefinitionLoading(target)` / `injectWordLensDefinition(target, entry)` / `injectWordLensDefinitionError(target)` | Mesmo conteúdo do EPUB, exibido no balão da palavra. |

## Props / callbacks

O `PdfPageViewer` recebe o **subconjunto** de props do `EpubViewer` que faz
sentido em página fixa (tema, Word Lens, `bookmarks`, `highlights`, callbacks
`onRelocate`, `onTocReady`, `onLoad`, `onError`, `onSaveVocab`, `onCenterTap`,
`onTranslate`, `onWordLensDefinition`, `onSpeakOne`, `onParagraphTapForTts`,
`onTtsUserScrollAway`, `ttsGlobalActive`, `onBookmarkParagraph`,
`onRequestCreateHighlight`, `onDeleteHighlight`, `onEditHighlight`,
`chromeVisible`) com os **mesmos tipos de payload**; os campos `cfi`/`paraCfi`
dos payloads carregam localizadores `neopdf:`. Props de tipografia (fonte,
tamanho, entrelinha) não se aplicam.

## Verificação

Teste de contrato em `src/__tests__/components/reader/PdfPageViewer.contract.test.tsx`:
cada método acima existe e respeita os tipos; `ReaderScreen` roda o fluxo de
TTS/tradução mockado contra os dois viewers.
