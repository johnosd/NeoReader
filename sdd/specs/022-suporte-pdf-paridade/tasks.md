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

- [X] T001 Registrar a linha de base de regressão EPUB antes de qualquer mudança: rodar `npm run lint`, `npm test`, `npm run build`, `npm run test:debug-epubs` e anotar contagem de testes/tempos no Registro da Fase 1 de `sdd/specs/022-suporte-pdf-paridade/tasks.md`
- [X] T002 Servir `/vendor/pdfjs` no dev server (plugin `apply: 'serve'` com middleware estático apontando para `node_modules/foliate-js/vendor/pdfjs`, incluindo os aliases `.min.*`) em `vite.config.ts`, sem alterar `copyFoliatePdfjsAssets` nem `hardenFoliateIframeSandbox` (R-006)
- [X] T003 [P] Montar o corpus local `debug-books/pdf/` conforme `quickstart.md` § Pré-requisitos e adicionar `debug-books/pdf/` ao `.gitignore` se `debug-books/` ainda não estiver ignorado
- [X] T004 [P] Criar `scripts/extract-pdf-text-fixtures.mjs` (roda no Chromium via página de dev/Playwright MCP) que exporta, por PDF do corpus, `{ pageIndex, viewport, items: [{ str, transform, width, height, hasEOL, fontName }] }` para `src/__tests__/fixtures/pdf/<nome>.json` (research.md §4)

### Testes da Fase

- [X] T005 Validar T002: `npm run dev` + Playwright MCP carrega `/vendor/pdfjs/pdf.worker.min.mjs` com 200; `npm run build` gera `dist/vendor/pdfjs` igual antes
- [X] T006 Gate EPUB: `npm run lint && npm test && npm run build && npm run test:debug-epubs` iguais à linha de base de T001

**Critério de Conclusão**: dev server serve os assets do pdf.js, corpus e fixtures existem, e a linha de base EPUB está registrada e inalterada.

**Registro da Fase**:

- Status: Concluída (2026-10-05)
- Feito:
  - T001 linha de base EPUB: lint ok · `npm test` 121 arquivos passando + 2 skipped / **1094 testes passando + 2 skipped** (~56 s) · `npm run build` ok (~10 s) · `npm run test:debug-epubs` **71 testes** (~32 s).
  - T002 `vite.config.ts`: plugin `serveFoliatePdfjsAssets` (`apply: 'serve'`) serve `/vendor/pdfjs/*` do `node_modules`, com alias `.min.*` e guarda contra `../`. `copyFoliatePdfjsAssets` e `hardenFoliateIframeSandbox` intocados.
  - T003 corpus sintético em `debug-books/pdf/` (já ignorado pelo git) gerado por `scripts/pdf-corpus/generate-corpus.mjs` (+ `postprocess.py`, pypdf): `1col` (40 pág., outline, header/footer repetidos, ISBN na copyright), `1col-pt`/`1col-es` (18 pág.; o `es` declara `/Lang`), `2col` (5 pág. A4), `tabelas` (16 pág.: tabelas, SVG, raster, fórmulas), `escaneado` (8 pág. só imagem), `misto` (15 pág., 3 sem texto), `semmeta` (sem /Info), `senha` (senha `neoreader`), `corrompido`, `naoepdf`, `grande` (**1000 pág. / 188,4 MB**).
  - T004 `scripts/extract-pdf-text-fixtures.mjs` (servidor HTTP local + Chromium via Playwright; erros tipados para senha/corrompido) e fixtures versionáveis em `src/__tests__/fixtures/pdf/` (`1col` 12 pág., `2col` 5, `tabelas` 8, `misto` 12, `escaneado` 8, `1col-pt`/`1col-es` pág. 3–6; 1,3 MB no total).
- Testes executados:
  - T005: `npx vite --port 5199 --strictPort` → `curl` 200 em `pdf.worker.min.mjs`, `pdf.min.mjs`, `.map`, `pdf.mjs`, css, cmaps e standard_fonts; em Chromium real (Playwright) o pdf.js importado do dev server abriu `1col.pdf` (40 pág.) e leu 245 itens na pág. 3. `npm run build` → `dist/vendor/pdfjs` com os mesmos 195 arquivos/hashes SHA-256 da linha de base.
  - T006 (gate EPUB): lint ok · 121 passando + 2 skipped / **1094 passando + 2 skipped** · build ok · debug-epubs **71 passando** — idêntico à linha de base.
  - 2 iterações no gerador do corpus: `grande.pdf` saiu com 14 MB (pypdf deduplicou cópias → agora 10 blocos distintos), depois 279 MB e 1306 pág. (ajustado para 188,4 MB / 1000 pág.); outline só saiu com `tagged: true`.
- Pendências:
  - Desvio: o Playwright MCP não estava disponível na sessão; T004/T005 usaram a biblioteca `playwright` já presente em `node_modules` (não está no `package.json` — nenhuma dependência adicionada).
  - O corpus é sintético (só Chromium/Skia como produtor). Antes de fechar T015, vale incluir 2–3 PDFs reais do usuário (LaTeX/InDesign/Word) em `debug-books/pdf/` para calibrar a heurística.
  - `C:	mp-fixture-probe` (pasta vazia criada por engano na raiz do C:) — o sandbox bloqueou o `rmdir`; apagar manualmente.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Tipos, localizador, trechos, reconstrução de parágrafos e o "book" PDF — base de todas as stories.

**⚠️ CRITICAL**: Nenhuma user story pode começar antes desta fase terminar.

### Testes da Fase

- [X] T007 [P] Testes de `src/utils/bookFormat.ts` em `src/__tests__/utils/bookFormat.test.ts`: EPUB real (ZIP + `mimetype`), PDF (`%PDF-`), PDF com lixo antes do header (até 1024 bytes), arquivo aleatório → `null`
- [X] T008 [P] Testes de `src/utils/pdfLocator.ts` em `src/__tests__/utils/pdfLocator.test.ts`: format/parse de ponto e intervalo, strings inválidas, ordenação, igualdade, `isPdfLocator` vs `epubcfi(...)`, e que `createBookmarkSyncKey` gera chave estável para localizador
- [X] T009 [P] Testes de `src/utils/pdfChunks.ts` em `src/__tests__/utils/pdfChunks.test.ts`: com outline, sem outline, capítulo > 40 páginas subdividido, outline fora de ordem
- [X] T010 [P] Testes de `src/utils/pdfParagraphs.ts` em `src/__tests__/utils/pdfParagraphs.test.ts` usando fixtures de T004: linhas por baseline, quebra de parágrafo por gap/recuo/pontuação, heading por fonte maior, 2 colunas em ordem, cabeçalho/rodapé repetido removido, dehifenização, parágrafo cruzando página, `ranges` apontando para o texto bruto correto, página sem texto → nenhum bloco, região de figura → bloco `figure`

- [X] T010a [P] Testes de `src/utils/textLanguage.ts` e `src/utils/isbn.ts` em `src/__tests__/utils/textLanguage.test.ts` e `src/__tests__/utils/isbn.test.ts`: detecção en/pt/es/fr/de com textos de fixtures, texto curto/misturado → indefinido (abaixo da margem de confiança); ISBN-10/13 com hífens/espaços, prefixo "ISBN", dígito verificador inválido rejeitado, vários ISBNs → ordem de ocorrência

### Implementation

- [X] T011 [P] `BookFormat = 'EPUB' | 'PDF'` e campos `pdfTextLayer?`, `pageCount?`, `detectedLanguage?` em `Book`; `pdfReadingMode?` em `BookSettings` — em `src/types/book.ts`; `'pdf-metadata'` em `BookInfoSource` (`src/types/bookInfo.ts`) (não indexados; sem `version()` nova, data-model.md)
- [X] T012 [P] Implementar `detectBookFormat(blob)` em `src/utils/bookFormat.ts` (DI-011)
- [X] T013 [P] Implementar localizador `neopdf:v1` em `src/utils/pdfLocator.ts` (DI-005), incluindo `buildRawPageText(items)` com a regra de texto bruto da versão 1 e comentário explicando por que o localizador não depende da heurística
- [X] T014 [P] Implementar divisão em trechos em `src/utils/pdfChunks.ts` (DI-009)
- [X] T014a [P] Implementar `src/utils/textLanguage.ts` (detecção por stopwords sobre os idiomas de `src/utils/languageOptions.ts`, margem de confiança como constante nomeada, DI-012) e `src/utils/isbn.ts` (achar e validar ISBN-10/13 em texto, DI-013) — funções puras, sem dependência nova
- [X] T015 Spike de heurística (research.md §3): versão inicial de `src/utils/pdfParagraphs.ts`, medir SC-003 em 5 PDFs do corpus e registrar números no Registro da Fase; ajustar constantes nomeadas até ≥ 95% nos PDFs de 1 coluna
- [X] T016 Implementar `src/services/pdf/PdfBookFactory.ts`: adaptar `node_modules/foliate-js/pdf.js` (MIT — cabeçalho de atribuição) para devolver `{ book, pdf }` com um único `PDFDocumentProxy` (DI-008), leitura por faixas sobre Blob (research.md §1), mesmo layout `pre-paginated`, `toc`, `metadata`, `getCover`, `destroy`; importar o pdf.js pelo alias `@pdfjs/pdf.min.mjs` já existente
- [X] T017 Implementar `src/services/pdf/PdfTextExtractor.ts`: texto bruto + itens por página com cache LRU limitado (ex.: 32 páginas) e `reconstructChunk(chunk)` que chama `pdfParagraphs` com a página seguinte como lookahead

**Checkpoint**: Fundação pronta — user stories podem começar.

- [X] T018 Gate EPUB: `npm run lint && npm test && npm run build && npm run test:debug-epubs` iguais à linha de base

**Critério de Conclusão**: tipos compilam, localizador/trechos/reconstrução têm testes verdes, SC-003 ≥ 95% medido no spike, e o `PdfBookFactory` abre um PDF do corpus em Chromium (Playwright MCP) devolvendo `book` + `pdf`. Nenhuma mudança observável no app para EPUB.

**Registro da Fase**:

- Status: Concluída (2026-10-05)
- Feito:
  - T011 tipos: `BookFormat = 'EPUB' | 'PDF'`, `PdfTextLayer`, `PdfReadingMode`, campos `pdfTextLayer`/`pageCount`/`detectedLanguage` em `Book`, `pdfReadingMode` e `pdfLanguageWarningDismissed` em `BookSettings` (este último acrescentado para guardar a dispensa do aviso de idioma, T033b), `'pdf-metadata'` em `BookInfoSource` (+ rótulo "PDF" em `BookDetailsScreen.tsx`, exigido pelo `Record<BookInfoSource,…>`). Sem `version()` nova do Dexie.
  - T012–T014a utilitários puros: `bookFormat.ts` (ZIP→EPUB sem olhar `mimetype`, de propósito: mesmo critério frouxo do fluxo EPUB, DI-001), `pdfLocator.ts` (+ `buildRawPage`), `pdfChunks.ts`, `textLanguage.ts` (stopwords en/pt-BR/es/fr/de/it + kana→ja; `rankLanguages` exportada para calibrar), `isbn.ts`.
  - T015 `pdfParagraphs.ts` (≈750 linhas, função pura): linhas por baseline, colunas por "rio" vertical (com rio herdado das páginas vizinhas), cabeçalho/rodapé repetido, quebra por gap/recuo/linha curta/lista/título (por fonte e por forma), dehifenização com exceção de clítico, parágrafo atravessando coluna/página (âncora no último parágrafo de corpo, ignora nota de rodapé), tabela/lacuna → `figure` com `region`, `ranges` em texto bruto.
  - T016 `src/services/pdf/pdfjs.ts` (tipos mínimos + `loadPdfjs()` sob demanda), `pdfPageRender.ts` e `PdfBookFactory.ts` (`createPdfBook(blob) → { book, pdf }`, leitura por faixas com `disableAutoFetch`, `outlineEntriesFromToc`), adaptados de `foliate-js/pdf.js` (MIT, atribuição no cabeçalho). Alias `@pdfjs/pdf.min.mjs` também no `vitest.config.ts` e declaração em `src/types/foliate.d.ts`.
  - T017 `PdfTextExtractor.ts` (cache LRU de 32 páginas e 4 trechos, dedupe de chamadas simultâneas, `cleanup()` da página, `reconstructChunk` com 2 páginas de contexto antes e 3 depois).
- Testes executados:
  - Novos: `bookFormat` 6, `pdfLocator` 33, `pdfChunks` 19, `isbn` 11, `textLanguage` 9, `pdfParagraphs` 41, `PdfTextExtractor` 16 (= **135 testes novos**).
  - **SC-003 (spike T015)** — sintético: 1col/1col-pt/1col-es/2col/misto ≥ 95% de parágrafos limpos (100% nas janelas medidas). **PDFs reais** (11 livros do usuário, págs. 20–45, quebra falsa = bloco sem pontuação final seguido de minúscula): 0–1,3% em 8 livros de prosa, 2,9% (GTD_Trello, inglês), 5% (A Arte de Fazer Acontecer, caixas de texto), 6,8% (Web Scraping — livro técnico, blocos de código viram 1 linha = 1 parágrafo). **Amostra manual de 40 parágrafos aleatórios** lida por mim: Vida Organizada ≈ 97,5%, Trabalho Organizado ≈ 97,5%. Meta ≥ 95% em 1 coluna atingida na prosa.
  - T016/T017 em Chromium real (Playwright + `npx vite`, PDF servido por HTTP em streaming = caminho do Android): abre 1col/2col/escaneado/misto/senha/corrompido com os erros tipados `PasswordException`/`InvalidPDFException`. `grande.pdf` (1000 págs/188 MB): fetch 0,5 s, abertura 0,65 s, texto de um trecho 139 ms, heap JS 25 MB. Livro real de 157 MB (escaneado, 491 págs): abertura 138 ms. Livros reais de 300 págs: abertura 117–179 ms.
  - T018 gate EPUB: lint ok (após corrigir 2 `no-useless-escape` em `isbn.ts`) · **1226 testes passando + 2 skipped** (128 arquivos + 2 skipped; baseline 1094 → +132 líquidos; nenhum teste EPUB alterado) · build ok · debug-epubs **71**.
- Pendências:
  - Achado para T028: `metadata.author` pode vir como **array** (`["Mitchell, Ryan"]`) e `dc:language` existe em alguns PDFs reais (`pt`) — `PdfService` precisa normalizar ambos.
  - Limitações conhecidas da heurística (não bloqueiam): subtítulo em negrito do mesmo tamanho colado ao parágrafo seguinte; texto com letras espaçadas ("V o c ê") sai espaçado; bloco de código = 1 linha por parágrafo; nota de rodapé sai como bloco após o parágrafo de origem (a decidir no modo texto/TTS se vira nota ou é ignorada); rótulo de figura (SVG) e fórmula soltos viram parágrafos curtos.
  - Validação em device Android adiada para a Fase 3 (T026), como previsto.

---

## Phase 3: User Story 1 - Importar e ler PDF em página fiel (Priority: P1) 🎯 MVP

**Objetivo**: PDF importa pelos 3 caminhos e é lido em página fiel com scroll, zoom, tema, sumário, progresso e marcadores.

**Independent Test**: `quickstart.md` § Import e § Página fiel, mais § Regressão EPUB.

### Testes da Fase

- [X] T019 [P] [US1] Testes de `src/services/pdf/PdfService.ts` em `src/__tests__/services/pdf/PdfService.test.ts` (pdf.js mockado): metadados com/sem título, fallback para nome do arquivo, `pdfTextLayer` full/partial/none (inclui texto-lixo, R-009), `detectedLanguage` vindo dos metadados / da detecção / indefinido, senha → erro tipado, corrompido → erro tipado
- [X] T019a [P] [US1] Testes de `src/services/bookInfo/PdfBookInfoProvider.ts` em `src/__tests__/services/bookInfo/PdfBookInfoProvider.test.ts` (texto de páginas mockado): `lookupHints` com título/autor dos metadados, ISBN achado na página de copyright vira identificador, sem ISBN → identificadores vazios sem erro; e casos em `src/__tests__/services/bookInfo/BookInfoRefreshService.test.ts` (ou arquivo existente equivalente): livro PDF usa `PdfBookInfoProvider`, **livro EPUB usa exatamente a lista de provedores de hoje**
- [X] T019b [US1] Casos de idioma em `src/__tests__/hooks/useReaderAppearance.test.tsx` e `src/__tests__/screens/BookDetailsScreen.test.tsx`: PDF usa `bookLanguage` manual > `detectedLanguage` > indefinido (sem cair em `'en'`, TTS traduzido desligado); **EPUB continua `bookLanguage ?? extras.language`**; aviso único de idioma indefinido no leitor não reaparece depois de dispensado
- [X] T020 [P] [US1] Casos PDF em `src/__tests__/services/BookImportService.test.ts`: web grava `format: 'PDF'`, `pdfTextLayer`, `pageCount`, capa; duplicado detectado; nativo lê `format` da resposta do prepare; **casos EPUB existentes intactos**
- [X] T021 [P] [US1] Casos PDF em `src/__tests__/services/NativeLibraryImportService.test.ts` e `src/__tests__/services/BookFileResolver.test.ts`: MIME e nome por formato; EPUB inalterado
- [X] T022 [P] [US1] Teste de contrato `src/__tests__/components/reader/PdfPageViewer.contract.test.tsx` (métodos de navegação/localização do `EpubViewerHandle` — contracts/reader-viewer-handle.md)
- [X] T023 [US1] Casos em `src/__tests__/screens/ReaderScreen.test.tsx`: livro PDF monta `PdfPageViewer`; **livro EPUB (e sem `format`) monta `EpubViewer` com exatamente as mesmas props de antes**; progresso salvo como localizador `neopdf:`
- [X] T024 [P] [US1] Casos em `src/__tests__/screens/LibraryScreen.test.tsx`, `src/__tests__/screens/HomeScreen.test.tsx`, `src/__tests__/screens/BookDetailsScreen.test.tsx`: inputs aceitam `.pdf`; Detalhes de livro PDF não chama `EpubService.parseExtras`
- [X] T025 [US1] E2E Chromium (Playwright MCP): import web + página fiel com `1col.pdf`, `escaneado.pdf`, `senha.pdf`
- [X] T026 [US1] Device: spikes de research.md §1, §2 e §5 no começo da fase (registrar números); depois `quickstart.md` § Import, § Página fiel e SC-002 com `grande.pdf` — 2026-10-06: SC-002, pinça/nitidez, memória em 30 min, aviso de escaneado e marcador com sync medidos no SM-S911B. **Por decisão do dono do produto**, o restante (SC-001 no corpus completo, import/capa nativa de 20 PDFs, smoke de link interno do T038s no APK) foi movido para o T079
- [X] T027 [US1] Gate EPUB completo: automatizado + `quickstart.md` § Regressão EPUB no device — 2026-10-06: gate verde (1395 + 2 skipped) e no device (SM-S911B) tradução, TTS com tela apagada e marcador com sync OK no EPUB, confirmados pelo dono do produto; import por arquivo/pasta/"abrir com" OK

### Implementation

- [X] T028 [P] [US1] `src/services/pdf/PdfService.ts`: `parseMetadata(file)` → `{ title, author, language, detectedLanguage, coverBlob, pdfTextLayer, pageCount }` usando `PdfBookFactory` (abre, lê, destrói); `detectedLanguage` = idioma dos metadados ou `detectTextLanguage` sobre o texto das páginas já amostradas para `pdfTextLayer` (sem leitura extra do arquivo, DI-012); capa da página 1 redimensionada com `resizeCoverBlob`/`MAX_COVER_DIMENSION_PX` existentes; erros tipados senha/inválido (FR-015)
- [X] T029 [US1] `src/services/BookImportService.ts`: aceitar `.pdf` nos previews (`isSupportedEpub`/`buildNativeImportPreview` passam a aceitar os dois formatos; `ImportPreviewItem.format` ganha `'PDF'`), despachar metadados por `detectBookFormat` (EPUB → `EpubService.parseMetadata` como hoje; PDF → `PdfService.parseMetadata`), gravar `format`/`pdfTextLayer`/`pageCount`; título fallback removendo `.pdf`; `reextractCover` por formato. Caminho EPUB sem mudança de comportamento (DI-001)
- [X] T030 [P] [US1] `src/services/NativeLibraryImportService.ts` (`fileFromChunks` usa MIME do formato; tipos da resposta do prepare com `format`) e `src/services/BookFileResolver.ts` (MIME/nome default por `book.format`)
- [X] T031 [P] [US1] Inputs de arquivo aceitam PDF: `src/components/AddBookButton.tsx`, `src/screens/HomeScreen.tsx`, `src/screens/LibraryScreen.tsx` (`EPUB_FILE_PATTERN` e `accept`)
- [X] T032 [US1] Nativo (contracts/native-library-plugin.md): `NeoReaderLibraryPlugin.java` (MIME do picker, listagem de `.pdf` na pasta, prepare com detecção por bytes, cópia `.pdf`, capa via `PdfRenderer`, `pageCount`, códigos `PDF_PASSWORD_PROTECTED`/`PDF_INVALID`), `ExternalEpubIntentStore.java` (aceita `application/pdf`/`.pdf`), `AndroidManifest.xml` (intent-filter `application/pdf`)
- [X] T033 [P] [US1] Guardas de formato onde o código assume EPUB fora do leitor: `src/screens/BookDetailsScreen.tsx` (`EpubService.parseExtras`), `src/hooks/useReaderAppearance.ts` (`parseExtras`)
- [X] T033a [US1] `src/services/bookInfo/PdfBookInfoProvider.ts` (DI-013): `source: 'pdf-metadata'`, `lookupHints` dos metadados, ISBN via `src/utils/isbn.ts` no texto das 10 primeiras e 3 últimas páginas, `language`/`pageCount`/`publisher`/`synopsis` dos metadados; escolher o provedor local por `book.format` em `src/services/bookInfo/BookInfoRefreshService.ts`, `src/hooks/useBookInfo.ts` e no default de `src/services/bookInfo/BookInfoService.ts`; ficha salva no import com `source: 'pdf-metadata'` em `src/services/BookImportService.ts`; rótulo "PDF" no mapa de origens de `src/screens/BookDetailsScreen.tsx`. Lista de provedores do EPUB sem mudança
- [X] T033b [US1] Idioma do PDF (DI-012): em `src/hooks/useReaderAppearance.ts` e `src/screens/BookDetailsScreen.tsx`, para `book.format === 'PDF'` resolver `bs.bookLanguage ?? book.detectedLanguage` e tratar ausência como indefinido (sem fallback `'en'`); aviso único e não bloqueante no leitor com atalho para escolher o idioma (reusa o seletor de idioma existente da tela de Detalhes), dispensa gravada por livro. Caminho EPUB inalterado
- [X] T034 [US1] `src/hooks/usePdfReaderSession.ts`: resolve o arquivo (`BookFileResolver`), abre `PdfBookFactory`, calcula trechos, expõe `pdf`, `book`, `chunks`, `extractor`, modo atual; destrói tudo ao sair/trocar de livro (mesma disciplina da feature 009)
- [X] T035 [US1] `src/components/reader/PdfPageViewer.tsx` + `src/components/reader/pdfPage/`: `foliate-view` com book do factory, `foliate-fxl` em `flow="scrolled"`, `pageColors` do tema do leitor, sumário (`onTocReady`), `relocate` → localizador `neopdf:` do topo visível → `onRelocate`, `goTo` por localizador/página/fração, pinça/zoom + pan (research.md §2), toque fora de texto → `onCenterTap`, toque em parágrafo → balão de ações com "marcador" (US3 acrescenta traduzir/Word Lens), marcadores desenhados na margem da página; métodos de navegação do `EpubViewerHandle`
- [X] T036 [P] [US1] `src/components/reader/PdfTextLayerNotice.tsx` (PDF/página sem texto, FR-014) e aviso de PDF grande > 1000 páginas ou > 200 MB (FR-016)
- [X] T037 [US1] `src/screens/ReaderScreen.tsx`: se `book.format === 'PDF'` monta `PdfPageViewer` via `usePdfReaderSession`; senão, o bloco `<EpubViewer ... />` atual sem alteração; marcadores de PDF gravam localizador (DI-006); tratamento de arquivo ausente igual ao EPUB
- [X] T038 [P] [US1] Textos novos (aviso sem texto, PDF grande, senha, inválido, rótulo PDF, aviso de idioma indefinido) em `src/i18n/messages.ts` (pt-BR/en/es); revisar `quickActions.reextractCover.description` para não citar só EPUB
- [X] T038a [US1] Bugs achados no E2E de 2026-10-05 (Chromium, Playwright MCP) e corrigidos em `src/components/reader/PdfPageViewer.tsx` e `src/components/reader/pdfPage/pdfPageGestures.ts` (R-021..R-024): vazamento de `Document` por página lida; pinça ignorada/fraca e zoom nativo do navegador; posição salva da página do meio da tela; percentual sem arredondar
- [X] T038b [P] [US1] Ficha de PDF com ISBN da edição errada (R-025): priorizar o ISBN da própria edição na página de copyright (ignorar linhas com "©"/"translation"/"Primeira edição"/edição anterior e ISBNs das últimas páginas quando houver um da edição) em `src/services/bookInfo/PdfBookInfoProvider.ts`; caso de teste com o texto real da pág. 3 do "Web Scraping com Python"
- [X] T038c [P] [US1] Título-lixo nos metadados (R-026): título que começa com "Microsoft Word -", termina em `.doc[x]` ou contém escapes `\ddd`, e autor com 1 caractere → usar o nome do arquivo / "Autor desconhecido" em `src/services/pdf/PdfService.ts` (ex.: "Os Noturnos")
- [X] T038d [US1] Rolagem rápida deixa 16–28 iframes de página carregados (teto do foliate = 8) (R-027): investigar se é o `foliate-fxl` (páginas em `loading` cancelado) ou o viewer; medir no device antes de decidir
- [X] T038e [P] [US1] Detalhes de UI (R-028): aviso de PDF sem texto cobre o cabeçalho do chrome; folha de sumário vazia diz "This EPUB did not provide…" em PDF; chrome continua aberto depois de escolher um item do sumário
- [X] T038f [US1] **Página em branco com o sandbox de produção (R-030, crítico)**: com o iframe sem `allow-scripts` o `<canvas>` da página mostra só o fallback — PDF em branco no APK. Página passa a ser exibida como `<img>` (PNG do canvas desenhado no documento pai) em `src/services/pdf/pdfPageRender.ts`; e o dev server passa a aplicar o mesmo sandbox (R-029, `vite.config.ts`)
- [X] T038h [US1] Teclado do Android aberto ao entrar no leitor de PDF (R-032): o textarea da caixa de highlight (fechada, mas montada) tinha `autoFocus` incondicional; no EPUB o `EpubViewer` toma o foco e mascarava o problema. `autoFocus={open}` em `src/components/reader/HighlightComposerSheet.tsx`; verificação visual reprova campo com foco ao abrir o leitor. Achado no celular (2026-10-06), reproduzido no navegador
- [X] T038k [US1] Página demorava 4–13 s para aparecer no celular depois de rolar/saltar (R-034): `canvas.toBlob` (PNG/JPEG, e `OffscreenCanvas.convertToBlob`) no WebView do Android só codifica em tempo ocioso; benchmark no SM-S911B: toBlob 4–13 s × `toDataURL` PNG 30–42 ms. `src/services/pdf/pdfPageRender.ts` passa a usar `toDataURL` (render da página e capa do import). Device: salto 13,3 s → 0,4–0,66 s
- [X] T038m [US1] Import no device (R-036): "abrir com" consumido por uma execução do efeito já cancelada e descartado sem importar — laço único que drena as pendências (`src/App.tsx`, 19eae7b); reimportação fantasma do último arquivo escolhido ao reabrir o app (pendência nativa nunca limpa, desde 5cc247f — b4cb0d1); textos de import que ainda diziam só "EPUB" (d8f5748). Device: arquivo, pasta e "abrir com" OK
- [X] T038n [US1] Pinça no device (R-037): texto sumia durante o gesto (origem do `scale()` recalculada sobre o retângulo já escalado) e a leitura pulava ao soltar — âncora fixa no ponto inicial dos dedos e reposicionamento pelo mesmo ponto da página (372188d); zoom out "se perdia" porque o pan por pointer events (feito para mouse) movia a página com cada dedo — só mouse agora (1ee105d). Verificação `scripts/verificacao-visual/pdf-pinca.check.js` (4/4; 0/4 no código antigo) + medição no device via CDP (8 pinças, variação < 0,01 do ponto sob os dedos)
- [X] T038o [US1] Texto turvo/página pulando depois do zoom (R-038): imagem antiga ficava no tamanho do zoom anterior até o novo render (metade da página por ~2,4 s em 290%, app travado redesenhando todas as páginas). Imagem esticada no mesmo frame do zoom, páginas fora da tela redesenham 700 ms depois, bitmap ≤ 2^24 px (5037de3). Device: nítida em 0,58 s (200%), 1,9 s (300%), 0,65 s (zoom out). Aceito pelo dono do produto
- [X] T038p [US1] (Opcional) Zoom alto ainda leva ~2 s até ficar nítido (R-039): render da página inteira em ~15 Mpx na thread principal. Alternativa: render só da área visível em alta resolução (tiles), se incomodar no uso real — 2026-10-06: não feito; registrado em `.planning/backlog.md` (Ideias Futuras) por decisão do dono do produto
- [X] T038q Isolar o código específico de cada formato antes da Fase 4 (R-040), mantendo o que é comum (paridade). Refatoração sem mudança de comportamento, com gate EPUB completo:
  - importação: um importador por formato atrás de uma interface comum (`BookImportService.ts` tem 15 ramificações por formato), com testes próprios;
  - leitor: o viewer declara capacidades (tradução inline, modo texto etc.) e a `ReaderScreen.tsx` consulta essas capacidades em vez de checar o formato (18 ramificações hoje);
  - patch `evictFoliateScrollPagesAfterLoad` (`vite.config.ts`) atinge também EPUB de layout fixo: manter, porque reduz iframes vivos de 11 para 8 no mesmo teste, ou limitar ao PDF. Decidir junto com o T038r — 2026-10-06: **mantido para os dois formatos** (decisão do dono do produto: EPUB de layout fixo nem abre hoje, logo não há comportamento EPUB a proteger)
- [X] T038r EPUB de layout fixo (`rendition:layout = pre-paginated`, ex.: quadrinhos e livros ilustrados) **não abre** (R-041), situação anterior à feature 022 (mesma falha no `main`, 6c1acb9). O `EpubViewer` só chama `onLoad` ao finalizar uma seção (fluxo do renderer de texto); com o `foliate-fxl` isso nunca acontece e o vigia de 8 s (`INITIAL_INTERACTIVE_TIMEOUT_MS`) mostra "Não foi possível abrir este livro". Reproduzir com `scripts/verificacao-visual/gerar-epub-fxl.py` + `epub-fxl.check.js`. Fora do escopo da 022: decidir com o dono do produto se vira feature/bug próprio — 2026-10-06: registrado como `[Bug]` em `.planning/backlog.md` (Ideias Futuras), caminho `sdd-bugfix`; não corrigido na 022
- [X] T038j [US1] Abertura do PDF grande no celular em 4,5 s (SC-002 pede ≤ 3 s; PDF de 7 páginas abre em 0,68 s): custo cresce com o arquivo — instrumentar as etapas (ler o arquivo local 0,8 s medido, abrir no pdf.js, sumário/trechos) antes de otimizar. Nova medição equivalente no SM-S911B: 10 aberturas quentes 2033–2300 ms (mediana 2116,5 ms, p95 2300 ms) e 4 frias 2339–2453 ms; a amostra anterior de 4,5 s não se repetiu, portanto não houve otimização especulativa
- [X] T038l Achado fora do PDF (R-035): `src/utils/imageResize.ts` também usa `canvas.toBlob` — import de EPUB com capa > 2000 px deve atrasar 4–13 s por livro no Android. Caminho do EPUB: decidir antes de mudar (DI-001) — 2026-10-06: dono do produto autorizou mudar o caminho compartilhado. `resizeCoverBlob` usa `toDataURL` + `dataUrlToBlob` (extraído de `pdfPageRender.ts` para `src/utils/dataUrl.ts`), libera o canvas e devolve o original se a codificação falhar; testes atualizados. Falta medir no device o import de EPUB com capa grande (T079)
- [X] T038i [US1] Aba de capítulos dos Detalhes de um PDF fica sempre vazia (R-033): `BookDetailsScreen` agora lê o outline com `PdfBookFactory`, converte cada destino para `neopdf:v1`, libera o documento e preserva o caminho EPUB; testes de sumário presente e ausente passaram
- [X] T038g [US1] Busca do Google Books usa o texto de reserva "Autor desconhecido" como termo (R-031) — afeta PDF e EPUB; decidir junto com o dono do produto se muda o caminho compartilhado — 2026-10-06: autorizado. `usableAuthorHint` (`src/utils/placeholderAuthor.ts`) descarta o texto de reserva na busca e no critério de match do `GoogleBooksProvider` (e no `YouTubeReviewsProvider`, mesma falha), sem bloquear o autor real que o Google Books encontrar. 2 testes novos falham no código antigo e passam no novo
- [X] T038u [US1] Descoberto no gate do fechamento da Fase 3 (R-044): a prévia da 1ª página do PDF na tela de carregamento (commit 723b802) fazia `coverState?.bookId === pdfPreviewBookId` virar `undefined === undefined` sem capa e sem livro PDF, e `coverState.url` quebrava o carregamento do leitor — **inclusive de EPUB**. `npx tsc -p tsconfig.app.json` acusava o erro e os 98 testes de `ReaderScreen.test.tsx` falhavam no `HEAD`. Corrigido com checagem explícita de `coverState` em `src/screens/ReaderScreen.tsx`; 98/98 verdes
- [X] T038s [US1] Descoberto ao investigar o log de T026 (R-042): `AnnotationLayer` da versão atual do pdf.js recebe `linkService` em `render()`, não no construtor; serviço movido para `render()`, teste de regressão passou e PDF sintético com link interno renderizou no Chromium real sem o erro
- [X] T038v [US1] Marcador de PDF salvava mas não abria no parágrafo marcado (R-050, achado no device em 2026-10-06, O Milagre da Manhã): ao voltar a uma página que tinha saído da memória, o `waitForRenderedPage` aceitava a imagem como "pronto" (atalho de página escaneada) ~100 ms antes da camada de texto; o span não era achado e a leitura parava no topo da página. `navigateToPoint` agora espera a camada de texto quando há linha a alcançar, e rola o renderer por conta explícita em vez de `span.scrollIntoView()` (chamado de dentro do iframe da página). Vale também para restaurar o progresso salvo. Verificação nova `scripts/verificacao-visual/pdf-marcador.check.js` com os localizadores do device: 5/5 (antes 4/5, falhando na volta à página descartada); teste de contrato falha no código antigo. Conferir no device no T079
- [X] T038t [US1] Modo Original do PDF persistia no livro, mas o `PdfPageViewer` ignorava `overrideBookColors` e continuava recolorindo a página com o tema AMOLED (R-043). O viewer agora passa `pageColors={}` ao foliate/pdf.js no modo Original, usa fundo branco, atualiza páginas já abertas e oferece Original no painel do leitor; ficha e painel mostram copy específica de PDF. Regressão automatizada e smoke no Android passaram

**Critério de Conclusão**: os 3 caminhos de import aceitam PDF; um PDF nascido digital abre em página fiel em ≤ 3 s no device, com zoom nítido, tema, sumário, progresso restaurado e marcador (com sync Pro); escaneado mostra aviso; senha/corrompido recusados; idioma do PDF resolvido pela ordem de DI-012 (SC-009 medido no corpus) e ficha enriquecida pelas fontes online (ISBN do texto quando houver); SC-001/SC-002/SC-007 medidos; e o checklist de regressão EPUB passou sem diferença.

**Checkpoint**: User Story 1 funcional e testável isoladamente (entregável como MVP).

**Registro da Fase**:

- Status: **Concluída em 2026-10-06** (com pendência de device movida para o T079 por decisão do dono do produto). Histórico: implementada e validada em Chromium; T027 concluído no device; T026 fechado com o restante adiado. No SM-S911B (Android 16), abertura fria e quente de `grande.pdf` cumpriram SC-002 e a navegação por 30 min terminou sem crash. O APK de debug novo com T038i/T038q/T038s/T038t foi instalado por cima, preservando dados; o sumário de PDF, o sync de marcador e o modo Original passaram no smoke.
- Feito:
  - T028 `PdfService.parseMetadata` (título/autor com normalização de array, capa da pág. 1, `pageCount`, `pdfTextLayer` full/partial/none por amostra de 8 págs. espalhadas com detecção de texto-lixo R-009, idioma: metadados > detecção > indefinido, `PdfImportError` para senha/inválido). `PdfImportError.ts` separado para o serviço nativo não puxar o pdf.js.
  - T029/T030 `BookImportService` (despacho por conteúdo via `detectBookFormat`; só PDF desvia, EPUB intocado; previews `.pdf`; `format`/`pdfTextLayer`/`pageCount`/`detectedLanguage` gravados; capa `pdf-rendered`; `reextractCover` por formato; arquivo `.pdf` que não é PDF → `PDF_INVALID`), `NativeLibraryImportService` (MIME por extensão; código do plugin → `PdfImportError`), `BookFileResolver` (`fetchLocalFile`, MIME/nome por formato). Import nativo de PDF: o JS abre a cópia local com o pdf.js; a capa do `PdfRenderer` tem prioridade; PDF recusado apaga a cópia local.
  - T031 inputs de arquivo/pasta aceitam `.pdf` (`AddBookButton`, `HomeScreen`, `LibraryScreen`).
  - T032 nativo: `PdfImportHelper.java` (detecção por bytes, `PdfRenderer` → `PDF_PASSWORD_PROTECTED`/`PDF_INVALID`, nº de páginas, capa JPEG ≤1400 px), `NeoReaderLibraryPlugin.java` (picker oferece `application/pdf`, pasta lista `.pdf`, `prepareLocalEpubImport` detecta o formato pelos bytes e devolve `format`/`pageCount`; EPUB inalterado), `ExternalEpubIntentStore.java` e `AndroidManifest.xml` ("abrir com" `application/pdf`). Compila e instala (`gradlew assembleDebug` + `adb install`).
  - T033/T033b guardas de formato: `BookDetailsScreen` e `useReaderAppearance` não leem o arquivo como EPUB em PDF; idioma de PDF = manual > detectado > indefinido (`bookLanguageUndefined`), aviso único com dispensa gravada por livro (`pdfLanguageWarningDismissed`) e escolha de idioma pelo leitor.
  - T033a `PdfBookInfoProvider` (`pdf-metadata`; ISBN nas 10 primeiras + 3 últimas págs.); lista de provedores por formato em `BookInfoRefreshService`, `useBookInfo` e `BookInfoService.defaultProviders`; rótulo "PDF" na ficha.
  - T034 `usePdfReaderSession` (abre/destrói o documento; `onError` para o leitor).
  - T035 `PdfPageViewer` + `pdfPage/` (`pdfPageMapping`, `pdfPageOverlay`, `pdfPageGestures`): foliate-view/fxl em rolagem contínua, tema por `pageColors`, sumário já como localizadores de página, restauração de posição, relocate → `neopdf:` com trecho/capítulo/`sectionHref`, pinça 100–400% com pan horizontal, toque fora do texto → chrome, toque em texto → balão "Marcar parágrafo" (parágrafo reconstruído), marcadores na margem. TTS/tradução/Word Lens/highlights ficam como no-ops seguros até as US3–US5 (contrato `EpubViewerHandle` completo).
  - T036 `PdfTextLayerNotice` (sem texto / texto parcial / PDF grande > 1000 págs ou 200 MB) e `PdfLanguageNotice`. T037 `ReaderScreen` (`isPdf` → `PdfPageViewer`; bloco do `EpubViewer` intocado apenas com a condição `!isPdf`; painel de aparência esconde fonte/tamanho/entrelinha/linha de foco em PDF, mas oferece modo Original/Confortável para cores desde T038t). T038 chaves i18n pt-BR/en/es + descrição de "Recriar capa" sem citar só EPUB.
  - `utils/cfi.ts`: localizador `neopdf:` nunca passa pelo parser de CFI (equivalência só por igualdade).
- Testes executados:
  - Novos (≈ +128): `PdfService` 22, `BookImportService.pdf` 19, `PdfBookInfoProvider` 9 + provedores por formato no refresh 3, nativo/resolver +8, idioma (hook 6 + detalhes 3), `pdfPageMapping` 13, `usePdfReaderSession` 9, contrato do `PdfPageViewer` 13, `ReaderScreen` PDF +19 (inclui "EPUB monta o `EpubViewer` com exatamente as mesmas props"), inputs 3.
  - **T025 E2E em Chromium (Playwright; harness com o `BookImportService` e o `ReaderScreen` reais, sem a casca de login Google):** 1col, escaneado, misto, 2col, 1col-pt, semmeta, `grande.pdf` (1000 págs/188 MB) e livros reais importam, mostram capa `pdf-rendered`, detectam duplicado, abrem em página fiel e salvam progresso `neopdf:`; `senha`→`PDF_PASSWORD_PROTECTED`, `corrompido` e `.pdf` falso→`PDF_INVALID` sem criar livro; escaneado/misto/grande mostram os avisos certos. Idioma detectado: en/pt-BR corretos, `escaneado` indefinido.
  - Viewer em DPR 1/2/3 (Chromium): camada de texto alinhada ao texto desenhado, tema escuro por `pageColors`, balão → payload de marcador, marcador na margem, pinça via CDP multitouch (100%→178%→100%), pan horizontal até a borda.
  - T027 (parte automatizada) gate: lint ok · **1354 testes passando + 2 skipped** (base 1094 intacta) · build ok · `test:debug-epubs` 71.
- Bugs reais achados pelo E2E/Chromium e corrigidos: (1) `--scale-factor` não definido pelo foliate → camada de texto com 1/dpr do tamanho (R-018); (2) o foliate calcula o "índice atual" com as páginas sem altura e abria no meio do livro → navegar sempre ao ponto inicial (R-019); (3) o `detail` do `relocate` do foliate-view não traz o índice da página → usar `renderer.index`; (4) `top` dos spans em "marked content" vem em `calc()` → posição dos marcadores por retângulos; (5) PDF com texto impresso N× e tamanho de corpo por página (Fase 2).
- **Rodada de testes 2026-10-05 (Playwright MCP + `npm run dev`, harness temporário — T038a):**
  - Validado: import de 15 arquivos (11 PDFs ok, senha/corrompido/falso recusados, duplicado detectado); `grande.pdf` abre em 1,3 s; sumário, marcador (`neopdf:` + `syncKey`, ícone na margem, volta ao parágrafo), tema Paper, avisos de escaneado/misto; memória liberada ao trocar de livro; EPUB importado pelo conteúdo, abre, rola, salva CFI e a tradução inline funciona.
  - Corrigidos (com teste que falha no código antigo e passa no novo, e revalidação em Chromium):
    - Vazamento (R-021): heap crescia ~0,35 MB/página lida (+107 MB em 304 páginas, imune a GC) → estável (27 MB na pág. 304); `Map` de documentos 186 → 10.
    - Pinça (R-022): ignorada logo após rolar, ×1,22 quando pedia ×1,5 (= √1,5, feedback visual encolhendo as coordenadas do iframe), 48 erros "Ignored attempt to cancel a touchmove" e zoom nativo do navegador ampliando o app → ×1,5 em todos os cenários, ×2,5 pedido = 250%, afastar volta a 100%, 0 erros, `visualViewport.scale` = 1.
    - Posição (R-023): salvava a página do meio da tela com offset 0 (parágrafo lido ficava 261 px acima ao reabrir) → salva a página do topo com o offset do 1º texto visível (reabre a 6 px).
    - Percentual (R-024): "49.12355731625653%" no chrome e na lista de marcadores → inteiro, como no EPUB (a fração continua precisa).
  - Gate após as correções: lint ok · **1363 testes passando + 2 skipped** · build ok · `test:debug-epubs` 71.
  - Achados não corrigidos nesta rodada → T038b–T038e (R-025..R-028).
- **Rodada 2026-10-06 (T038b–T038f, validada em Chromium com o sandbox de produção):**
  - T038b: ISBN escolhido por camadas e contexto da linha ("Web Scraping com Python" → 978-85-7522-734-3, não o do original em inglês). T038c: título/autor-lixo de exportação → nome do arquivo / "Autor desconhecido" ("Os Noturnos"). (Commit `6122d20`.)
  - T038d: patch `evictFoliateScrollPagesAfterLoad` (`vite.config.ts`) → **8 iframes** após cada rolagem rápida (antes 16–28), sem página em branco ao voltar; `paginator.js` (EPUB) sem mudança — hash do chunk de build idêntico.
  - R-029: hooks do Vite na forma clássica → o dev aplica o sandbox endurecido (antes só o build); os 70+ warnings de sandbox sumiram.
  - **T038f / R-030 (crítico)**: com o sandbox de produção a página PDF saía em branco (canvas em documento sem scripts mostra só o fallback). Isso estava escondido porque toda validação anterior rodou no dev sem o sandbox. Agora `<img>` (PNG): texto, escaneado e zoom aparecem; DPR 3: 1ª página 0,47 s, render por página mediana 64 ms / máx. 319 ms (desktop), imagem em 3× (nítida), zoom 200% redesenha em 2472 px. **O APK de debug instalado no celular foi gerado antes desta correção — gerar outro antes do T026/T027.**
  - T038e: avisos de PDF empilhados abaixo do cabeçalho do chrome (y=136 com chrome, y=16 sem); sumário vazio em PDF com texto próprio; sumário/marcador em PDF fecham o chrome (EPUB inalterado).
  - Gate: lint ok · **1381 testes passando + 2 skipped** · build ok (sem `allow-scripts`, patch presente) · `test:debug-epubs` 71.
- **Device 2026-10-06 (SM-S911B, Android 16, APK de debug; medições via DevTools do WebView por `adb forward` + Playwright `connectOverCDP`):**
  - Página fiel desenhada no aparelho (R-030 confirmado): `<img>` 1080×1527 em DPR 3, sandbox `allow-same-origin`, camada de texto montada; captura de tela conferida.
  - Achados no device e corrigidos: teclado aberto ao entrar no PDF (T038h) e página levando 4–13 s para aparecer (T038k) — ambos revalidados no aparelho.
  - `grande.pdf` (1000 págs/188 MB), rodada curta anterior: memória do processo 258 MB na Biblioteca → 369 MB aberto, com 8 páginas carregadas após rolar até a pág. 1000; salto mostra a página em 0,4–0,66 s; ler o arquivo local 0,8 s (servidor local do Capacitor aceita Range: 206). Houve uma abertura isolada de 4,5 s, não reproduzida nas novas medições de T038j.
  - PDF pequeno (7 págs) abre em 0,68 s; EPUB abre sem teclado.
- **Device 2026-10-06, retomada de T026 (mesma build instalada):**
  - `grande.pdf` (1000 págs.) abriu até a primeira imagem visível em 10/10 aberturas **quentes**: 2033–2300 ms, mediana 2116,5 ms, p95 2300 ms. Requisição do arquivo local: 834–1063 ms nos seis últimos ensaios. Cada abertura deixou 3 iframes com imagem carregada.
  - **4 aberturas frias** equivalentes após reiniciar o processo: 2453, 2382, 2339 e 2363 ms; todas abaixo de 3 s. A medição isolada anterior de 4,5 s não se repetiu (T038j encerrado sem otimização).
  - **30 min de leitura contínua**, 900 passos de rolagem até a página 1000: processo permaneceu vivo, 8 iframes de página ao final. PSS em MB aos 0/5/10/15/20/25/30 min: 346/463/488/517/535/324/477; a queda aos 25 min mostra coleta/liberação durante a leitura, sem crescimento monótono até o fim. Sem crash/ANR/OOM no log pós-teste. Quatro avisos de timeout do Google Drive durante sincronização de progresso não provam sucesso do sync de marcador PDF.
  - **Smoke no APK novo** (instalação `adb install -r`, dados preservados): `The Quiet Archive` (`1col.pdf`) mostra 11 itens do outline em Detalhes; selecionar "Chapter 5" abre o leitor na seção correta, com 4 iframes de página. Marcador de parágrafo criado com `neopdf:v1;p=24;o=48` e `syncedAt` preenchido; remoção também recebeu `syncedAt`. Livro de teste devolvido a 4% e zero marcadores; app devolvido ao EPUB original em 42%. O log do APK novo não mostrou crash/ANR nem erro de renderização PDF; um aviso de seed do WebView não se correlaciona com o fluxo.
  - T038s no Chromium real (`npx vite --port 5199 --strictPort` + Playwright): PDF sintético de 57 páginas com 1 anotação de link interno gerada por `pypdf`; `renderPdfPage` criou 1 link com `data-internal-link` sem exceção. O teste unitário também passou. O arquivo temporário e o servidor foram removidos.
  - `escaneado.pdf`: 4 iframes com imagem 1080 px carregada e aviso visível "This PDF has no selectable text", com explicação sobre os recursos indisponíveis. Evidência manual no device para esse arquivo (SC-007 parcial).
  - Gate automatizado após T038i/T038q/T038s: `npx tsc --noEmit -p tsconfig.app.json` OK; `npm run lint` OK; `npm test` **1401 passando + 2 skipped** (142 arquivos + 2 skipped); `npm run build` OK; `npm run test:debug-epubs` **71 passando**. Testes direcionados: 208/208.
  - QA preservou Wi-Fi, dados móveis e configuração de tela ligada; o app voltou ao EPUB anteriormente aberto, no progresso de 42%. Não houve crash/ANR/OOM durante esta rodada. O log contém `getDestinationHash` às 15:20, antes da rodada iniciada às 15:33; não atribuído a ela.
- **Fechamento 2026-10-06 (decisões do dono do produto + T038g/T038l/T038u):**
  - Decisões: T038r → `[Bug]` no backlog (`sdd-bugfix`); patch de descarte de páginas mantido para os dois formatos (fecha T038q); T038p → ideia no backlog; T026 restante → T079; T038g e T038l autorizados no caminho compartilhado.
  - T038g: `usableAuthorHint` no Google Books e no YouTube. T038l: `resizeCoverBlob` com `toDataURL`. T038u (R-044): carregamento do leitor quebrava sem prévia de capa PDF — corrigido.
  - Testes executados (1 iteração extra: o 1º gate pegou o T038u, que já existia no `HEAD`/723b802): `npx tsc --noEmit -p tsconfig.app.json` OK · `npm run lint` OK · `npm test` **1420 passando + 2 skipped** (144 arquivos + 2 skipped) · `npm run build` OK · `npm run test:debug-epubs` **71**. Controle negativo do T038g: os 2 testes novos falham com os provedores antigos.
- Pendências (estado no fechamento):
  - Device fica para o T079: SC-001 no corpus, 20 PDFs/capa nativa, smoke do T038s no APK e import de EPUB com capa grande (T038l). O T038u não foi verificado no device — o APK instalado é anterior ao 723b802.
  - **T038t/R-043 resolvido**: no APK atualizado, o PDF anteriormente preto abriu com `pageColors={}`, fundo `#ffffff` e pixel branco; selecionar AMOLED produziu `pageColors` preto e pixel preto, e voltar a Original restaurou branco. Após fechar e reabrir, Original permaneceu. Testes: lint/tipos/build OK, 1405 testes passando + 2 skipped, 71 regressões EPUB. Log sem crash/ANR; apenas aviso de seed do WebView sem impacto observado.
  - **T026 (device)**: faltam SC-001 no corpus completo e spike da capa nativa/import de 20 PDFs. Marcador PDF com sync confirmado no APK novo após timeout transitório na rodada anterior. Abertura fria/quente e 30 min/memória foram medidos na build anterior a T038i/T038q/T038s; pinça/nitidez já foram validadas em rodada anterior; SC-007 confirmado apenas em `escaneado.pdf` nesta rodada.
  - **T027**: concluído no device em 2026-10-06 (registro anterior e commit `db57f1b`).
  - Antes das alterações locais T038i/T038q/T038s, hashes SHA-256 do APK instalado/local e dos chunks PDF do APK/`dist/` coincidiam. Em 2026-10-06, com autorização explícita do usuário, `npx cap sync android`, `assembleDebug` e `adb install -r` passaram; o smoke acima usou esse APK novo.
  - T038q: importadores EPUB/PDF atrás de interface comum e capacidades do leitor implementados, com testes e gate EPUB verdes; a decisão de manter ou limitar o patch compartilhado de descarte de páginas aguarda a decisão de T038r (bug pré-existente de EPUB de layout fixo). Por isso T038q permanece aberta.
  - T038i: teste automatizado e smoke no APK novo verdes. T038s: teste automatizado e render real no Chromium verdes; ainda falta smoke específico de PDF com link interno no APK novo. T038s cobre a falha de renderização; clicar em anotações nativas interativas está fora do escopo da spec.
  - T038g (R-031): termo de reserva "Autor desconhecido" na busca do Google Books.
  - `PdfPageViewer` ainda não implementa TTS/tradução/Word Lens/highlights (fases 4–7): no PDF o botão de TTS existe mas não há parágrafos para ler.

---

## Phase 4: User Story 2 - Modo texto (reflow) (Priority: P2)

**Objetivo**: alternar para parágrafos refluídos no mesmo `EpubViewer`, com posição preservada e modo lembrado por livro.

**Independent Test**: `quickstart.md` § Modo texto + medição de SC-003 + § Regressão EPUB.

### Testes da Fase

- [X] T039 [P] [US2] Testes de `src/services/pdf/PdfTextBookBuilder.ts` em `src/__tests__/services/pdf/PdfTextBookBuilder.test.ts` (fixtures): seções por trecho, `<p>`/`<h1-h6>`, atributos de offset por parágrafo, placeholder de figura, fallback "como na página" para colunas incertas, `rendition.layout` reflowable
- [X] T040 [P] [US2] Testes de `src/services/pdf/PdfLocatorResolver.ts` em `src/__tests__/services/pdf/PdfLocatorResolver.test.ts`: localizador → Range no HTML sintético → localizador (round-trip), início/fim de trecho, parágrafo cruzando página
- [X] T041 [US2] Caso em `src/__tests__/components/EpubViewer.test.tsx`: com `openBook` passa o book recebido a `view.open`; **sem `openBook`, chama `BookFileResolver.resolveReaderSource` exatamente como antes** (todos os testes existentes do arquivo verdes sem alteração)
- [X] T042 [US2] Casos em `src/__tests__/screens/ReaderScreen.test.tsx`: alternância de modo preserva localizador; `pdfReadingMode` gravado e restaurado; PDF `pdfTextLayer: 'none'` não oferece modo texto
- [X] T043 [US2] E2E Chromium: `1col.pdf`, `2col.pdf`, `tabelas.pdf` em modo texto; medir SC-003 (quickstart § Medição) e SC-005
- [ ] T044 [US2] Gate EPUB completo (automatizado + checklist no device) — atenção especial ao `EpubViewer`, único arquivo EPUB tocado nesta fase

- [X] T045a [US2] **Primeira task da fase (R-011)** — casos em `src/__tests__/services/pdf/PdfTextBookBuilder.test.ts`: toda seção gerada tem `data-type="chapter"` na raiz e nenhum `data-pdf-bookmark`; o livro sintético não tem `transformTarget`, `entries` nem `resources`; cada href do `toc` sintético resolve por `splitTOCHref`/`resolveHref` do próprio livro para o índice de seção certo
- [X] T045b [US2] **Logo depois de T045a (R-011)** — caso em `src/__tests__/components/EpubViewer.test.tsx` abrindo um livro sintético mínimo via `openBook` com um trecho só com título + 1 linha curta: o trecho **não** é pulado pelo auto-skip de capítulo-stub, `registerUnmanifestedEpubStylesheets` e `installPassiveEpubContentTransform` não têm efeito, e o progresso pelo sumário usa o rótulo do trecho. Se algum desses falhar sem mudar o `EpubViewer` além de T046, **parar e reabrir o design (DI-003)**

### Implementation

- [X] T045 [US2] `src/services/pdf/PdfTextBookBuilder.ts`: livro sintético reflowable — uma seção por trecho, `load()` gera XHTML sob demanda via `PdfTextExtractor.reconstructChunk`, `createDocument()`, `size` estimado, `toc` dos trechos, CSS mínimo neutro (tema/fonte vêm do `buildReaderCSS` do viewer), placeholder de figura como `<img>` tocável cujo `src` é a página renderizada sob demanda (reusa `onOpenImage`/`ImageZoomModal`, FR-009), atributos `data-nr-pdf-*` com offsets; raiz de cada seção com `data-type="chapter"` e sem `transformTarget`/`entries`/`resources` no objeto book (R-011)
- [X] T046 [US2] `src/components/reader/EpubViewer.tsx`: **única mudança permitida (DI-003)** — prop opcional `openBook?: () => Promise<unknown>`; no setup, `const readerSource = openBook ? await openBook() : await BookFileResolver.resolveReaderSource(book)`. Nada mais neste arquivo
- [X] T047 [US2] `src/services/pdf/PdfLocatorResolver.ts`: localizador ↔ CFI do livro sintético (via atributos de offset) e localizador ↔ Range na camada de texto da página fiel
- [X] T048 [US2] `src/components/reader/PdfReadingModeToggle.tsx` (entregue como `PdfReadingModeControl` em `ReaderAppearanceControls.tsx`, no topo do painel de aparência — exportar os helpers de estilo para um arquivo à parte quebrava a regra de fast refresh do lint) no chrome do leitor (visível só em PDF com texto) e `src/screens/ReaderScreen.tsx`: em modo texto monta `EpubViewer` com `openBook` = builder, converte `savedCfi`/`bookmarks`/`highlights` de localizador → CFI antes de passar e payloads de CFI → localizador ao receber (`onRelocate`, `onBookmarkParagraph`, highlights); ao alternar, captura `getVisibleLocation()` e reabre no outro modo no mesmo localizador — o viewer é **remontado** com `key` por modo, porque o setup do `EpubViewer` só re-roda quando `book.id` muda (R-011); grava `pdfReadingMode` em `BookSettings`
- [X] T049 [P] [US2] Textos do toggle e do modo texto indisponível em `src/i18n/messages.ts`

**Critério de Conclusão**: em PDFs com texto, o modo texto mostra parágrafos limpos (SC-003 ≥ 95% registrado), respeita fonte/tema, alterna preservando a posição (SC-005), lembra o modo, trata figuras e colunas incertas, e o `EpubViewer` mudou só na prop `openBook` com toda a suíte e o checklist EPUB verdes.

**Registro da Fase**:

- Status: **Implementada e validada em Chromium (2026-10-06); falta só a parte de device do T044.** DI-003 confirmado: o `EpubViewer` mudou 9 linhas (prop `openBook`), e o livro sintético passou pelos passos pós-open do EPUB sem nenhum outro ajuste no viewer.
- Feito:
  - T045a/T045b primeiro (R-011): invariantes do livro sintético e livro mínimo dentro do `EpubViewer` real, com controle negativo (sem `data-type="chapter"` o trecho curto **é** pulado — o teste pega a regressão).
  - `PdfTextBookBuilder` (T045): uma seção XHTML por trecho, gerada sob demanda; `id` estável por bloco (`nrpdf-<pág>-<offset>`) + `data-nr-pdf-start`/`data-nr-pdf-ranges`; figura = recorte da página (`renderPdfPageRegionToBlob`, JPEG via `toDataURL`, R-034) com legenda; **página "como no original"** para página sem texto e para ordem de colunas incerta (`hasUncertainColumnOrder` em `pdfParagraphs.ts`: 3+ colunas); `getSectionDocument` só estrutural para conversão; `destroy` solta só as URLs (o PDF é da sessão, DI-008).
  - `PdfLocatorResolver` (T047): localizador ↔ CFI com o `epubcfi.js` do foliate; início de bloco gera exatamente o CFI que o viewer calcula para o parágrafo (marcador casa por `areCfisEquivalent`); CFI → localizador acha o bloco pelo `id` gravado no caminho, imune ao bloco de tradução e aos spans de Word Lens que o viewer injeta (R-045); dentro do bloco, offset proporcional (exato no início). Metade "página fiel" do T047 já existia em `pdfPageMapping.ts`.
  - `PdfTextModeViewer` (novo, parte do T048): envolve o `EpubViewer` e converte na borda (DI-006) posição inicial, marcadores, highlights, relocate (percentual pela página, como na página fiel), marcador de parágrafo, highlight (com o texto como dica), `goTo` por localizador e `getVisibleLocation` síncrono (última posição convertida). `openBook` cria livro novo a cada chamada (StrictMode monta duas vezes e o viewer destrói o book).
  - `ReaderScreen` (T048): modo por livro em `BookSettings.pdfReadingMode` via `useReaderAppearance.applyPdfReadingMode`; capacidade `viewer: 'pdf-text'`; ao alternar, a posição visível vira o ponto inicial do outro viewer (com prioridade sobre o `startHref` — bug achado ao escrever o E2E, coberto por teste); TTS em andamento é encerrado na troca; bloco do `EpubViewer` do EPUB intocado. T049: textos pt-BR/en/es.
- Testes executados:
  - Novos: `PdfTextBookBuilder` 13, `PdfLocatorResolver` 7, `pdfParagraphs` (colunas incertas) +9, `EpubViewer` (openBook/T045b) +6, `PdfTextModeViewer` 5, `ReaderScreen` modo texto +7. Iterações: o resolver casava o início do bloco seguinte com o fim do anterior (fim inclusivo) — corrigido com duas passadas; premissas de 2 testes sobre a fixture corrigidas a partir dos dados.
  - Gate: `npx tsc --noEmit -p tsconfig.app.json` OK · `npm run lint` OK · `npm test` **1467 passando + 2 skipped** (147 arquivos) · `npm run build` OK · `npm run test:debug-epubs` **71**.
  - **T043 E2E em Chromium** (`npx vite --port 5199 --strictPort` + harness `scripts/verificacao-visual/harness/e2e.html` + pacote `playwright` local, sandbox de produção), alternância pela interface real:
    - Corpus sintético (pág. 4): 1col, 2col, tabelas (8 figuras com imagem), misto (3 páginas-imagem), 1col-pt — troca para texto 485–734 ms, volta 432–453 ms, sem quebra física de linha, reabre em modo texto, **SC-005 em 100%** (mesma página ±1: o modo texto devolve o início do 1º parágrafo visível, como o EPUB). `escaneado.pdf`: opção Texto desabilitada com a explicação.
    - **SC-003 em 9 livros reais** (pág. 25, até 60 parágrafos por livro): Vida Organizada 100%, Trabalho Organizado 98,3%, O Milagre da Manhã 98%, Os Noturnos 100%, Storytelling 100%, Web Scraping 95%, GTD_Trello 95% — meta ≥ 95% atingida; troca 0,5–1 s.
    - Colunas incertas: **0 falsos positivos em 1.882 páginas** de 11 PDFs reais; páginas-imagem vistas são páginas sem texto (ex.: abertura de capítulo desenhada como curvas, Vida Organizada pág. 19).
    - Toque na figura abre o zoom de imagem (`onOpenImage`, FR-009). Screenshots conferidos: tema/fonte do leitor no modo texto, controle "Modo de leitura" no painel.
    - EPUB real (12 Regras para a Vida) abre no paginator de texto, sem controle de modo e sem erro de página. Erros de console da rodada: só Google Books 503 e Open Library 404 do enriquecimento de ficha no import.
- Pendências:
  - **T044 (device)**: checklist de regressão EPUB + modo texto no SM-S911B (celular desconectado nesta sessão). Atenção: o APK instalado é anterior ao 723b802 (R-044) e a toda a Fase 4.
  - Conversão CFI → localizador dentro de spans de Word Lens sem texto de dica cai no início do parágrafo (só o relocate do foliate, que é por parágrafo de qualquer forma).
  - Highlights criados no modo texto aparecem na página fiel só quando a pintura de highlights da página fiel existir (US5/T067).

---

## Phase 5: User Story 3 - Word Lens e tradução em PDF (Priority: P3)

**Objetivo**: Word Lens, vocabulário e tradução nos dois modos (inline no texto, balão na página fiel).

**Independent Test**: `quickstart.md` § Word Lens e tradução + § Regressão EPUB.

### Testes da Fase

- [X] T050 [P] [US3] Testes do `PdfPageViewer` em `src/__tests__/components/reader/PdfPageViewer.test.tsx` (entregues em `PdfPageViewer.contract.test.tsx`, que já tem o foliate falso, + `pdfPageWords.test.ts` para as funções puras): toque em palavra resolve a palavra certa (inclusive hifenizada entre linhas) e dispara `onWordLensDefinition`; toque em parágrafo dispara `onTranslate` com o texto reconstruído; `showTranslationLoading`/`injectTranslation`/`clearTranslation` e os métodos de Word Lens do contrato
- [X] T051 [US3] Casos em `src/__tests__/screens/ReaderScreen.test.tsx`: fluxo de tradução e salvar vocabulário com PDF nos dois modos usa o mesmo provedor/fallback do EPUB
- [ ] T052 [US3] E2E Chromium + device: `quickstart.md` § Word Lens e tradução — 2026-10-06: Chromium concluído (ver Registro); falta o device
- [ ] T053 [US3] Gate EPUB completo — 2026-10-06: parte automatizada verde; falta o checklist no device

### Implementation

- [X] T054 [US3] `src/components/reader/pdfPage/`: mapeamento toque → span da camada de texto → offset bruto → parágrafo/palavra (via `PdfLocatorResolver`); balão de ações do parágrafo ganha traduzir/Word Lens; balão de tradução e de definição renderizados **dentro do documento da página** (padrão do EPUB, overlays React não recebem toque no Android); sublinhado passivo de Word Lens e de vocabulário salvo (`vocabWords`) desenhado sobre a camada de texto
- [X] T055 [US3] `src/components/reader/PdfPageViewer.tsx`: implementar os métodos de tradução/Word Lens do `EpubViewerHandle` e ligar `onTranslate`, `onWordLensDefinition`, `onSaveVocab`, `onSpeakOne`
- [X] T056 [US3] Modo texto: validar que Word Lens/tradução inline do `EpubViewer` funcionam sobre o livro sintético sem mudança no `EpubViewer`; ajustes necessários vão no HTML gerado por `PdfTextBookBuilder.ts` (DI-003)

**Critério de Conclusão**: nos dois modos, tocar palavra abre Word Lens, salvar vocabulário grava frase sem quebras físicas, e traduzir parágrafo usa o mesmo provedor/fallback do EPUB (inline no modo texto, balão na página fiel); checklist EPUB sem diferença.

**Registro da Fase**:

- Status: **Implementada e validada em Chromium (2026-10-06); faltam só as partes de device (T052/T053).** `EpubViewer` sem nenhuma mudança nesta fase.
- Feito:
  - **Decisão de UX (R-047)**: na página fiel o toque traduz direto a frase tocada, como no EPUB, num painel dentro da página com definição do Word Lens (se a palavra estiver acima do nível), tradução, selo do provedor e as mesmas ações do bloco inline (Próxima, Ouvir, Marcar, Salvar) + Fechar. O balão intermediário "Marcar parágrafo" saiu (o marcador virou ação do painel); tocar de novo na frase ou fora do texto fecha.
  - `pdfPage/pdfPageWords.ts` (puro): palavra no offset bruto juntando o hífen de quebra entre linhas (tocando qualquer metade), ponte offset bruto → texto reconstruído (proporcional + ocorrência mais próxima da palavra), frase (`getSentenceAt`, igual ao EPUB), próxima frase, alvo de Word Lens (`classifyWordLensText` sobre o texto reconstruído).
  - `pdfPage/pdfPageTranslation.ts`: painel na `.textLayer` (redesenhado quando o pdf.js recria a camada — zoom/tema), destaque do parágrafo ativo, sublinhado passivo de vocabulário salvo; definição com o mesmo conteúdo do EPUB.
  - `PdfPageViewer` (T054/T055): offset exato do caractere tocado (caret), métodos `showTranslationLoading`/`injectTranslation`/`clearTranslation` e de Word Lens do contrato (respostas de seleção antiga descartadas), Word Lens passivo com o mesmo `scheduleWordLensDocument` do EPUB, props novas ligadas na `ReaderScreen` aos MESMOS handlers do EPUB (T051).
  - T056: no modo texto, Word Lens e tradução inline do `EpubViewer` funcionaram sobre o livro sintético — com uma correção no HTML gerado (R-048): o conteúdo passa por `loadContent()` → `srcdoc` (documento HTML, como os EPUBs); como XML o bloco de tradução quebrava.
- Testes executados:
  - Novos: `pdfPageWords` 9, `PdfPageViewer` US3 6 (+1 atualizado: marcador via painel), `ReaderScreen` US3 7 (provedor DeepL, erro e vocabulário nos dois modos), `PdfTextBookBuilder` +1 (regressão do documento HTML). Gate: `npx tsc --noEmit -p tsconfig.app.json` OK · `npm run lint` OK · `npm test` **1490 passando + 2 skipped** · `npm run build` OK · `npm run test:debug-epubs` **71**.
  - **E2E Chromium** (`npx vite --port 5199 --strictPort` + harness, Word Lens ligado no nível A2, `1col.pdf` pág. 4, tradução real pelo MyMemory): página fiel — 99 palavras sublinhadas, toque em "librarian" abre o painel com definição (WordNet) + tradução + 5 ações, "Salvar" grava no vocabulário (0 → 1); modo texto — 180 palavras sublinhadas, toque em "rearranged" abre o bloco inline do EPUB com a definição pelo lema "rearrange" e a tradução. 0 erros de página; EPUB real abre normal.
  - Iterações no E2E (3 bugs reais, todos corrigidos): documento XML no modo texto (R-048); CSS da camada de texto do pdf.js escondendo/escalando o painel e tirando do fluxo os spans de Word Lens (R-049); tamanho do painel calculado pela escala real até a tela, não só pelo `devicePixelRatio`.
- Pendências:
  - **Device (T052/T053)**: Word Lens/tradução nos dois modos e checklist EPUB no SM-S911B, com APK novo.
  - Limitações conhecidas: o sublinhado passivo na página fiel não pega palavra quebrada entre itens (hifenizada ou kerning) — o toque nela funciona, porque usa o texto reconstruído; vocabulário salvo só é sublinhado quando a expressão cabe numa linha; "Próxima" no fim do parágrafo só segue se o próximo parágrafo começa na mesma página.

---

## Phase 6: User Story 4 - TTS e audiobook em PDF (Priority: P3)

**Objetivo**: TTS (inclusive traduzido e em segundo plano) por parágrafo reconstruído nos dois modos.

**Independent Test**: `quickstart.md` § TTS + § Regressão EPUB.

### Testes da Fase

- [X] T057 [P] [US4] Testes do contrato de TTS do `PdfPageViewer` em `src/__tests__/components/reader/PdfPageViewer.contract.test.tsx`: `getParagraphs`, `getSentenceChunks` (mesmo formato `TtsChunk`), `getFirstVisibleParagraphIndex`, `highlightTts` em parágrafo que cruza página, `goToNextTtsSection` no último trecho
- [X] T058 [US4] Casos em `src/__tests__/hooks/useTTS.test.tsx` com viewer PDF mockado: leitura contínua entre trechos sem cortar frase na virada de página; **casos EPUB existentes intactos**
- [ ] T059 [US4] Device: `quickstart.md` § TTS (tela apagada, segundo plano, TTS traduzido) e SC-004 — 2026-10-07: por decisão do dono do produto, fica para a rodada de device do T079
- [ ] T060 [US4] Gate EPUB completo (TTS EPUB em segundo plano incluso) — 2026-10-07: parte automatizada verde (ver Registro); checklist no device (TTS do EPUB em segundo plano) no T079

### Implementation

- [X] T061 [US4] `src/components/reader/PdfPageViewer.tsx` + `src/components/reader/pdfPage/`: métodos de TTS do contrato (parágrafos do trecho ativo, chunks, destaque por retângulos derivados dos spans inclusive entre páginas, rolagem que respeita scroll manual, `onParagraphTapForTts`, `onTtsUserScrollAway`)
- [X] T062 [US4] Modo texto: confirmar TTS e TTS traduzido do `EpubViewer` sobre o livro sintético; cabeçalhos/rodapés/números de página nunca lidos (garantido pela reconstrução, ajustes só em `src/utils/pdfParagraphs.ts`)

**Critério de Conclusão**: TTS lê parágrafos inteiros sem pausa em quebras físicas nem viradas de página (SC-004), com destaque e acompanhamento nos dois modos, em segundo plano e traduzido; checklist EPUB sem diferença.

**Registro da Fase**:

- Status: **Implementada e validada em Chromium (2026-10-07); faltam só as partes de device (T059 e o checklist do T060), movidas para o T079 por decisão do dono do produto.** `EpubViewer` e `useTTS` sem nenhuma mudança nesta fase.
- Feito:
  - `pdfPage/pdfPageTts.ts` (novo): parágrafos do TTS = blocos reconstruídos com texto (figura fora); posição no texto do bloco ↔ texto bruto (inverso de `approximateBlockOffset`, com a fronteira entre páginas indo para a seguinte); palavra lida → posição exata na página certa, restrita aos intervalos do bloco; destaque do parágrafo nos spans da camada de texto (cor do tema, `palette.ttsHighlight`) e karaokê envolvendo só os caracteres da palavra, inclusive dentro de spans de Word Lens/vocabulário.
  - `PdfPageViewer` (T061): métodos de TTS do contrato. Seção = trecho (DI-009), com os parágrafos reconstruídos guardados para o acesso síncrono (trecho atual, o que está sendo lido e o próximo) e prontos antes do `onLoad`. Trecho de leitura fixado no `resetTtsScroll` (rolar não troca o que está sendo lido), como no EPUB. Destaque nas duas páginas de um parágrafo que cruza a virada e reaplicado quando a página é redesenhada (zoom/tema/carregamento). Acompanhamento centraliza o parágrafo sem pular para o topo da página carregada. Rolagem do usuário com o TTS ativo para de acompanhar e avisa uma vez (`onTtsUserScrollAway`), com janela de rolagem programática para navegação, salto de seção e zoom. `goToNextTtsSection` vai ao 1º parágrafo do próximo trecho e avisa `onSectionReady` (mesmo protocolo do EPUB); `false` no último. Com a leitura contínua ativa, tocar num parágrafo leva o TTS até ele (`onParagraphTapForTts`) em vez de traduzir.
  - `ReaderScreen`: o `PdfPageViewer` recebe `onSectionReady`, `onParagraphTapForTts`, `onTtsUserScrollAway` e `ttsGlobalActive` (os mesmos handlers do EPUB e do modo texto).
  - T062: no modo texto o TTS do `EpubViewer` funcionou sobre o livro sintético sem nenhum ajuste.
- Testes executados:
  - Novos: `pdfPageTts.test.ts` 8 (mapeamento + destaque/karaokê no DOM); `PdfPageViewer.contract.test.tsx` +8 de TTS (parágrafos, chunks no formato `TtsChunk`, destaque nas duas páginas e karaokê, reaplicar após redesenho, troca de trecho e último trecho, toque com TTS ativo, rolagem do usuário × programática) e 1 ajustado (o antigo exigia TTS vazio "até a US4"); `ReaderScreen.test.tsx` +5 (T058: callbacks de TTS na página fiel, leitura contínua entre trechos nos dois modos, último trecho termina, toque recomeça a leitura) — 3 falham com a `ReaderScreen` anterior (controle negativo).
  - **E2E Chromium** com a `ReaderScreen` e os viewers reais e um `speechSynthesis` falso instalado antes do app (versionado: `scripts/verificacao-visual/pdf-tts.check.js`, 7 critérios): página fiel `1col.pdf` 7/7 (107 frases, 0 com quebra/hífen, destaque nas págs. 2–9 sempre dentro da tela, 0 número de página e 0 cabeçalho corrido lidos, 5 seções atravessadas sozinho); página fiel `O Milagre Da Manhã.pdf` 7/7 (131 frases, Rosto → Créditos → Citações → … → Abertura); modo texto `1col.pdf` 7/7 (Chapter 1 → Chapter 2). Regressão das verificações anteriores no mesmo código: marcador 5/5, pinça 4/4, página fiel 6/6.
  - Gate: `npx tsc --noEmit -p tsconfig.app.json` OK · `npm run lint` OK · `npm test` **1512 passando + 2 skipped** · `npm run build` OK · `npm run test:debug-epubs` **71**.
- Pendências:
  - **Device (T079)**: T059 — TTS com tela apagada e em segundo plano, TTS traduzido e SC-004 no SM-S911B; T060 — TTS do EPUB em segundo plano sem diferença.
  - Limitações conhecidas: karaokê de palavra não aparece quando a palavra não é achada com segurança no texto bruto (hifenizada entre linhas): fica só o destaque do parágrafo. No navegador o plugin de TTS não emite fronteira de palavra, então o karaokê só foi verificado por teste (no device o nativo emite). TTS traduzido usa o mesmo contrato (`getParagraphs` + destaque de parágrafo), validado por teste, não no E2E (exige provedor de tradução real).

---

## Phase 7: User Story 5 - Highlights e notas em PDF (Priority: P3)

**Objetivo**: criar/editar/remover highlights com nota nos dois modos, visíveis nos dois e na lista de destaques.

**Independent Test**: `quickstart.md` § Highlights + § Regressão EPUB.

### Testes da Fase

- [X] T063 [P] [US5] Testes em `src/__tests__/components/reader/PdfPageViewer.test.tsx`: seleção na camada de texto gera `HighlightDraftPayload` com localizadores; seleção entre páginas; highlights existentes pintados; toque em highlight abre menu de gerenciar
- [X] T064 [US5] Casos em `src/__tests__/screens/ReaderScreen.test.tsx` e `src/__tests__/screens/BookDetailsScreen.test.tsx`: highlight criado num modo aparece no outro; lista de destaques de PDF navega para o ponto; highlights EPUB inalterados
- [ ] T065 [US5] E2E Chromium + device: `quickstart.md` § Highlights; SC-006 — 2026-10-07: Chromium concluído (`pdf-highlight.check.js` 6/6, ver Registro); device no T079
- [ ] T066 [US5] Gate EPUB completo — 2026-10-07: parte automatizada verde; checklist no device no T079

### Implementation

- [X] T067 [US5] `src/components/reader/pdfPage/`: menu de seleção e menu de gerenciar highlight dentro do documento da página (mesmas ações e mesma caixa unificada `HighlightComposerSheet` via `onRequestCreateHighlight`/`onEditHighlight`/`onDeleteHighlight`); pintura de highlights (fundo/sublinhado/ondulado) sobre a camada de texto, inclusive entre páginas
- [X] T068 [US5] Modo texto: highlights via `EpubViewer` com conversão localizador ↔ CFI em `src/screens/ReaderScreen.tsx` (T048); navegação a partir de `src/screens/BookDetailsScreen.tsx` abre o leitor no localizador (em qualquer modo)

**Critério de Conclusão**: highlights com cor/estilo/nota funcionam nos dois modos, aparecem nos dois (SC-006) e na lista de destaques, inclusive seleção entre páginas; checklist EPUB sem diferença.

**Registro da Fase**:

- Status: **Implementada e validada em Chromium (2026-10-07); faltam só as partes de device (T065/T066), no T079.** `EpubViewer` sem nenhuma mudança nesta fase.
- Feito:
  - `pdfPage/pdfPageHighlights.ts` (novo): seleção (nós do DOM) → intervalo no texto bruto da página, contando dentro de spans de Word Lens e tratando pontas entre itens; trecho do intervalo em cada página (vale para intervalo que atravessa páginas); pintura de fundo/sublinhado/ondulado só nos caracteres do intervalo, com indicador de nota no começo; menus de seleção (Copiar, Compartilhar, Traduzir, Destacar) e de gerenciar (nota + Editar destaque, Remover) DENTRO do documento da página.
  - `pdfPage/pdfPageTextMarks.ts` (novo): envolver/desembrulhar pedaços do texto dos itens — compartilhado pelo karaokê do TTS e pelos highlights (o texto do item não muda; a camada segue alinhada).
  - `PdfPageViewer` (T067): menu de seleção acompanha a seleção nativa e some com atraso; a seleção fica guardada porque no Android o toque no botão desfaz a seleção antes do clique (mesmo achado do EPUB). "Destacar" entrega o mesmo `HighlightDraftPayload` do EPUB, com `cfi` = intervalo `neopdf` e `paraCfi` = início do parágrafo → a caixa unificada da ReaderScreen. Toque num highlight abre o menu de gerenciar (com leitura contínua ativa, o toque segue para o TTS, como no EPUB). Repinta ao mudar a lista e quando a página é redesenhada. **Só pinta texto de parágrafo** (R-055): cabeçalho corrido, número de página e rodapé ficam de fora mesmo dentro do intervalo.
  - `ReaderScreen`: o `PdfPageViewer` recebe `highlights` e os mesmos handlers de criar/editar/remover do EPUB e do modo texto.
  - T068 / modo texto: já vinha da Fase 4 (conversão localizador ↔ CFI); o E2E achou o fim do intervalo gravado 1 caractere fora (conversão proporcional, R-054) → `snapRangeToText` ajusta o intervalo ao texto bruto da página pelo texto selecionado. Lista de destaques dos Detalhes já abria o leitor no localizador (teste novo).
  - Seleção atravessando páginas na página fiel: impossível pelo navegador (cada página é um iframe) — R-053. O highlight que cruza a virada, criado no modo texto, aparece nas duas páginas.
- Testes executados:
  - Novos: `pdfPageHighlights.test.ts` 5; `PdfPageViewer.contract.test.tsx` +7 (pintura com estilos e nota, intervalo entre páginas, cabeçalho fora, repintura, menu de gerenciar com editar/remover, seleção → rascunho com a seleção guardada no estilo Android, traduzir seleção, TTS com prioridade); `ReaderScreen.test.tsx` +3 (highlights nos dois modos; rascunho da página fiel → caixa → `addHighlight` com o localizador) — 2 falham com a ReaderScreen anterior; `BookDetailsScreen.test.tsx` +1 (destaque de PDF na lista abre o leitor no localizador); `PdfLocatorResolver.test.ts` +3 (`snapRangeToText`, incluindo o caso real do E2E).
  - **E2E Chromium** (`scripts/verificacao-visual/pdf-highlight.check.js`, `1col.pdf`): A. página fiel cria e pinta; B. aparece no modo texto (overlay na cor gravada); C. modo texto cria com localizador exato; D. aparece na página fiel; E. intervalo atravessando a virada pintado nas duas páginas, sem o cabeçalho — **6/6**. Iterações: 2 bugs reais (R-054 fim do intervalo do modo texto; R-055 cabeçalho pintado) e 3 ajustes da própria verificação (cor padrão, parágrafo fora da tela, clique sintético sem coordenadas).
  - Regressão: TTS 7/7, marcador 5/5, pinça 4/4, página fiel 6/6.
  - Gate: `npx tsc --noEmit -p tsconfig.app.json` OK · `npm run lint` OK · `npm test` **1531 passando + 2 skipped** · `npm run build` OK · `npm run test:debug-epubs` **71**.
- Pendências:
  - **Device (T079)**: seleção por toque longo na página fiel no Android (menu próprio com o menu nativo suprimido), criar/editar/remover nos dois modos e checklist EPUB.
  - Limitação: seleção que atravessa páginas só no modo texto (R-053).

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
- [ ] T079 Rodar `quickstart.md` inteiro no device e registrar SC-001..SC-009 — inclui o que restou do T026: SC-001 no corpus completo, import/capa nativa de 20 PDFs (comparar com a capa do `PdfRenderer`), smoke de PDF com link interno (T038s) no APK; e o import de EPUB com capa > 2000 px depois do T038l; marcador de PDF abrindo no parágrafo marcado, inclusive voltando a uma página distante (T038v); TTS de PDF nos dois modos com tela apagada, em segundo plano e traduzido + SC-004 (T059) e TTS do EPUB em segundo plano sem diferença (parte de device do T060); highlights nos dois modos com seleção por toque longo na página fiel (T065) e checklist EPUB (T066)
- [ ] T080 Atualizar `docs/features/` com um resumo do suporte a PDF (arquitetura em 1 página, referenciando esta spec)

### Checklist de Release

- [X] Fase 1 (Setup) concluída
- [X] Fase 2 (Foundational) concluída
- [X] Fase 3 (US1 — import + página fiel) concluída
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
