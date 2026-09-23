# Assessment Problem: Suporte a PDF sem Perda de Qualidade (Paridade com EPUB)

- **Slug**: suporte-pdf-sem-perda-qualidade-paridade
- **Criado**: 2026-09-23
- **Explora**: não rodada (investigação de codebase feita direto nesta fase, ver seção de evidência abaixo)

## Problem Statement

NeoReader hoje só importa e lê EPUB — não existe nenhum caminho de
importação (picker web, pasta nativa Android, intent externo "abrir com")
que aceite `.pdf`, apesar da copy de onboarding prometer o contrário
("Importe uma pasta com seus PDFs e EPUBs", `src/i18n/messages.ts:262,1075,1886`).
O pedido avaliado aqui não é só "abrir e mostrar páginas de PDF" — é chegar
a **paridade de qualidade com a experiência EPUB atual** (Word Lens,
tradução inline, TTS sincronizado por parágrafo, highlights de trecho,
progresso/CFI, TOC), e a evidência técnica levantada mostra que isso colide
com a natureza de layout fixo do PDF.

## Evidência levantada (codebase, 2026-09-23)

- **Import bloqueado em 5+ pontos**: `BookImportService.isSupportedEpub()`
  (`/\.epub$/i`), `buildNativeImportPreview()`, `ImportPreviewItem.format:
  'EPUB' | 'UNSUPPORTED'`, `AddBookButton.tsx`/`HomeScreen.tsx`/`LibraryScreen.tsx`
  (`accept=".epub"`), `AndroidManifest.xml` (intent-filter só
  `application/epub+zip`). Nenhum aceita `.pdf`.
- **`foliate-js` (fork `readest`, `package.json:47`) já sabe abrir PDF como
  "book"** — `isPDF()`/`makeBook()`/`makePDF()` em `node_modules/foliate-js/
  view.js` e `pdf.js` fazem detecção por magic byte, TOC via outline,
  metadata, paginação fixa (`rendition.layout = 'pre-paginated'`). Os
  assets do PDF.js copiados em `vite.config.ts` são só infraestrutura desse
  fork vendorizado — **código morto do ponto de vista do NeoReader**, nunca
  exercitado hoje.
- **`EpubViewer.tsx` fortemente acoplado a EPUB**: `flow=scrolled`
  hardcoded sem checar `isFixedLayout`/formato; toda extração de texto
  (Word Lens, tradução, TTS por parágrafo, bookmark de parágrafo) usa
  `BLOCK = 'p, li, blockquote, h1-h6'` (linha 1676) sobre o DOM. O
  documento sintético que `makePDF()` gera contém só `<div id="canvas">` +
  `<div class="textLayer">` (spans soltos por coordenada, sem agrupamento
  em parágrafo) — **essas features não degradam, simplesmente não ativam**
  em cima do wrapper PDF do foliate-js.
- **`BookFormat` (`src/types/book.ts:6`) é `'EPUB'`** — union de um único
  literal, sem `'PDF'`; schema Dexie e domínio não modelam outro formato.
- **TOC e progresso/CFI seriam os únicos ganhos "de graça"** via foliate-js
  (o `CFI` do foliate-js funciona sobre qualquer `Range` de DOM, incluindo
  o sintético do PDF) — mas sem agrupamento em parágrafo, o valor prático
  de highlight/bookmark em cima disso é limitado.
- **Nenhuma decisão de produto documentada**: sem ADR (`sdd/adr/` vazio),
  sem spec (`sdd/specs/`, 21 features numeradas, nenhuma sobre PDF), sem
  item em `.planning/backlog.md` → "Ideias Futuras". Espaço em branco total
  no planejamento — este assessment é a primeira vez que isso é avaliado.

## Usuários / Partes Afetadas

- Usuários com PDFs na biblioteca pessoal (livros técnicos, artigos, scans,
  domínio público em PDF) — hoje ficam 100% bloqueados, nem leitura básica
  funciona.
- Usuários que valorizam Word Lens/tradução/TTS como diferencial (feature
  019-onboarding-diferenciais reforça isso como pitch do produto) — se PDF
  for adicionado só como leitura básica, a expectativa de paridade total
  gerada pela copy atual ("PDFs e EPUBs") não seria atendida.
- Dev/produto (usuário) — precisa decidir se abre uma frente de arquitetura
  nova (segunda modalidade de renderização fixed-layout, sem abstração de
  texto independente de formato hoje) ou mantém o produto EPUB-first.

## Goals

- Determinar se dá pra oferecer leitura de PDF no NeoReader e, se sim, em
  qual escopo.
- Avaliar com evidência técnica o quanto da paridade "sem perda de
  qualidade" (Word Lens, tradução inline, TTS por parágrafo, highlights,
  progresso, TOC) é realisticamente alcançável dado que PDF é fixed-layout.
- Separar o que vem "de graça" via `foliate-js` (abrir, paginar/rolar,
  metadata, TOC, CFI) do que exigiria construir uma camada nova do zero
  (agrupamento de spans do textLayer em algo equivalente a "parágrafo").

## Non-Goals

- Desenhar a solução técnica de agrupamento de texto do PDF (isso é
  trabalho de `sdd-specify`/`sdd-plan`, só se o veredito for `go`).
- Conversão de PDF → EPUB no import (mencionada como abordagem alternativa
  em Decide, mas não é o pedido original).
- OCR de PDFs escaneados sem camada de texto — sub-caso ainda mais difícil,
  registrado como risco, não como meta desta rodada.
- Corrigir a copy de onboarding que promete PDF sem entregar — é um achado
  colateral válido independente do veredito aqui, mas é correção de texto,
  não decisão de arquitetura; não faz parte do escopo deste assessment.

## Success Metrics

- Veredito go/needs-clarification/kill registrado com scorecard explícito
  mostrando onde a paridade é alcançável e onde não é.
- Se `go`: escopo inicial com non-goals explícitos no handoff (ex.: TOC +
  progresso primeiro, Word Lens/TTS/tradução depois ou fora do escopo),
  pra não prometer "paridade total" sem essa ressalva.

## Evidência Adicional (resposta às perguntas bloqueantes, 2026-09-23)

- **Demanda confirmada pelo usuário**: necessidade real — "a maioria dos
  players oferecem suporte [a PDF], queremos oferecer tbm mas ser melhor
  do que eles hoje". Não é dado quantitativo de uso interno, mas é decisão
  de produto explícita do dono do projeto, com racional competitivo claro
  (paridade + diferenciação). Isso resolve o `unknown` de valor/demanda do
  scorecard anterior.
- **Relatório técnico `docs/features/pdf_support_report.md`** descreve a
  arquitetura de suporte a PDF do **Readest** — e o fork de `foliate-js`
  que o Readest mantém é a mesma dependência que o NeoReader já usa
  (`package.json:47`: `git+https://github.com/readest/foliate-js.git`).
  Achados relevantes que mudam a avaliação de viabilidade:
  - **Reconstrução semântica de parágrafo já resolvida por eles**: o
    utilitário `src/utils/pdfText.ts` do Readest lê o `textLayer` gerado
    pelo pdf.js (spans posicionados por coordenada) e aplica heurística
    posicional (`classifyPdfLineBreaks`: inclinação `dy`, tamanho de
    fonte em `em`, `columnEdges`, `PARAGRAPH_GAP_RATIO`, indentação,
    de-hifenização) pra reagrupar spans soltos em parágrafos de verdade.
    Isso é exatamente a camada que faltava no NeoReader pra Word
    Lens/tradução/TTS/highlight funcionarem em PDF — não é mais uma
    incógnita de pesquisa, é um algoritmo documentado e comprovado em
    produção, adaptável porque a camada de renderização de baixo nível
    (`foliate-js`/pdf.js) é compartilhada.
  - **Fast Path nativo** (import/capa/metadados via Rust + `mmap2::Mmap`,
    proteção contra zip-bomb/OOM com `MAX_XMP_BYTES`, hashing parcial) é
    específico de Tauri — não reusável como código, só como *estratégia*.
    NeoReader teria que reimplementar o equivalente em Java/Kotlin no
    plugin nativo Android já existente (`NeoReaderLibraryPlugin.java`),
    usando `android.graphics.pdf.PdfRenderer` pra capa, análogo ao que o
    relatório descreve pra Android no Readest (seção 2.4).
  - **Workaround de WebKit** (polyfill de `ArrayBuffer` em Web Worker pra
    corrigir páginas em branco no Safari 16+) só é relevante se o alvo Web
    do NeoReader precisar rodar em Safari — a confirmar em `sdd-specify`.
  - Tema/dark mode em PDF (`renderer.pageColors` sobre fixed-layout) é
    tratamento padrão do `foliate-js`, baixo risco de reproduzir.

## Cost of Inaction

- Usuários com PDF continuam sem conseguir importar esses livros — a copy
  do onboarding já promete algo que o app não entrega, gerando expectativa
  quebrada mesmo sem essa feature avançar.
- Sem essa decisão registrada, o pedido pode reaparecer sem o contexto
  técnico já levantado aqui (acoplamento forte do `EpubViewer` ao DOM
  semântico do EPUB), obrigando alguém a redescobrir isso do zero.
