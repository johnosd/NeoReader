---
description: "Tasks da feature 022 — suporte a PDF com paridade de recursos do EPUB"
---

# Tasks: Suporte a PDF com paridade de recursos do EPUB

**Input**: Documentos de design de `sdd/specs/022-suporte-pdf-paridade/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/, quickstart.md

**Organization**: Tasks agrupadas por user story pra permitir implementação e teste independentes de cada uma.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Pode rodar em paralelo (arquivos diferentes, sem dependência)
- **[Story]**: A qual user story esta task pertence (ex: US1, US2)

## Path Conventions

- App (React/TS) em `src/`; testes em `src/__tests__/` espelhando `src/` (imports explícitos de `vitest`, alias `@/`).
- Código novo de PDF: `src/services/pdf/`, `src/utils/pdf*.ts`, `src/utils/bookFormat.ts`, `src/components/reader/Pdf*.tsx`, `src/components/reader/pdfPage/`, `src/hooks/usePdfReaderSession.ts`.
- Nativo Android: `android/app/src/main/java/com/johnny/neoreader/` e `android/app/src/main/AndroidManifest.xml`.
- Fixtures versionadas: `src/__tests__/fixtures/pdf/`. Corpus local (não versionado): `debug-books/pdf/`.
- **Regra de toda fase (DI-002)**: o gate de regressão EPUB faz parte dos Testes da fase — não é opcional.

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Ferramentas para desenvolver e medir PDF sem tocar no EPUB.

- [ ] T001 Registrar a linha de base de regressão EPUB antes de qualquer mudança: rodar `npm run lint`, `npm test`, `npm run build`, `npm run test:debug-epubs` e anotar contagem de testes/tempos no Registro da Fase 1 de `sdd/specs/022-suporte-pdf-paridade/tasks.md`
- [ ] T002 Servir `/vendor/pdfjs` no dev server (plugin `apply: 'serve'` com middleware estático apontando para `node_modules/foliate-js/vendor/pdfjs`, incluindo os aliases `.min.*`) em `vite.config.ts`, sem alterar `copyFoliatePdfjsAssets` nem `hardenFoliateIframeSandbox` (R-006)
- [ ] T003 [P] Montar o corpus local `debug-books/pdf/` conforme `quickstart.md` § Pré-requisitos e adicionar `debug-books/pdf/` ao `.gitignore` se `debug-books/` ainda não estiver ignorado
- [ ] T004 [P] Criar `scripts/extract-pdf-text-fixtures.mjs` (roda no Chromium via página de dev/Playwright MCP) que exporta, por PDF do corpus, `{ pageIndex, viewport, items: [{ str, transform, width, height, hasEOL, fontName }] }` para `src/__tests__/fixtures/pdf/<nome>.json` (research.md §4)

### Testes da Fase

- [ ] T005 Validar T002: `npm run dev` + Playwright MCP carrega `/vendor/pdfjs/pdf.worker.min.mjs` com 200; `npm run build` gera `dist/vendor/pdfjs` igual antes
- [ ] T006 Gate EPUB: `npm run lint && npm test && npm run build && npm run test:debug-epubs` iguais à linha de base de T001

**Critério de Conclusão**: dev server serve os assets do pdf.js, corpus e fixtures existem, e a linha de base EPUB está registrada e inalterada.

**Registro da Fase**:

- Status:
- Feito:
- Testes executados:
- Pendências:

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Tipos, localizador, trechos, reconstrução de parágrafos e o "book" PDF — base de todas as stories.

**⚠️ CRITICAL**: Nenhuma user story pode começar antes desta fase terminar.

### Testes da Fase

- [ ] T007 [P] Testes de `src/utils/bookFormat.ts` em `src/__tests__/utils/bookFormat.test.ts`: EPUB real (ZIP + `mimetype`), PDF (`%PDF-`), PDF com lixo antes do header (até 1024 bytes), arquivo aleatório → `null`
- [ ] T008 [P] Testes de `src/utils/pdfLocator.ts` em `src/__tests__/utils/pdfLocator.test.ts`: format/parse de ponto e intervalo, strings inválidas, ordenação, igualdade, `isPdfLocator` vs `epubcfi(...)`, e que `createBookmarkSyncKey` gera chave estável para localizador
- [ ] T009 [P] Testes de `src/utils/pdfChunks.ts` em `src/__tests__/utils/pdfChunks.test.ts`: com outline, sem outline, capítulo > 40 páginas subdividido, outline fora de ordem
- [ ] T010 [P] Testes de `src/utils/pdfParagraphs.ts` em `src/__tests__/utils/pdfParagraphs.test.ts` usando fixtures de T004: linhas por baseline, quebra de parágrafo por gap/recuo/pontuação, heading por fonte maior, 2 colunas em ordem, cabeçalho/rodapé repetido removido, dehifenização, parágrafo cruzando página, `ranges` apontando para o texto bruto correto, página sem texto → nenhum bloco, região de figura → bloco `figure`

- [ ] T010a [P] Testes de `src/utils/textLanguage.ts` e `src/utils/isbn.ts` em `src/__tests__/utils/textLanguage.test.ts` e `src/__tests__/utils/isbn.test.ts`: detecção en/pt/es/fr/de com textos de fixtures, texto curto/misturado → indefinido (abaixo da margem de confiança); ISBN-10/13 com hífens/espaços, prefixo "ISBN", dígito verificador inválido rejeitado, vários ISBNs → ordem de ocorrência

### Implementation

- [ ] T011 [P] `BookFormat = 'EPUB' | 'PDF'` e campos `pdfTextLayer?`, `pageCount?`, `detectedLanguage?` em `Book`; `pdfReadingMode?` em `BookSettings` — em `src/types/book.ts`; `'pdf-metadata'` em `BookInfoSource` (`src/types/bookInfo.ts`) (não indexados; sem `version()` nova, data-model.md)
- [ ] T012 [P] Implementar `detectBookFormat(blob)` em `src/utils/bookFormat.ts` (DI-011)
- [ ] T013 [P] Implementar localizador `neopdf:v1` em `src/utils/pdfLocator.ts` (DI-005), incluindo `buildRawPageText(items)` com a regra de texto bruto da versão 1 e comentário explicando por que o localizador não depende da heurística
- [ ] T014 [P] Implementar divisão em trechos em `src/utils/pdfChunks.ts` (DI-009)
- [ ] T014a [P] Implementar `src/utils/textLanguage.ts` (detecção por stopwords sobre os idiomas de `src/utils/languageOptions.ts`, margem de confiança como constante nomeada, DI-012) e `src/utils/isbn.ts` (achar e validar ISBN-10/13 em texto, DI-013) — funções puras, sem dependência nova
- [ ] T015 Spike de heurística (research.md §3): versão inicial de `src/utils/pdfParagraphs.ts`, medir SC-003 em 5 PDFs do corpus e registrar números no Registro da Fase; ajustar constantes nomeadas até ≥ 95% nos PDFs de 1 coluna
- [ ] T016 Implementar `src/services/pdf/PdfBookFactory.ts`: adaptar `node_modules/foliate-js/pdf.js` (MIT — cabeçalho de atribuição) para devolver `{ book, pdf }` com um único `PDFDocumentProxy` (DI-008), leitura por faixas sobre Blob (research.md §1), mesmo layout `pre-paginated`, `toc`, `metadata`, `getCover`, `destroy`; importar o pdf.js pelo alias `@pdfjs/pdf.min.mjs` já existente
- [ ] T017 Implementar `src/services/pdf/PdfTextExtractor.ts`: texto bruto + itens por página com cache LRU limitado (ex.: 32 páginas) e `reconstructChunk(chunk)` que chama `pdfParagraphs` com a página seguinte como lookahead

**Checkpoint**: Fundação pronta — user stories podem começar.

- [ ] T018 Gate EPUB: `npm run lint && npm test && npm run build && npm run test:debug-epubs` iguais à linha de base

**Critério de Conclusão**: tipos compilam, localizador/trechos/reconstrução têm testes verdes, SC-003 ≥ 95% medido no spike, e o `PdfBookFactory` abre um PDF do corpus em Chromium (Playwright MCP) devolvendo `book` + `pdf`. Nenhuma mudança observável no app para EPUB.

**Registro da Fase**:

- Status:
- Feito:
- Testes executados:
- Pendências:

---

## Phase 3: User Story 1 - Importar e ler PDF em página fiel (Priority: P1) 🎯 MVP

**Objetivo**: PDF importa pelos 3 caminhos e é lido em página fiel com scroll, zoom, tema, sumário, progresso e marcadores.

**Independent Test**: `quickstart.md` § Import e § Página fiel, mais § Regressão EPUB.

### Testes da Fase

- [ ] T019 [P] [US1] Testes de `src/services/pdf/PdfService.ts` em `src/__tests__/services/pdf/PdfService.test.ts` (pdf.js mockado): metadados com/sem título, fallback para nome do arquivo, `pdfTextLayer` full/partial/none (inclui texto-lixo, R-009), `detectedLanguage` vindo dos metadados / da detecção / indefinido, senha → erro tipado, corrompido → erro tipado
- [ ] T019a [P] [US1] Testes de `src/services/bookInfo/PdfBookInfoProvider.ts` em `src/__tests__/services/bookInfo/PdfBookInfoProvider.test.ts` (texto de páginas mockado): `lookupHints` com título/autor dos metadados, ISBN achado na página de copyright vira identificador, sem ISBN → identificadores vazios sem erro; e casos em `src/__tests__/services/bookInfo/BookInfoRefreshService.test.ts` (ou arquivo existente equivalente): livro PDF usa `PdfBookInfoProvider`, **livro EPUB usa exatamente a lista de provedores de hoje**
- [ ] T019b [US1] Casos de idioma em `src/__tests__/hooks/useReaderAppearance.test.tsx` e `src/__tests__/screens/BookDetailsScreen.test.tsx`: PDF usa `bookLanguage` manual > `detectedLanguage` > indefinido (sem cair em `'en'`, TTS traduzido desligado); **EPUB continua `bookLanguage ?? extras.language`**; aviso único de idioma indefinido no leitor não reaparece depois de dispensado
- [ ] T020 [P] [US1] Casos PDF em `src/__tests__/services/BookImportService.test.ts`: web grava `format: 'PDF'`, `pdfTextLayer`, `pageCount`, capa; duplicado detectado; nativo lê `format` da resposta do prepare; **casos EPUB existentes intactos**
- [ ] T021 [P] [US1] Casos PDF em `src/__tests__/services/NativeLibraryImportService.test.ts` e `src/__tests__/services/BookFileResolver.test.ts`: MIME e nome por formato; EPUB inalterado
- [ ] T022 [P] [US1] Teste de contrato `src/__tests__/components/reader/PdfPageViewer.contract.test.tsx` (métodos de navegação/localização do `EpubViewerHandle` — contracts/reader-viewer-handle.md)
- [ ] T023 [US1] Casos em `src/__tests__/screens/ReaderScreen.test.tsx`: livro PDF monta `PdfPageViewer`; **livro EPUB (e sem `format`) monta `EpubViewer` com exatamente as mesmas props de antes**; progresso salvo como localizador `neopdf:`
- [ ] T024 [P] [US1] Casos em `src/__tests__/screens/LibraryScreen.test.tsx`, `src/__tests__/screens/HomeScreen.test.tsx`, `src/__tests__/screens/BookDetailsScreen.test.tsx`: inputs aceitam `.pdf`; Detalhes de livro PDF não chama `EpubService.parseExtras`
- [ ] T025 [US1] E2E Chromium (Playwright MCP): import web + página fiel com `1col.pdf`, `escaneado.pdf`, `senha.pdf`
- [ ] T026 [US1] Device: spikes de research.md §1, §2 e §5 no começo da fase (registrar números); depois `quickstart.md` § Import, § Página fiel e SC-002 com `grande.pdf`
- [ ] T027 [US1] Gate EPUB completo: automatizado + `quickstart.md` § Regressão EPUB no device

### Implementation

- [ ] T028 [P] [US1] `src/services/pdf/PdfService.ts`: `parseMetadata(file)` → `{ title, author, language, detectedLanguage, coverBlob, pdfTextLayer, pageCount }` usando `PdfBookFactory` (abre, lê, destrói); `detectedLanguage` = idioma dos metadados ou `detectTextLanguage` sobre o texto das páginas já amostradas para `pdfTextLayer` (sem leitura extra do arquivo, DI-012); capa da página 1 redimensionada com `resizeCoverBlob`/`MAX_COVER_DIMENSION_PX` existentes; erros tipados senha/inválido (FR-015)
- [ ] T029 [US1] `src/services/BookImportService.ts`: aceitar `.pdf` nos previews (`isSupportedEpub`/`buildNativeImportPreview` passam a aceitar os dois formatos; `ImportPreviewItem.format` ganha `'PDF'`), despachar metadados por `detectBookFormat` (EPUB → `EpubService.parseMetadata` como hoje; PDF → `PdfService.parseMetadata`), gravar `format`/`pdfTextLayer`/`pageCount`; título fallback removendo `.pdf`; `reextractCover` por formato. Caminho EPUB sem mudança de comportamento (DI-001)
- [ ] T030 [P] [US1] `src/services/NativeLibraryImportService.ts` (`fileFromChunks` usa MIME do formato; tipos da resposta do prepare com `format`) e `src/services/BookFileResolver.ts` (MIME/nome default por `book.format`)
- [ ] T031 [P] [US1] Inputs de arquivo aceitam PDF: `src/components/AddBookButton.tsx`, `src/screens/HomeScreen.tsx`, `src/screens/LibraryScreen.tsx` (`EPUB_FILE_PATTERN` e `accept`)
- [ ] T032 [US1] Nativo (contracts/native-library-plugin.md): `NeoReaderLibraryPlugin.java` (MIME do picker, listagem de `.pdf` na pasta, prepare com detecção por bytes, cópia `.pdf`, capa via `PdfRenderer`, `pageCount`, códigos `PDF_PASSWORD_PROTECTED`/`PDF_INVALID`), `ExternalEpubIntentStore.java` (aceita `application/pdf`/`.pdf`), `AndroidManifest.xml` (intent-filter `application/pdf`)
- [ ] T033 [P] [US1] Guardas de formato onde o código assume EPUB fora do leitor: `src/screens/BookDetailsScreen.tsx` (`EpubService.parseExtras`), `src/hooks/useReaderAppearance.ts` (`parseExtras`)
- [ ] T033a [US1] `src/services/bookInfo/PdfBookInfoProvider.ts` (DI-013): `source: 'pdf-metadata'`, `lookupHints` dos metadados, ISBN via `src/utils/isbn.ts` no texto das 10 primeiras e 3 últimas páginas, `language`/`pageCount`/`publisher`/`synopsis` dos metadados; escolher o provedor local por `book.format` em `src/services/bookInfo/BookInfoRefreshService.ts`, `src/hooks/useBookInfo.ts` e no default de `src/services/bookInfo/BookInfoService.ts`; ficha salva no import com `source: 'pdf-metadata'` em `src/services/BookImportService.ts`; rótulo "PDF" no mapa de origens de `src/screens/BookDetailsScreen.tsx`. Lista de provedores do EPUB sem mudança
- [ ] T033b [US1] Idioma do PDF (DI-012): em `src/hooks/useReaderAppearance.ts` e `src/screens/BookDetailsScreen.tsx`, para `book.format === 'PDF'` resolver `bs.bookLanguage ?? book.detectedLanguage` e tratar ausência como indefinido (sem fallback `'en'`); aviso único e não bloqueante no leitor com atalho para escolher o idioma (reusa o seletor de idioma existente da tela de Detalhes), dispensa gravada por livro. Caminho EPUB inalterado
- [ ] T034 [US1] `src/hooks/usePdfReaderSession.ts`: resolve o arquivo (`BookFileResolver`), abre `PdfBookFactory`, calcula trechos, expõe `pdf`, `book`, `chunks`, `extractor`, modo atual; destrói tudo ao sair/trocar de livro (mesma disciplina da feature 009)
- [ ] T035 [US1] `src/components/reader/PdfPageViewer.tsx` + `src/components/reader/pdfPage/`: `foliate-view` com book do factory, `foliate-fxl` em `flow="scrolled"`, `pageColors` do tema do leitor, sumário (`onTocReady`), `relocate` → localizador `neopdf:` do topo visível → `onRelocate`, `goTo` por localizador/página/fração, pinça/zoom + pan (research.md §2), toque fora de texto → `onCenterTap`, toque em parágrafo → balão de ações com "marcador" (US3 acrescenta traduzir/Word Lens), marcadores desenhados na margem da página; métodos de navegação do `EpubViewerHandle`
- [ ] T036 [P] [US1] `src/components/reader/PdfTextLayerNotice.tsx` (PDF/página sem texto, FR-014) e aviso de PDF grande > 1000 páginas ou > 200 MB (FR-016)
- [ ] T037 [US1] `src/screens/ReaderScreen.tsx`: se `book.format === 'PDF'` monta `PdfPageViewer` via `usePdfReaderSession`; senão, o bloco `<EpubViewer ... />` atual sem alteração; marcadores de PDF gravam localizador (DI-006); tratamento de arquivo ausente igual ao EPUB
- [ ] T038 [P] [US1] Textos novos (aviso sem texto, PDF grande, senha, inválido, rótulo PDF, aviso de idioma indefinido) em `src/i18n/messages.ts` (pt-BR/en/es); revisar `quickActions.reextractCover.description` para não citar só EPUB

**Critério de Conclusão**: os 3 caminhos de import aceitam PDF; um PDF nascido digital abre em página fiel em ≤ 3 s no device, com zoom nítido, tema, sumário, progresso restaurado e marcador (com sync Pro); escaneado mostra aviso; senha/corrompido recusados; idioma do PDF resolvido pela ordem de DI-012 (SC-009 medido no corpus) e ficha enriquecida pelas fontes online (ISBN do texto quando houver); SC-001/SC-002/SC-007 medidos; e o checklist de regressão EPUB passou sem diferença.

**Checkpoint**: User Story 1 funcional e testável isoladamente (entregável como MVP).

**Registro da Fase**:

- Status:
- Feito:
- Testes executados:
- Pendências:

---

## Phase 4: User Story 2 - Modo texto (reflow) (Priority: P2)

**Objetivo**: alternar para parágrafos refluídos no mesmo `EpubViewer`, com posição preservada e modo lembrado por livro.

**Independent Test**: `quickstart.md` § Modo texto + medição de SC-003 + § Regressão EPUB.

### Testes da Fase

- [ ] T039 [P] [US2] Testes de `src/services/pdf/PdfTextBookBuilder.ts` em `src/__tests__/services/pdf/PdfTextBookBuilder.test.ts` (fixtures): seções por trecho, `<p>`/`<h1-h6>`, atributos de offset por parágrafo, placeholder de figura, fallback "como na página" para colunas incertas, `rendition.layout` reflowable
- [ ] T040 [P] [US2] Testes de `src/services/pdf/PdfLocatorResolver.ts` em `src/__tests__/services/pdf/PdfLocatorResolver.test.ts`: localizador → Range no HTML sintético → localizador (round-trip), início/fim de trecho, parágrafo cruzando página
- [ ] T041 [US2] Caso em `src/__tests__/components/EpubViewer.test.tsx`: com `openBook` passa o book recebido a `view.open`; **sem `openBook`, chama `BookFileResolver.resolveReaderSource` exatamente como antes** (todos os testes existentes do arquivo verdes sem alteração)
- [ ] T042 [US2] Casos em `src/__tests__/screens/ReaderScreen.test.tsx`: alternância de modo preserva localizador; `pdfReadingMode` gravado e restaurado; PDF `pdfTextLayer: 'none'` não oferece modo texto
- [ ] T043 [US2] E2E Chromium: `1col.pdf`, `2col.pdf`, `tabelas.pdf` em modo texto; medir SC-003 (quickstart § Medição) e SC-005
- [ ] T044 [US2] Gate EPUB completo (automatizado + checklist no device) — atenção especial ao `EpubViewer`, único arquivo EPUB tocado nesta fase

- [ ] T045a [US2] **Primeira task da fase (R-011)** — casos em `src/__tests__/services/pdf/PdfTextBookBuilder.test.ts`: toda seção gerada tem `data-type="chapter"` na raiz e nenhum `data-pdf-bookmark`; o livro sintético não tem `transformTarget`, `entries` nem `resources`; cada href do `toc` sintético resolve por `splitTOCHref`/`resolveHref` do próprio livro para o índice de seção certo
- [ ] T045b [US2] **Logo depois de T045a (R-011)** — caso em `src/__tests__/components/EpubViewer.test.tsx` abrindo um livro sintético mínimo via `openBook` com um trecho só com título + 1 linha curta: o trecho **não** é pulado pelo auto-skip de capítulo-stub, `registerUnmanifestedEpubStylesheets` e `installPassiveEpubContentTransform` não têm efeito, e o progresso pelo sumário usa o rótulo do trecho. Se algum desses falhar sem mudar o `EpubViewer` além de T046, **parar e reabrir o design (DI-003)**

### Implementation

- [ ] T045 [US2] `src/services/pdf/PdfTextBookBuilder.ts`: livro sintético reflowable — uma seção por trecho, `load()` gera XHTML sob demanda via `PdfTextExtractor.reconstructChunk`, `createDocument()`, `size` estimado, `toc` dos trechos, CSS mínimo neutro (tema/fonte vêm do `buildReaderCSS` do viewer), placeholder de figura como `<img>` tocável cujo `src` é a página renderizada sob demanda (reusa `onOpenImage`/`ImageZoomModal`, FR-009), atributos `data-nr-pdf-*` com offsets; raiz de cada seção com `data-type="chapter"` e sem `transformTarget`/`entries`/`resources` no objeto book (R-011)
- [ ] T046 [US2] `src/components/reader/EpubViewer.tsx`: **única mudança permitida (DI-003)** — prop opcional `openBook?: () => Promise<unknown>`; no setup, `const readerSource = openBook ? await openBook() : await BookFileResolver.resolveReaderSource(book)`. Nada mais neste arquivo
- [ ] T047 [US2] `src/services/pdf/PdfLocatorResolver.ts`: localizador ↔ CFI do livro sintético (via atributos de offset) e localizador ↔ Range na camada de texto da página fiel
- [ ] T048 [US2] `src/components/reader/PdfReadingModeToggle.tsx` no chrome do leitor (visível só em PDF com texto) e `src/screens/ReaderScreen.tsx`: em modo texto monta `EpubViewer` com `openBook` = builder, converte `savedCfi`/`bookmarks`/`highlights` de localizador → CFI antes de passar e payloads de CFI → localizador ao receber (`onRelocate`, `onBookmarkParagraph`, highlights); ao alternar, captura `getVisibleLocation()` e reabre no outro modo no mesmo localizador — o viewer é **remontado** com `key` por modo, porque o setup do `EpubViewer` só re-roda quando `book.id` muda (R-011); grava `pdfReadingMode` em `BookSettings`
- [ ] T049 [P] [US2] Textos do toggle e do modo texto indisponível em `src/i18n/messages.ts`

**Critério de Conclusão**: em PDFs com texto, o modo texto mostra parágrafos limpos (SC-003 ≥ 95% registrado), respeita fonte/tema, alterna preservando a posição (SC-005), lembra o modo, trata figuras e colunas incertas, e o `EpubViewer` mudou só na prop `openBook` com toda a suíte e o checklist EPUB verdes.

**Registro da Fase**:

- Status:
- Feito:
- Testes executados:
- Pendências:

---

## Phase 5: User Story 3 - Word Lens e tradução em PDF (Priority: P3)

**Objetivo**: Word Lens, vocabulário e tradução nos dois modos (inline no texto, balão na página fiel).

**Independent Test**: `quickstart.md` § Word Lens e tradução + § Regressão EPUB.

### Testes da Fase

- [ ] T050 [P] [US3] Testes do `PdfPageViewer` em `src/__tests__/components/reader/PdfPageViewer.test.tsx`: toque em palavra resolve a palavra certa (inclusive hifenizada entre linhas) e dispara `onWordLensDefinition`; toque em parágrafo dispara `onTranslate` com o texto reconstruído; `showTranslationLoading`/`injectTranslation`/`clearTranslation` e os métodos de Word Lens do contrato
- [ ] T051 [US3] Casos em `src/__tests__/screens/ReaderScreen.test.tsx`: fluxo de tradução e salvar vocabulário com PDF nos dois modos usa o mesmo provedor/fallback do EPUB
- [ ] T052 [US3] E2E Chromium + device: `quickstart.md` § Word Lens e tradução
- [ ] T053 [US3] Gate EPUB completo

### Implementation

- [ ] T054 [US3] `src/components/reader/pdfPage/`: mapeamento toque → span da camada de texto → offset bruto → parágrafo/palavra (via `PdfLocatorResolver`); balão de ações do parágrafo ganha traduzir/Word Lens; balão de tradução e de definição renderizados **dentro do documento da página** (padrão do EPUB, overlays React não recebem toque no Android); sublinhado passivo de Word Lens e de vocabulário salvo (`vocabWords`) desenhado sobre a camada de texto
- [ ] T055 [US3] `src/components/reader/PdfPageViewer.tsx`: implementar os métodos de tradução/Word Lens do `EpubViewerHandle` e ligar `onTranslate`, `onWordLensDefinition`, `onSaveVocab`, `onSpeakOne`
- [ ] T056 [US3] Modo texto: validar que Word Lens/tradução inline do `EpubViewer` funcionam sobre o livro sintético sem mudança no `EpubViewer`; ajustes necessários vão no HTML gerado por `PdfTextBookBuilder.ts` (DI-003)

**Critério de Conclusão**: nos dois modos, tocar palavra abre Word Lens, salvar vocabulário grava frase sem quebras físicas, e traduzir parágrafo usa o mesmo provedor/fallback do EPUB (inline no modo texto, balão na página fiel); checklist EPUB sem diferença.

**Registro da Fase**:

- Status:
- Feito:
- Testes executados:
- Pendências:

---

## Phase 6: User Story 4 - TTS e audiobook em PDF (Priority: P3)

**Objetivo**: TTS (inclusive traduzido e em segundo plano) por parágrafo reconstruído nos dois modos.

**Independent Test**: `quickstart.md` § TTS + § Regressão EPUB.

### Testes da Fase

- [ ] T057 [P] [US4] Testes do contrato de TTS do `PdfPageViewer` em `src/__tests__/components/reader/PdfPageViewer.contract.test.tsx`: `getParagraphs`, `getSentenceChunks` (mesmo formato `TtsChunk`), `getFirstVisibleParagraphIndex`, `highlightTts` em parágrafo que cruza página, `goToNextTtsSection` no último trecho
- [ ] T058 [US4] Casos em `src/__tests__/hooks/useTTS.test.tsx` com viewer PDF mockado: leitura contínua entre trechos sem cortar frase na virada de página; **casos EPUB existentes intactos**
- [ ] T059 [US4] Device: `quickstart.md` § TTS (tela apagada, segundo plano, TTS traduzido) e SC-004
- [ ] T060 [US4] Gate EPUB completo (TTS EPUB em segundo plano incluso)

### Implementation

- [ ] T061 [US4] `src/components/reader/PdfPageViewer.tsx` + `src/components/reader/pdfPage/`: métodos de TTS do contrato (parágrafos do trecho ativo, chunks, destaque por retângulos derivados dos spans inclusive entre páginas, rolagem que respeita scroll manual, `onParagraphTapForTts`, `onTtsUserScrollAway`)
- [ ] T062 [US4] Modo texto: confirmar TTS e TTS traduzido do `EpubViewer` sobre o livro sintético; cabeçalhos/rodapés/números de página nunca lidos (garantido pela reconstrução, ajustes só em `src/utils/pdfParagraphs.ts`)

**Critério de Conclusão**: TTS lê parágrafos inteiros sem pausa em quebras físicas nem viradas de página (SC-004), com destaque e acompanhamento nos dois modos, em segundo plano e traduzido; checklist EPUB sem diferença.

**Registro da Fase**:

- Status:
- Feito:
- Testes executados:
- Pendências:

---

## Phase 7: User Story 5 - Highlights e notas em PDF (Priority: P3)

**Objetivo**: criar/editar/remover highlights com nota nos dois modos, visíveis nos dois e na lista de destaques.

**Independent Test**: `quickstart.md` § Highlights + § Regressão EPUB.

### Testes da Fase

- [ ] T063 [P] [US5] Testes em `src/__tests__/components/reader/PdfPageViewer.test.tsx`: seleção na camada de texto gera `HighlightDraftPayload` com localizadores; seleção entre páginas; highlights existentes pintados; toque em highlight abre menu de gerenciar
- [ ] T064 [US5] Casos em `src/__tests__/screens/ReaderScreen.test.tsx` e `src/__tests__/screens/BookDetailsScreen.test.tsx`: highlight criado num modo aparece no outro; lista de destaques de PDF navega para o ponto; highlights EPUB inalterados
- [ ] T065 [US5] E2E Chromium + device: `quickstart.md` § Highlights; SC-006
- [ ] T066 [US5] Gate EPUB completo

### Implementation

- [ ] T067 [US5] `src/components/reader/pdfPage/`: menu de seleção e menu de gerenciar highlight dentro do documento da página (mesmas ações e mesma caixa unificada `HighlightComposerSheet` via `onRequestCreateHighlight`/`onEditHighlight`/`onDeleteHighlight`); pintura de highlights (fundo/sublinhado/ondulado) sobre a camada de texto, inclusive entre páginas
- [ ] T068 [US5] Modo texto: highlights via `EpubViewer` com conversão localizador ↔ CFI em `src/screens/ReaderScreen.tsx` (T048); navegação a partir de `src/screens/BookDetailsScreen.tsx` abre o leitor no localizador (em qualquer modo)

**Critério de Conclusão**: highlights com cor/estilo/nota funcionam nos dois modos, aparecem nos dois (SC-006) e na lista de destaques, inclusive seleção entre páginas; checklist EPUB sem diferença.

**Registro da Fase**:

- Status:
- Feito:
- Testes executados:
- Pendências:

---

## Phase 8: User Story 6 - PDF em catálogos OPDS (Priority: P3)

**Objetivo**: entradas só-PDF aparecem e baixam; mistas preferem EPUB.

**Independent Test**: `quickstart.md` § OPDS + § Regressão EPUB.

### Testes da Fase

- [ ] T069 [P] [US6] Atualizar `src/__tests__/services/opds/OpdsAtomParser.test.ts` e `OpdsJsonParser.test.ts`: os casos que hoje **esperam descartar** entradas só-PDF passam a esperar a entrada com `acquisitionFormat: 'PDF'`; mistas → EPUB; só-EPUB inalterado
- [ ] T070 [P] [US6] Casos PDF em `src/__tests__/services/opds/OpdsDownloadService.test.ts` e `OpdsDownloadCoordinator.test.ts`
- [ ] T071 [US6] Gate EPUB completo (download OPDS de EPUB no device)

### Implementation

- [ ] T072 [US6] `src/services/opds/OpdsAtomParser.ts` e `src/services/opds/OpdsJsonParser.ts`: `pickAcquisitionUrl` prefere EPUB e aceita PDF; entrada ganha `acquisitionFormat` (atualizar comentário FR-011 da feature 003)
- [ ] T073 [US6] `src/services/opds/OpdsDownloadService.ts`: `File` com MIME do formato detectado por bytes; import segue o despacho da Fase 3
- [ ] T074 [P] [US6] Indicador de formato na UI de entrada OPDS (`src/components/OpdsEntryCard.tsx`) se a entrada for PDF

**Critério de Conclusão**: catálogo com entradas só-PDF/mistas/só-EPUB se comporta como FR-017, PDF baixado abre como na US1; checklist EPUB sem diferença.

**Registro da Fase**:

- Status:
- Feito:
- Testes executados:
- Pendências:

---

## Phase 9: Polish & Cross-Cutting Concerns

**Purpose**: Documentação, licença, métricas finais.

- [ ] T075 [P] `README.md`: PDF como formato suportado, dois modos, limitações (OCR, senha, Safari); seção de estrutura de pastas
- [ ] T076 [P] `CLAUDE.md`: schema v19 (hoje diz v16, R-010), menção a `src/services/pdf/` e ao `PdfPageViewer` na seção Arquitetura
- [ ] T077 [P] Revisar copy de biblioteca vazia/onboarding que já promete "PDFs e EPUBs" (`src/i18n/messages.ts` ~linhas 262/1075/1886) — agora verdadeira; ajustar se o fluxo real divergir
- [ ] T078 Revisão de licença (R-002): cabeçalho MIT no `PdfBookFactory.ts`; conferir que nenhum arquivo contém código do Readest
- [ ] T079 Rodar `quickstart.md` inteiro no device e registrar SC-001..SC-009
- [ ] T080 Atualizar `docs/features/` com um resumo do suporte a PDF (arquitetura em 1 página, referenciando esta spec)

### Checklist de Release

- [ ] Fase 1 (Setup) concluída
- [ ] Fase 2 (Foundational) concluída
- [ ] Fase 3 (US1 — import + página fiel) concluída
- [ ] Fase 4 (US2 — modo texto) concluída
- [ ] Fase 5 (US3 — Word Lens + tradução) concluída
- [ ] Fase 6 (US4 — TTS) concluída
- [ ] Fase 7 (US5 — highlights) concluída
- [ ] Fase 8 (US6 — OPDS) concluída
- [ ] `npm run lint && npm test && npm run build && npm run test:debug-epubs` verdes, contagem de testes EPUB ≥ linha de base de T001
- [ ] `quickstart.md` § Regressão EPUB executado no device sem diferença
- [ ] SC-001..SC-009 medidos e registrados
- [ ] Validação em build de release no device (minificação não quebra pdf.js/worker)
- [ ] Revisão de licença (T078) feita

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: sem dependências
- **Foundational (Phase 2)**: depende do Setup — BLOQUEIA todas as user stories
- **US1 (Phase 3)**: depende do Foundational — é o MVP e base das demais
- **US2 (Phase 4)**: depende de US1 (sessão PDF, leitor, localizador em uso)
- **US3, US4, US5 (Phases 5-7)**: dependem de US1 (página fiel) e de US2 (modo texto) para cobrir os dois modos; entre si podem seguir em qualquer ordem
- **US6 (Phase 8)**: depende só de US1 (import de PDF) — pode ser antecipada
- **Polish (Phase 9)**: depende das stories desejadas

### Parallel Opportunities

- Fase 2: T007–T010 e T011–T014 em paralelo; T015 → T017 sequenciais
- Fase 3: T028, T030, T031, T033, T036, T038 em paralelo; T032 (Java) em paralelo ao lado JS
- US6 pode rodar em paralelo a US2–US5 depois da US1

---

## Parallel Example: User Story 1

```bash
Task: "T028 [P] [US1] PdfService.parseMetadata"
Task: "T031 [P] [US1] inputs aceitam PDF"
Task: "T033 [P] [US1] guardas de formato fora do leitor"
Task: "T036 [P] [US1] PdfTextLayerNotice + aviso de PDF grande"
```

---

## Implementation Strategy

### MVP First (User Story 1 apenas)

1. Fase 1 → Fase 2 → Fase 3
2. **PARAR E VALIDAR**: US1 no device + regressão EPUB
3. Entregável: PDF abre e é lido em página fiel (já tira o NeoReader da desvantagem)

### Incremental Delivery

1. US1 (MVP) → US2 (diferencial: modo texto) → US3/US4/US5 (paridade) → US6
2. Cada story fecha com o gate EPUB (DI-002) — nunca acumular regressão

## Notes

- `[P]` = arquivos diferentes, sem dependência
- Commitar após cada task ou grupo lógico coerente (`feat: ...` em português)
- Se alguma task exigir mudar o `EpubViewer.tsx` além de T046, parar e reabrir o design (DI-003)

<!-- sdd-converge anexa "## Phase N: Convergence" abaixo desta linha -->
