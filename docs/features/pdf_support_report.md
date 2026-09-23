# Relatório Detalhado de Engenharia: Suporte a PDF no Readest

Este documento aprofunda a análise arquitetural do suporte a PDF no aplicativo Readest. Ele aborda as decisões de engenharia específicas que contornam problemas inerentes à renderização de PDFs em ambientes Web/Mobile, em especial as limitações de memória, performance do WebKit e dessincronização de metadados.

## 1. Arquitetura Geral de Leitura

O Readest adota uma estrutura em camadas para a renderização do PDF:
1. **Frontend / Orquestração (`FoliateViewer.tsx`)**: O Web Component `<foliate-view>` gerencia os iframes das páginas do livro. O componente React (`FoliateViewer.tsx`) escuta eventos vitais (`docLoad`, `relocate`) para registrar o progresso de leitura.
2. **Adapter Foliate-JS para PDF (`packages/foliate-js/pdf.js`)**: O coração da renderização. Faz a interface do Foliate com a engine pura da Mozilla (`pdfjs-dist`), cuidando da paginação, extração de texto, cache e limitações de Hardware.
3. **Rust Native Engine (`src-tauri/src/pdf_parser.rs`)**: Responsável estritamente pela "biblioteca" / importação, processando arquivos com mmap sem engasgar o Web Worker e gerando Miniaturas nativamente usando a API OS.

## 2. Soluções e Otimizações Críticas no Frontend (`foliate-js/pdf.js`)

A implementação em `pdf.js` vai muito além de instanciar a engine da Mozilla. O código contém diversas proteções de estabilidade e "hacks" arquiteturais muito bem documentados:

### 2.1. OOM (Out Of Memory) na Plataforma iOS (WebViews)
O WKWebView (iOS) destrói abas do navegador que passam de ~2 GB de RAM. Num PDF onde os bitmaps e as camadas (Layers) de canvas em WebKit são escalados em conjunto com o `devicePixelRatio` da tela (que pode ser 3x nas telas Retina), a área renderizada do canvas cresce exponencialmente.
**Solução de Engenharia implementada:**
- Um fator de limite (`MAX_RENDER_DPR = 2`) foi criado exclusivamente para webviews móveis.
- Além do clamp do DPR, há um teto duro para pixels (`MAX_CANVAS_PIXELS = 2048 * 1536` ~ 3.1 Mpx ≈ 12.6 MB). A densidade de pixels rasterizada (`renderDpr`) cai gradualmente via raiz quadrada caso a área gerada pelo zoom extrapole o teto.
- O DOM (Camada de texto selecionável do pdf.js) opera em `displayViewport` nativo em escala 1, enquanto a *tag canvas* compele o browser a dar "downscale" automático sem penalidade.

### 2.2. Acessibilidade e Dessincronia de Fonte vs. Canvas
Usuários que modificam o tamanho de fonte diretamente pelo Sistema Operacional ("Dynamic Type") quebravam a usabilidade. O texto da camada `textLayer` esticava perante o canvas, desalinhando o highlight, seleção de texto (TTS) do fundo rasterizado.
**Solução de Engenharia implementada:**
- Uma sonda invisível (`probe`) com `100px` é injetada para ler o `offsetHeight` da fonte do SO. A escala gerada (`fontScale`) é usada para calcular e forçar uma variável CSS (`--text-scale-factor`) inversa na árvore de texto, estabilizando e ancorando as coordenadas exatas das palavras.

### 2.3. Controle de Throttling na Interface de Streams (I/O)
Páginas com xref streams mal construídas forçavam o PDF.js a requisitar centenas de de bytes (`PDFDataRangeTransport.requestDataRange`) de forma síncrona. Os schemes customizados para arquivos grandes enviavam todos para o Bridge, o que explodia a Heap do sistema móvel.
**Solução de Engenharia implementada:**
- O Readest reimplementa uma fila customizada `pump()` onde apenas `MAX_CONCURRENT_RANGES = 6` faixas do disco são requisitadas à vez ao carregar o arquivo.

### 2.4. Cache Transiente LRU (`cache` e `pageCache`)
A alocação de páginas processadas tem um teto de `MAX_CACHED_PAGES = 16`. Durante a rolagem (swipe / scroll contínuo), as páginas antigas mais distantes são ejetadas usando um padrão LRU. O método `.cleanup()` limpa forçadamente buffers ocultos internos do pdf.js.

## 3. Heurística e Sintetizador de Fala (TTS) em `pdfText.ts`
Documentos PDF são conjuntos de tags `<br role="presentation">` e posições de desenho.
O Readest aplica heurística (`classifyPdfLineBreaks`) em um array das linhas mapeadas `PdfLine`:
1. Identifica os saltos verticais do `textLayer` baseados no delta da aresta do topo da linha anterior. Extrai a "moda/média" desse passo em todo parágrafo via `medianPitch(lines)`.
2. Se o delta (`dy = b.top - a.top`) é superior a uma taxa tolerante `PARAGRAPH_GAP_RATIO` vezes a média original, o `<br>` é classificado matematicamente como um final de parágrafo estrutural (`paragraph`).
3. Uma técnica de "Clustering" em caixas (`columnEdges`) varre os blocos usando tolerância à margem para detectar títulos alinhados ou listas não-ordenadas (`indent`). O texto então é unificado, passando pelas Regexs de des-hifenização inteligente para junção silábica no meio da página.

## 4. Workarounds para Bugs Externos
- **WebKit 16 Worker Bug (`configurePDFWorker` em `document.ts`)**: Ao instanciar o PDF Worker WebAssembly, browsers da Apple corrompem a instrução global de Arrays compartilhados (`transferToFixedLength`). O app sobrecarrega o carregamento para injetar o prototype customizado no script da thread principal para corrigir esse artefato nas entranhas da Mozilla lib.

## 5. Relação de Arquivos do Suporte a PDF no Projeto

Abaixo estão listados todos os arquivos vitais da Codebase que garantem a importação, o tratamento e a visualização de PDFs:

### Backend Nativo (Rust / Tauri)
* `src-tauri/src/pdf_parser.rs`: Leitura com mapeamento de memória, descompressão XMP e extração nativa de capa e metadados base.
* `src-tauri/src/lib.rs`: Registro dos comandos do tauri.

### Integração e Bridge (Frontend / Backend)
* `src/utils/tauriPdfBridge.ts`: Provê a chamada `tryNativeParsePdf` para delegar importação/capa ao backend nativo (Fast Path).
* `src/libs/document.ts`: Loader de arquivos principal (`DocumentLoader`). Implementa o polyfill `configurePDFWorker()` em tempo real antes de despachar para o adapter.
* `pdfjs.d.ts`: Referência de tipos globais para a injeção estática via TS do módulo do Worker.

### Engine Web Central (Submódulo Foliate)
* `packages/foliate-js/pdf.js`: O adapter e core principal que se comunica com o pacote `pdfjs-dist` e aplica os limites de DPR, Throttling e Eventos WebViews explicitados neste relatório.
* `packages/foliate-js/vendor/pdfjs/text_layer_builder.css` e `annotation_layer_builder.css`: Estilização essencial para manter as camadas perfeitamente alinhadas e invisíveis durante a seleção de texto.

### Camada de Reconstrução Semântica e Text-to-Speech (TTS)
* `src/utils/pdfText.ts`: Algoritmo matemático para identificação de `paragraph` tags a partir do `<br>` virtual do canvas (TTS de alta qualidade).

### UI e Visualização (React)
* `src/app/reader/components/FoliateViewer.tsx`: Web Component de leitura (`<foliate-view>`) na tela que passa eventos, cores de Dark Mode e monitora o progresso através de refs e event listeners acoplados ao DOM do iframe Foliate.

### Testes (Quality Assurance)
**Componentes Vitais e Renderização:**
* `src/__tests__/foliate-pdf-metadata.test.ts`
* `src/__tests__/foliate-pdf-page-labels.test.ts`
* `src/__tests__/foliate-pdf-range-concurrency.test.ts`
* `src/__tests__/foliate-pdf-redundant-render.test.ts`

**Controles Dinâmicos e Viewers:**
* `src/__tests__/document/pdf-canvas-memory-cap.test.ts`
* `src/__tests__/document/pdf-cfi.test.ts`
* `src/__tests__/document/pdf-pan-lock.browser.test.ts`
* `src/__tests__/document/pdf-spread-seam.test.ts`
* `src/__tests__/document/pdf-tts.test.ts`
* `src/__tests__/document/pdf-viewer-preferences-direction.browser.test.ts`

**Integração e Worker:**
* `src/__tests__/libs/pdf-worker-compat.test.ts`
* `src/__tests__/tauri/pdf-parser-parity.tauri.test.ts`
* `src/__tests__/utils/pdfText.test.ts`
* `src/__tests__/utils/tauri-pdf-bridge.test.ts`

## Conclusão
O desenvolvimento do recurso do formato PDF no Readest combina o que de melhor o Web e o Native fornecem: *IPC performático e Zero-copy* pela bridge Tauri/Rust durante a inicialização/Indexação da biblioteca, seguido de uma camada profunda de renderização controlada e gerenciamento agressivo de memória na interface Foliate-React, mantendo acessibilidade (TTS, Select e Zoom) de nível excelente contra engasgos mobile.
