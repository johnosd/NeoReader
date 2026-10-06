# Implementation Plan: Suporte a PDF com paridade de recursos do EPUB

**Slug**: `022-suporte-pdf-paridade` | **Date**: 2026-09-23 | **Spec**: `sdd/specs/022-suporte-pdf-paridade/spec.md`

**Nota**: Este template é preenchido pelo skill `sdd-plan`; a definição do skill
descreve o fluxo de execução completo.

## Summary

Adicionar PDF como segundo formato de livro, com dois modos de leitura —
**página fiel** (página original, scroll contínuo, zoom) e **modo texto**
(parágrafos reconstruídos e refluídos) — e paridade dos recursos do EPUB
(Word Lens, tradução, TTS, highlights/notas, marcadores + sync).

Abordagem técnica, em uma frase por peça:

- **Abrir o PDF**: construtor de "book" próprio (`PdfBookFactory`), adaptado do
  `foliate-js/pdf.js` (MIT) e usando o pdf.js 4.7.76 já vendorizado — sem
  dependência nova. Um único documento pdf.js por livro aberto, compartilhado
  pelos dois modos.
- **Modo texto**: gera um *livro sintético reflowable* (seções HTML com `<p>`/
  `<h*>` reconstruídos) e o abre no **mesmo `EpubViewer`** — Word Lens,
  tradução inline, TTS, highlights e marcadores de parágrafo passam a funcionar
  sem reescrever essa lógica.
- **Página fiel**: componente novo `PdfPageViewer` sobre o renderer de layout
  fixo do foliate (`foliate-fxl`, `flow="scrolled"`), implementando o mesmo
  contrato `EpubViewerHandle` — `ReaderScreen`, `useTTS` e
  `useTranslatedAudiobook` o dirigem sem mudar.
- **Posição independente de modo**: localizador próprio (`neopdf:`) gravado nos
  campos de string que já existem (`cfi`/`paraCfi`) — sem mudar schema Dexie nem
  formato do Drive.
- **Reconstrução de parágrafos**: função pura, testável sem DOM, implementada
  do zero (o Readest é AGPL — só referência conceitual).

**Proteção do EPUB (pedido explícito do usuário)**: toda ramificação por formato
é explícita (`book.format === 'PDF'`), o caminho EPUB é o default e não muda de
comportamento, e cada fase tem um gate de regressão EPUB (ver Decisões
Invariantes DI-001/DI-002 e Estratégia de Testes).

## Technical Context

**Language/Version**: TypeScript ~5 (strict) + React 19; Java (plugin nativo Android, `minSdk` do projeto — `PdfRenderer` existe desde API 21).

**Primary Dependencies**: `foliate-js` (fork `readest`, commit `92582ce`, MIT) — `view.js`, `fixed-layout.js` (modo `flow="scrolled"` com páginas virtualizadas, máx. 8 carregadas; `scale-factor`; `pageColors`), `paginator.js`; pdf.js **4.7.76** vendorizado em `node_modules/foliate-js/vendor/pdfjs/` (`getTextContent`, `TextLayer`, `PDFDataRangeTransport`); Dexie; Zustand; Capacitor 8. **Nenhuma dependência nova.**

**Storage**: Dexie `NeoReaderDB` já em **v19** (o `CLAUDE.md` ainda diz v16 — desatualizado). `books.format` já é indexado. Todos os campos novos são **não indexados** → **nenhuma nova `version()`** (mesmo precedente de `Highlight.style`/`note`, features 010/013). Arquivo do livro: `embedded` (Blob no IndexedDB, web), `local` (cópia no app via plugin Android, lida por `Capacitor.convertFileSrc`), `external` (URI).

**Testing**: Vitest + Testing Library + jsdom (`npm test`); corpus EPUB real opcional (`npm run test:debug-epubs`, lê `debug-books/*.epub`); validação em Chromium real via Playwright MCP (padrão já usado no projeto); validação final em device Android (RXCX103NMVZ).

**Target Platform**: Android (Capacitor WebView/Chromium) e Web (Chromium). Safari/iOS fora de escopo.

**Performance Goals**: primeira página visível ≤ 3 s para PDF de até 1000 páginas / 200 MB num Android intermediário; 30 min de leitura contínua sem encerramento por memória (SC-002); o projeto já teve alerta de memória no Play Console — memória é restrição de primeira classe.

**Constraints**: sandbox dos iframes do foliate sem `allow-scripts` (`vite.config.ts` → `hardenFoliateIframeSandbox`, já cobre `fixed-layout.js`); pdf.js com `isEvalSupported: false`; assets do pdf.js hoje só copiados no **build** (`copyFoliatePdfjsAssets`, `apply: 'build'`) → em `npm run dev` o worker daria 404; overlays React sobre o iframe **não recebem toques** de forma confiável no Android WebView (memória do projeto) → menus/ações de leitura vivem dentro do documento do iframe, como no EPUB.

**Scale/Scope**: single-user local-first; PDFs até 1000 páginas / 200 MB como teto de garantia.

## Decisões Invariantes

- **DI-001 — EPUB intocado por comportamento**: todo código novo de PDF vive em arquivos novos. Arquivos compartilhados só ganham ramificações explícitas por formato com **EPUB como default** (`format ?? 'EPUB'`). Nenhuma função do caminho EPUB é renomeada, reordenada ou "generalizada" nesta feature. Nomes históricos como `prepareLocalEpubImport`/`selectEpubFile` são mantidos (com comentário de que também tratam PDF).
- **DI-002 — Gate de regressão EPUB em toda fase**: nenhuma fase fecha sem `npm run lint`, `npm test`, `npm run build` e `npm run test:debug-epubs` verdes + o checklist de regressão EPUB do `quickstart.md` (§ Regressão EPUB) executado no device a partir da Fase 3.
- **DI-003 — `EpubViewer.tsx` só recebe uma mudança**: uma prop opcional de fonte do livro (`openBook?`); ausente, o código roda exatamente como hoje. Qualquer outra necessidade do modo texto é resolvida no livro sintético (HTML gerado), não dentro do `EpubViewer`. Se isso se provar impossível durante o execute, **parar e reabrir o design** — não "só mais um if". Os passos que o `EpubViewer` roda depois de abrir o livro foram auditados contra o livro sintético (R-011): `registerUnmanifestedEpubStylesheets` (sai com 0 sem `entries`/`resources`) e `installPassiveEpubContentTransform` (no-op sem `transformTarget`) são inofensivos desde que o livro sintético **não** tenha esses campos; o pulo automático de capítulo-stub (`isChapterStubSection`) é neutralizado **no HTML gerado** (toda seção sintética leva `data-type="chapter"` na raiz e nunca `data-pdf-bookmark`); hrefs do sumário sintético precisam resolver pelo `splitTOCHref` do próprio livro sintético. E como o setup do `EpubViewer` só roda de novo quando `book.id` muda, a alternância de modo **remonta** o componente (`key` por modo) em vez de trocar a prop `openBook`.
- **DI-004 — Página fiel é componente separado** (`PdfPageViewer`), que implementa o contrato `EpubViewerHandle` (ver `contracts/reader-viewer-handle.md`). Não se enfia o renderer de layout fixo dentro do `EpubViewer`.
- **DI-005 — Localizador PDF independente de modo e de heurística**: posição = `(índice da página, offset de caractere no texto bruto da página)`, onde o "texto bruto" é a concatenação dos itens de `page.getTextContent()` na ordem do pdf.js, com a regra de normalização versionada (`PDF_LOCATOR_VERSION = 1`). O localizador **não depende** da reconstrução de parágrafos — melhorar a heurística depois nunca invalida progresso, marcadores ou highlights salvos. Formato em `data-model.md`.
- **DI-006 — Localizador guardado nos campos de string existentes**: para livros PDF, `ReadingProgress.cfi`, `Bookmark.cfi`, `Highlight.cfi`/`paraCfi` guardam strings `neopdf:`. Sem schema novo, sem mudança no formato do Drive (a `syncKey` já cai no fallback de string crua em `createBookmarkSyncKey`). Conversão localizador ↔ CFI do modo atual acontece só na borda do viewer PDF.
- **DI-007 — Reconstrução de parágrafos é função pura** sobre itens de texto do pdf.js (sem DOM, sem pdf.js importado), em `src/utils/pdfParagraphs.ts`, testável com fixtures JSON. Implementação independente — **nenhum código do Readest (AGPL-3.0)**.
- **DI-008 — Um único `PDFDocumentProxy` por livro aberto**, criado pelo `PdfBookFactory` e compartilhado por página fiel, modo texto e extração de texto; destruído no `book.destroy()`. Nunca abrir o mesmo PDF duas vezes em paralelo.
- **DI-009 — Mesma divisão em trechos nos dois modos**: o livro é dividido em *trechos* (capítulos do sumário quando houver; senão blocos de 20 páginas). Um trecho = uma seção do livro sintético (modo texto) = unidade de "seção" do TTS/`goToNextTtsSection` na página fiel. Parágrafo que atravessa página pertence à página onde começa.
- **DI-010 — Sem OCR, sem escrita no arquivo PDF, sem PDF com senha/DRM, sem dependência nova** (spec, Fora de Escopo).
- **DI-011 — Formato detectado pelo conteúdo** (`%PDF-` / ZIP+mimetype EPUB) em `src/utils/bookFormat.ts`; extensão só serve para listar candidatos no picker/pasta.
- **DI-012 — Idioma do PDF (A3)**: ordem de resolução = `BookSettings.bookLanguage` (manual, como hoje) → idioma dos metadados do PDF (`dc:language`/`Lang` do catálogo) → idioma **detectado no import** a partir do texto de páginas amostradas → **indefinido**. Detecção por frequência de palavras funcionais (stopwords) sobre os idiomas de `src/utils/languageOptions.ts`, função pura em `src/utils/textLanguage.ts`, sem dependência nova; só aceita resultado com margem de confiança mínima (constante nomeada), senão fica indefinido. O resultado (metadados ou detecção) é gravado em `Book.detectedLanguage` (não indexado). Indefinido **não** vira `'en'` em silêncio no PDF: usa o estado "idioma não definido" que a tela de Detalhes já tem (`bookLanguageUndefined`, que desliga o TTS traduzido) e o leitor mostra **uma vez por livro** um aviso não bloqueante com atalho para escolher o idioma. Para EPUB nada muda (`bs.bookLanguage ?? extras.language` continua igual).
- **DI-013 — Enriquecimento de ficha do PDF (A2)**: provedor novo `PdfBookInfoProvider` (`source: 'pdf-metadata'`) no lugar do `EpubBookInfoProvider` quando `book.format === 'PDF'`, nos três pontos que montam a lista de provedores (`BookInfoRefreshService`, `useBookInfo`, default de `BookInfoService`) e no salvamento de ficha no import (`BookImportService`, hoje fixo em `'epub-metadata'`). Ele fornece `lookupHints` (título/autor dos metadados do PDF) e **ISBN encontrado no texto** das primeiras 10 e últimas 3 páginas (página de copyright), validado por dígito verificador em `src/utils/isbn.ts` — isso destrava o Open Library, que só busca por ISBN. Google Books, Open Library e YouTube seguem iguais. Para EPUB a lista de provedores não muda.

## Constitution Check

*GATE: deve passar antes da Fase 0. Reavaliado após o design da Fase 1.*

| Princípio | Pré-Design | Pós-Design | Notas |
| --- | --- | --- | --- |
| I. Plano antes de feature grande | ✅ | ✅ | Este plano + tasks.md são o plano de arquivos a aprovar antes do `sdd-execute`. Escopo ambíguo remanescente virou item de `research.md`, não suposição. |
| II. Comentários só onde o "porquê" não é óbvio | ✅ | ✅ | Pontos que exigem comentário já listados: localizador independente de heurística (DI-005), atribuição MIT no `PdfBookFactory`, nomes históricos `*Epub*` que tratam PDF, heurísticas numéricas da reconstrução. |
| III. Explícito antes de mágico | ✅ | ⚠️ justificado | Não se cria abstração genérica "BookFormatAdapter"; ramificações são `if (format === 'PDF')` explícitas. **Porém** o `PdfPageViewer` implementa a interface `EpubViewerHandle` (uma abstração implícita de "viewer"). Justificado em Complexity Tracking. |
| IV. Build limpo é a definição de "pronto" | ✅ | ✅ | `npm run build` em todo checkpoint (DI-002). Atenção: `npx tsc --noEmit` sozinho é no-op neste repo — usar `-p tsconfig.app.json` se precisar checar tipos isoladamente. |
| V. Dependências novas exigem justificativa | ✅ | ✅ | Zero dependências novas: pdf.js já vendorizado no foliate-js; `PdfRenderer` é API do Android. |
| Restrição: schema append-only | ✅ | ✅ | Nenhuma `version()` nova (campos não indexados). Se o execute precisar indexar algo, adicionar `version(20)` — nunca editar a 19. |
| Restrição: cuidado com o iframe do EPUB | ✅ | ✅ | Sandbox sem `allow-scripts` mantido nos dois renderers; o pdf.js desenha a partir do contexto pai (confirmado em `foliate-js/pdf.js`), então não precisa de script no iframe. |
| Fluxo: testar UI em browser/device real | ✅ | ✅ | Playwright MCP em Chromium por fase + device a partir da Fase 3 (quickstart). |

## Project Structure

### Documentation (this feature)

```text
sdd/specs/022-suporte-pdf-paridade/
├── spec.md
├── plan.md               # Este arquivo
├── research.md           # Incertezas técnicas a fechar no começo do execute
├── data-model.md         # Book/BookSettings/localizador/OPDS
├── quickstart.md         # Verificação manual + checklist de regressão EPUB
├── contracts/
│   ├── reader-viewer-handle.md      # Contrato EpubViewerHandle que o PdfPageViewer implementa
│   └── native-library-plugin.md     # Mudanças no plugin Android (import de PDF)
└── tasks.md
```

### Source Code (repository root)

```text
src/
├── components/
│   ├── AddBookButton.tsx                  # accept += .pdf
│   └── reader/
│       ├── EpubViewer.tsx                 # SÓ prop opcional openBook (DI-003)
│       ├── PdfPageViewer.tsx              # NOVO — página fiel (DI-004)
│       ├── PdfTextLayerNotice.tsx         # NOVO — aviso de PDF/página sem texto
│       ├── PdfReadingModeToggle.tsx       # NOVO — alternar página fiel ↔ modo texto
│       └── pdfPage/                       # NOVO — helpers do PdfPageViewer (menus no iframe, overlay, gestos)
├── screens/
│   ├── ReaderScreen.tsx                   # escolhe viewer por formato/modo; converte localizador
│   ├── HomeScreen.tsx / LibraryScreen.tsx # accept/regex de arquivo += .pdf
│   └── BookDetailsScreen.tsx              # guarda EpubService.parseExtras para PDF
├── hooks/
│   ├── usePdfReaderSession.ts             # NOVO — abre/destroi o book PDF, modo, trechos
│   ├── useBookInfo.ts                     # lista de provedores por formato (DI-013)
│   └── useReaderAppearance.ts             # guarda parseExtras e idioma do PDF (DI-012)
├── services/
│   ├── pdf/                               # NOVO
│   │   ├── PdfBookFactory.ts              # book pdf.js próprio (adaptado de foliate-js/pdf.js, MIT)
│   │   ├── PdfService.ts                  # metadados, capa, detecção de camada de texto (import)
│   │   ├── PdfTextExtractor.ts            # texto bruto por página + cache LRU
│   │   ├── PdfTextBookBuilder.ts          # livro sintético reflowable (modo texto)
│   │   └── PdfLocatorResolver.ts          # localizador ↔ CFI/Range em cada modo
│   ├── BookImportService.ts               # despacho por formato na leitura de metadados
│   ├── BookFileResolver.ts                # MIME/nome por formato
│   ├── NativeLibraryImportService.ts      # MIME do File por formato
│   ├── bookInfo/
│   │   ├── PdfBookInfoProvider.ts         # NOVO — ficha de PDF (DI-013)
│   │   ├── BookInfoRefreshService.ts      # lista de provedores por formato
│   │   └── BookInfoService.ts             # idem (default)
│   └── opds/                              # parsers aceitam PDF; download por formato
├── utils/
│   ├── bookFormat.ts                      # NOVO — detecção por magic bytes (DI-011)
│   ├── pdfLocator.ts                      # NOVO — formato/parse/compare do localizador (DI-005)
│   ├── pdfParagraphs.ts                   # NOVO — reconstrução pura (DI-007)
│   ├── pdfChunks.ts                       # NOVO — divisão em trechos (DI-009)
│   ├── textLanguage.ts                    # NOVO — detecção de idioma por stopwords (DI-012)
│   └── isbn.ts                            # NOVO — achar/validar ISBN em texto (DI-013)
├── types/book.ts                          # BookFormat += 'PDF'; campos PDF não indexados
├── i18n/messages.ts                       # textos novos (pt-BR/en/es)
└── __tests__/                             # espelha src/ (utils/, services/pdf/, components/reader/...)

android/app/src/main/
├── AndroidManifest.xml                    # intent-filter += application/pdf
└── java/com/johnny/neoreader/
    ├── NeoReaderLibraryPlugin.java        # picker/pasta/cópia aceitam PDF; capa via PdfRenderer
    └── ExternalEpubIntentStore.java       # aceita application/pdf

vite.config.ts                             # servir /vendor/pdfjs também no dev server
debug-books/pdf/                           # corpus PDF local (não versionado), análogo ao corpus EPUB
```

**Structure Decision**: projeto único (SPA React + Capacitor Android). O PDF entra como módulos novos em `src/services/pdf/`, `src/utils/pdf*.ts` e `src/components/reader/Pdf*`, com pontos de contato mínimos e explícitos nos arquivos compartilhados listados acima. O corpus PDF fica em `debug-books/pdf/` porque o teste de corpus EPUB (`realEpubCorpus.test.ts:48-52`) já filtra só `*.epub` da raiz de `debug-books/` — PDFs ali não interferem.

## Complexity Tracking

| Violação | Por que é necessária | Alternativa mais simples rejeitada porque |
| --- | --- | --- |
| `PdfPageViewer` implementa `EpubViewerHandle` (abstração implícita de "viewer" com dois implementadores) | `ReaderScreen`, `useTTS` e `useTranslatedAudiobook` já falam com o viewer por esse handle (~20 chamadas `viewerRef.current?.*`). Reusar o contrato mantém TTS, tradução e navegação sem mudança no caminho EPUB. | (a) Enfiar a página fiel dentro do `EpubViewer` (4.4k linhas acopladas ao paginator reflowable: zonas de toque por seção, fim de capítulo, scroll por seção) é o maior risco de regressão EPUB — viola DI-001. (b) Duplicar a orquestração de TTS/tradução no `ReaderScreen` por formato duplicaria centenas de linhas e divergiria com o tempo. |
| Menus de seleção/highlight da página fiel duplicam o padrão de HTML-no-iframe do `EpubViewer` | Os geradores de HTML dos menus são closures dentro do componente `EpubViewer` (linhas ~2669/2727), não funções de módulo; extraí-los mexe no arquivo que o usuário pediu para proteger. Overlays React não recebem toque de forma confiável sobre o iframe no Android. | Extrair os geradores para um módulo compartilhado: refactor em código EPUB sensível sem ganho funcional para o EPUB. Fica como candidato a refactor futuro, fora desta feature. |

## Estratégia de Testes

Prioridade: unitário → contrato/integração → E2E → manual (último recurso).

- **Unitário (jsdom, sem pdf.js real)**: `pdfParagraphs` (linhas, colunas, gap de parágrafo, recuo, mudança de fonte, cabeçalho/rodapé repetido, dehifenização, parágrafo atravessando página) com **fixtures JSON** de itens de texto extraídos de PDFs reais; `pdfLocator` (format/parse/compare/ordenar/round-trip); `pdfChunks`; `bookFormat` (magic bytes EPUB/PDF/lixo); `PdfTextBookBuilder` (HTML gerado a partir de fixtures: tags, atributos de offset, placeholders de figura); `PdfLocatorResolver` (localizador ↔ Range no HTML sintético e na camada de texto simulada).
- **Integração (jsdom, pdf.js mockado)**: `BookImportService` (web e nativo) com PDF → Book `format: 'PDF'`, duplicado, senha/corrompido recusado; parsers OPDS com entradas só-PDF/mistas; `ReaderScreen` escolhendo viewer por formato/modo e **continuando a montar `EpubViewer` idêntico para EPUB**; `PdfPageViewer` cumprindo o contrato do handle.
- **Regressão EPUB (obrigatória, DI-002)**: suíte existente inteira (inclui `EpubViewer.test.tsx`, `ReaderScreen.test.tsx`, `BookImportService*.test.ts`, `useTTS.test.tsx`, OPDS) + `npm run test:debug-epubs` + checklist manual do `quickstart.md`.
- **E2E em Chromium (Playwright MCP)**: fluxo completo por fase num único `browser_run_code_unsafe` (padrão do projeto), com PDFs do corpus: importar, abrir, rolar, zoom, alternar modo, traduzir, TTS, highlight.
- **Device Android**: import pelos 3 caminhos, memória/tempo de abertura com PDF grande (SC-002), TTS em segundo plano, sync de marcadores.
- **Corpus PDF** (`debug-books/pdf/`, local, não versionado): nascidos digitais 1 coluna, 2 colunas, com tabelas/figuras, escaneado, misto, grande (~1000 p.), protegido por senha, corrompido. Script de extração de fixtures gera os JSON versionados em `src/__tests__/fixtures/pdf/`.

Comandos-base:

```powershell
npm run lint
npm test
npm run build
npm run test:debug-epubs
npx vitest run src/__tests__/utils/pdfParagraphs.test.ts
npx tsc --noEmit -p tsconfig.app.json
npm run android:run
```

## Estado Atual

<!-- Sobrescrita a cada checkpoint pelo sdd-execute. Vazia na criação. -->

| Área | Estado |
| --- | --- |
| Fase 1 — Setup | Concluída (2026-10-05) |
| Fase 2 — Foundational | Concluída (2026-10-05) |
| Fase 3 — US1 (import + página fiel) | Implementada e validada em Chromium **com o sandbox de produção** (T025, T038a–T038f); pendentes T038g (R-031) e **device** (T026 spikes + T027 regressão EPUB — reinstalar o APK, o instalado é anterior ao R-030) |
| Fase 4 — US2 (modo texto) | Não iniciada |
| Fases 5–9 | Não iniciadas |
| Código de app para PDF | Import (web + Android), `PdfService`, ficha (`PdfBookInfoProvider`), idioma, `usePdfReaderSession`, `PdfPageViewer` (página fiel), avisos, `ReaderScreen` por formato, plugin Java. Tradução/Word Lens/TTS/highlights/modo texto/OPDS ainda não |
| Regressão EPUB | 1381 testes passando + 2 skipped (base 1094 inalterada) · corpus EPUB 71 · lint/build ok · chunk `paginator` do build idêntico · EPUB conferido no dev (import, abrir, rolar, CFI, tradução inline). Checklist no device pendente |

## Riscos e Decisões

<!--
  IDs estáveis (R-001, R-002...), nunca deletados. Item resolvido ganha
  prefixo "Resolvido:" na célula de Mitigação em vez de sumir da tabela.
-->

| ID | Risco/Decisão | Impacto | Mitigação/Encaminhamento |
| --- | --- | --- | --- |
| R-001 | Regressão na leitura de EPUB (pedido explícito do usuário) | Alto — é o produto que já funciona | DI-001..DI-004 + gate DI-002 por fase; `EpubViewer` só ganha prop opcional; teste explícito "ReaderScreen monta EpubViewer igual para EPUB". |
| R-002 | Licença: Readest é AGPL-3.0; foliate-js é MIT | Alto (jurídico) | Nenhum código do Readest; `PdfBookFactory` adaptado do foliate-js com cabeçalho de atribuição MIT. Revisão no Checklist de Release. |
| R-003 | Qualidade da reconstrução de parágrafos (multi-coluna, tabelas, cabeçalhos) | Alto — é o diferencial | Função pura com fixtures de PDFs reais; SC-003 medido no corpus; fallback de trecho "como na página" quando a ordem de colunas é incerta (spec, Edge Cases). |
| R-004 | Memória/tempo com PDF grande (arquivo `local` chega como URL e o foliate faria `fetch` → Blob inteiro) | Alto — já houve alerta de memória no Play Console | research.md §1: preferir leitura por faixas (pdf.js `PDFDataRangeTransport` sobre Blob, ou range HTTP no servidor local do Capacitor). Medir SC-002 no device na Fase 3. |
| R-005 | Pinça/zoom e pan horizontal no modo scroll do layout fixo (`:host([flow="scrolled"])` tem `overflow-x: hidden`) no Android WebView | Médio | research.md §2: gesto tratado nos documentos das páginas (mesmo origin) aplicando `scale-factor`; `overflow-x` sobrescrito por estilo inline no host. Spike no início da Fase 3. |
| R-006 | Assets do pdf.js ausentes no dev server (`copyFoliatePdfjsAssets` só em build) | Médio — bloqueia teste em Chromium via `npm run dev` | Resolvido: plugin `serveFoliatePdfjsAssets` (T002/T005) em `vite.config.ts`; build com `dist/vendor/pdfjs` idêntico ao baseline. |
| R-007 | Conversão localizador ↔ CFI no modo texto é assíncrona e depende do HTML sintético | Médio | `PdfLocatorResolver` usa atributos de offset gravados no HTML gerado; round-trip coberto por teste unitário. |
| R-008 | pdf.js real não roda de forma confiável em jsdom (worker, canvas) | Médio — cobertura automatizada | Lógica de valor fica em funções puras (fixtures); pdf.js mockado nos testes de integração; validação real em Chromium/device. research.md §4. |
| R-009 | Muitos PDFs com texto "quebrado" (fontes sem ToUnicode) parecem ter texto mas geram lixo | Médio | Detecção de camada de texto considera proporção de caracteres imprimíveis/válidos, não só presença de itens; esses caem no aviso de FR-014. |
| R-010 | `CLAUDE.md` diz schema v16; real é v19 | Baixo | Registrado aqui; corrigir o `CLAUDE.md` na fase de Polish. |
| R-011 | Passos pós-open do `EpubViewer` pensados para EPUB rodando no livro sintético (Analyze A1): pulo automático de capítulo-stub (`isChapterStubSection`, até 4 seções) sumiria trechos curtos; progresso pelo sumário depende de hrefs; setup só re-roda quando `book.id` muda | Médio — trecho pulado ou modo que não troca | Mitigado no HTML gerado e no `ReaderScreen`, sem tocar o `EpubViewer` (ver DI-003): `data-type="chapter"` em toda seção, sem `data-pdf-bookmark`, sem `transformTarget`/`entries`/`resources`, hrefs sintéticos resolvidos pelo próprio livro, `key` por modo. Validado por T045a/T045b no início da Fase 4; se falhar, reabrir o design. |
| R-012 | PDF raramente traz idioma nos metadados; Word Lens, tradução e TTS dependem dele (Analyze A3) | Médio — tradução/TTS no idioma errado em silêncio | DI-012: metadados → detecção por stopwords no import → indefinido com aviso único; nunca `'en'` silencioso para PDF. |
| R-013 | Ficha de PDF sem enriquecimento: provedor local só lê EPUB e Open Library exige ISBN (Analyze A2) | Baixo/Médio — ficha pobre em PDF | DI-013: `PdfBookInfoProvider` com ISBN extraído do texto; falha em achar ISBN é aceitável (Google Books ainda busca por título/autor). |
| R-014 | Corpus PDF é sintético (Chromium/Skia como único produtor): a heurística pode passar nele e falhar em PDFs de LaTeX/InDesign/Word (itens de texto agrupados de outro jeito) | Médio — SC-003 medido num corpus otimista | T015 deve incluir 2–3 PDFs reais do usuário em `debug-books/pdf/`; a extração de fixtures (`scripts/extract-pdf-text-fixtures.mjs`) funciona com qualquer PDF, mas só versionar fixture cujo texto possa ser versionado. |
| R-015 | A heurística de parágrafos foi calibrada em 11 livros reais (T015) e tem limites conhecidos: bloco de código (1 linha = 1 parágrafo), subtítulo em negrito do mesmo tamanho colado ao parágrafo, letras espaçadas, nota de rodapé como bloco solto, rótulo de figura/fórmula como parágrafo curto | Baixo/Médio — qualidade do modo texto, TTS e tradução em livros técnicos/acadêmicos | Funções puras com constantes nomeadas (`pdfParagraphs.ts`); quebra falsa medida 0–1,3% em prosa e 6,8% em livro técnico. Novos casos reais entram como teste sintético + ajuste de constante. Decisão sobre nota de rodapé fica para US2/US4 (modo texto/TTS). |
| R-016 | PDFs reais imprimem o texto N× com deslocamento < 1pt (negrito falso por sobreposição; ex.: "Os Noturnos" 4×) e o texto bruto do localizador (DI-005) contém todas as cópias | Médio — sem dedupe os parágrafos saíam misturados | Resolvido em `pdfParagraphs.ts` (dedupe por string+posição; índices das cópias continuam nos `ranges`). O localizador não muda (conta as cópias), consistente com a camada de texto do pdf.js usada na página fiel. |
| R-017 | O tamanho de corpo varia por página no mesmo PDF (9pt/7pt em "Do Mil ao Milhão") | Médio — métricas globais deixavam páginas "sem corpo" e quebravam cada linha | Resolvido: tamanho de corpo por página (com o do documento como reserva abaixo de 300 caracteres). |
| R-018 | O foliate-fxl não define `--scale-factor` no documento da página: o `TextLayer` do pdf.js dimensiona a camada com `var(--scale-factor)` e, sem ela, a camada ficava com 1/dpr do tamanho da página em telas densas (seleção/toque desalinhados do texto desenhado) | Alto — quebraria tradução/Word Lens/highlights em celulares | Resolvido em `pdfPageRender.ts` (define `--scale-factor` = zoom × dpr); verificado em DPR 1/2/3 no Chromium. Revalidar no WebView do Android (T026). |
| R-019 | Ao entrar em modo scroll o foliate calcula o "índice atual" com as páginas ainda sem altura e rola para uma página do meio do livro | Alto — o leitor abria na página errada e podia sobrescrever o progresso salvo | Resolvido: `PdfPageViewer` navega SEMPRE ao ponto inicial (página 0 se não há progresso) e só emite `onRelocate` depois disso (`readyRef`). |
| R-020 | Sem o celular desbloqueado não dá para validar no WebView do Android: pinça/pan, memória com PDF grande, capa nativa, import de pasta | Médio — comportamento só confirmado em Chromium | T026/T027 abertas; APK de debug já instalado. O harness de Chromium (`harness/pdf.*`, `harness/e2e.*`) foi removido do repositório e guardado fora dele (scratchpad); para refazer, recriar a partir do plan. |
| R-021 | Vazamento: `pageCleanupsRef` (Map<Document, cleanup>) do `PdfPageViewer` só era esvaziado ao desmontar; o foliate descarta páginas removendo o iframe sem avisar → ~0,35 MB por página lida preso, imune a GC | Alto — leitura longa estouraria a memória (SC-002, histórico de alerta no Play Console) | Resolvido (T038a): `releaseDiscardedPages()` a cada página nova solta documentos cujo iframe saiu do DOM. Chromium: heap estável em 300 páginas; teste de regressão no contrato do viewer. |
| R-022 | Pinça: (a) o foliate-fxl desliga `pointer-events` dos iframes durante a rolagem (+150 ms) e o toque caía no host sem listener; (b) `preventDefault` só no `touchmove` chegava tarde (evento já não cancelável); (c) o feedback `scale()` encolhia as coordenadas dentro do iframe (razão convergia para a raiz); (d) gesto perdido virava zoom nativo do navegador | Alto — zoom é critério da US1 | Resolvido (T038a): `touchstart` não passivo cancelando com 2 dedos, pinça também no contêiner do pai com `touch-action: pan-x pan-y`, compensação da escala aplicada para toques vindos do iframe. Revalidar no WebView do Android (T026). |
| R-023 | Progresso usava `renderer.index` (página no MEIO da tela) com offset 0 | Médio — ao reabrir, o leitor perdia até meia tela | Resolvido (T038a): `getTopVisiblePageIndex()` mede a página no topo (fallback `renderer.index` sem layout). |
| R-024 | Percentual de PDF era float cru no chrome e nos marcadores | Baixo — visível ao usuário | Resolvido (T038a): `clampPercentage` (inteiro, como o EPUB) no relocate e no marcador; fração continua precisa. |
| R-025 | `PdfBookInfoProvider` pega o 1º ISBN do texto: na página de copyright de traduções aparece antes o ISBN do original (e o da edição anterior); nas últimas páginas, ISBNs de outros livros | Médio — ficha com identidade de outra edição | Resolvido (T038b): ISBN por camadas e contexto da linha (`classifyIsbnLine`); "outra obra" nunca entra. |
| R-026 | Metadados-lixo de exportação do Word ("(Microsoft Word - …)", autor "A") viram título/autor | Baixo — título feio e sem enriquecimento | Resolvido (T038c): `pdfMetadataTitle`/`pdfMetadataAuthor` recusam lixo de exportação. |
| R-027 | Rolagem rápida deixa 16–28 iframes de página carregados (teto do foliate = 8); não cresce sem limite | Baixo/Médio — memória de canvas no celular (DPR 3) | Resolvido (T038d): causa no foliate-fxl (descarte só no callback do IntersectionObserver; carregamentos terminavam depois). Patch `evictFoliateScrollPagesAfterLoad` em `vite.config.ts` roda o descarte ao fim de cada carregamento; falha o build se a âncora sumir. Chromium: 8 iframes após cada rolagem rápida. |
| R-028 | Detalhes de UI: aviso de PDF sem texto cobre o chrome; sumário vazio cita "EPUB"; chrome não fecha após escolher capítulo | Baixo | Resolvido (T038e): avisos num contêiner abaixo do cabeçalho do chrome; `emptyDescription` opcional no `TocDrawer` (EPUB usa o texto de sempre); sumário/marcador fecham o chrome só no PDF (no EPUB o comportamento é o mesmo de antes — DI-001). |
| R-029 | No `npm run dev` o `hardenFoliateIframeSandbox` não se aplicava (iframes do EPUB e do PDF com `allow-scripts`); no build/APK estava correto | Médio — escondeu o R-030 | Resolvido: hooks na forma clássica `transform(code, id)` (a forma `{ filter, handler }` não era aplicada no dev). Build de produção sem mudança (chunk `paginator` com hash idêntico). |
| R-030 | **Página PDF em branco com o sandbox de produção**: documento sem scripts exibe o fallback do `<canvas>`, não o bitmap. Toda validação anterior (Fases 1–3) rodou no dev sem o sandbox, e o device ainda não tinha sido testado | Crítico — a US1 não funcionaria no APK | Resolvido (T038f): página exibida como `<img>` (PNG via `toBlob`, decodificada antes da troca, URL revogada logo após); validado em Chromium com o sandbox de produção, DPR 1 e 3, zoom. Reinstalar o APK antes do T026/T027. |
| R-032 | Teclado do Android abria ao entrar no leitor de PDF: caixa de highlight fechada (mas montada pelo `BottomSheet`) com `autoFocus` incondicional; no EPUB o viewer toma o foco e escondia o problema | Médio — teclado cobrindo meia tela ao abrir qualquer PDF | Resolvido (T038h): `autoFocus={open}`; teste de unidade + checagem de foco na verificação visual (controle negativo reprova). Confirmar no device. |
| R-034 | `canvas.toBlob` no WebView do Android só codifica em tempo ocioso: 4–13 s por página (toDataURL: 30–42 ms) | Alto — página demorava até 13 s para aparecer no celular | Resolvido (T038k): `toDataURL` no render e na capa. Chromium desktop não mostra o problema — só medição no device pegou. |
| R-035 | `imageResize.ts` (capa > 2000 px no import, EPUB e PDF) também usa `toBlob` | Médio — import lento no Android | T038l (caminho do EPUB: decidir antes de mudar). |
| R-033 | Detalhes de um PDF nunca mostram o sumário (outline só é lido no leitor) | Baixo — o leitor tem o sumário | T038i (texto provisório manda abrir o livro). |
| R-036 | "Abrir com" descartado sem importar (efeito do App roda 2× na abertura; a 1ª execução consumia a pendência e era cancelada) e reimportação fantasma do último arquivo escolhido | Alto — arquivo recebido se perdia; livro reimportado sozinho | Resolvido (T038m): laço único que drena as pendências; seleção nativa limpa a pendência. Validado no device. |
| R-037 | Pinça instável no device: origem do zoom escorregava para fora da tela; pan por pointer events (mouse) reagia a cada dedo e movia a página no zoom out | Alto — zoom inutilizável no celular | Resolvido (T038n). Chromium desktop passou 4/4 sem pegar o pan dos dedos — gestos se medem no device via CDP. |
| R-038 | Depois do zoom a imagem ficava no tamanho antigo até o novo render (página "pulando", texto turvo, app travado ~2 s) | Médio — qualidade percebida ruim | Resolvido (T038o): imagem esticada no frame do zoom, render da página visível primeiro, teto de 2^24 px. |
| R-039 | Zoom ≥ 300% leva ~2 s até a nitidez final (página inteira em ~15 Mpx) | Baixo — aceito como está | T038p (opcional): render por tiles da área visível. |
| R-031 | A busca do Google Books inclui o texto de reserva "Autor desconhecido" como termo quando o livro não tem autor | Baixo/Médio — piora o enriquecimento (PDF e EPUB) | T038g (caminho compartilhado com o EPUB: decidir antes de mudar). |

## Execution Notes

<!--
  Tabela append-only, mantida pelo sdd-execute. Quando passar de ~40 linhas,
  arquivar as mais antigas (exceto as ~10 mais recentes) em history.md,
  substituindo por uma linha de resumo consolidado aqui.
-->

| Data | Fase/Story | Resumo | Pendência Principal |
| --- | --- | --- | --- |
| 2026-10-06 | Fase 3 (US1) — device (T027) | Import por arquivo/pasta/"abrir com" OK depois de T038m (R-036); pinça e nitidez do zoom corrigidas e medidas no device via CDP (T038n/T038o, R-037/R-038), aceitas pelo dono do produto; gate verde (1395 + 2 skipped) | T027: regressão do EPUB no device (tradução, TTS com tela apagada, marcador com sync) |
| 2026-10-06 | Fase 3 (US1) — achados pendentes | T038b–T038f: ISBN da edição certa, título-lixo, descarte de iframes (patch no foliate via Vite), UI dos avisos/sumário, sandbox no dev (R-029) e **página em branco com o sandbox de produção (R-030, crítico)**; gate verde (1381 + 71) | Reinstalar o APK e rodar T026/T027 no device; T038g (R-031) |
| 2026-10-05 | Fase 3 (US1) — testes E2E | Playwright MCP + `npm run dev` (harness temporário) com 15 arquivos do corpus: 4 bugs corrigidos (vazamento por página, pinça, posição salva, percentual — R-021..R-024, T038a), 9 testes novos; EPUB conferido; gate verde (1363 + 71) | T038b–T038e (R-025..R-028) e device (T026/T027) |
| 2026-10-05 | Fase 3 (US1) | T019–T025, T028–T038: import (web/nativo) e ficha de PDF, idioma, sessão, `PdfPageViewer`, avisos, `ReaderScreen` por formato, plugin Java; E2E em Chromium com 12 PDFs; gate EPUB verde (1354 + 71) | **Device (T026/T027)**: celular com PIN; APK de debug já instalado |
| 2026-10-05 | Fase 2 (Foundational) | T007–T018: tipos, utilitários puros, `pdfParagraphs` calibrado em 11 PDFs reais (SC-003 ≥ 95% em prosa), `PdfBookFactory`/`PdfTextExtractor` validados em Chromium (grande.pdf abre em 0,65 s); 135 testes novos; gate EPUB verde (1226 + 71) | `PdfService` deve normalizar `author` (array) e `language`; device só na Fase 3 |
| 2026-10-05 | Fase 1 (Setup) | T001–T006: baseline EPUB registrada; plugin dev `/vendor/pdfjs`; corpus sintético (12 PDFs, `grande` = 1000 pág./188 MB) + extrator de fixtures; gate EPUB idêntico à baseline (1094 testes + 71 corpus) | Corpus sintético: incluir PDFs reais na calibragem do T015 (R-014) |

**PRÓXIMO**: T027 — `quickstart.md` § Regressão EPUB no device (tradução, TTS com tela apagada, marcador com sync); depois fechar a Fase 3 (pendentes não bloqueantes: T038g, T038i, T038j, T038l, T038p) e seguir para a Fase 4 (US2, modo texto).

## Arquivos Principais

<!-- Sobrescrita a cada checkpoint — foco da etapa atual, não a árvore inteira. -->

Foco da Fase 4 (US2 — modo texto) — só depois do device da Fase 3 (ou em paralelo, sem tocar nada do viewer):

- `src/services/pdf/PdfTextBookBuilder.ts` (novo, T045): livro sintético reflowable, uma seção por trecho; `data-type="chapter"` na raiz, sem `transformTarget`/`entries`/`resources` (R-011)
- `src/services/pdf/PdfLocatorResolver.ts` (novo, T047): localizador ↔ CFI do livro sintético e ↔ Range na camada de texto
- `src/components/reader/EpubViewer.tsx` (T046): ÚNICA mudança permitida — prop opcional `openBook`
- `src/components/reader/PdfReadingModeToggle.tsx` (novo) e `ReaderScreen.tsx` (T048: remontar o viewer por modo, converter localizador ↔ CFI)
- Já prontos: `utils/pdfParagraphs.ts` + `PdfTextExtractor.reconstructChunk` (blocos com `ranges`/`figure`+`region`), `PdfPageViewer` (`pdfPage/pdfPageMapping.ts`: item ↔ offset ↔ bloco), `BookSettings.pdfReadingMode`

## Cuidados para Retomada

<!-- Armadilhas operacionais específicas desta feature, anexadas conforme descobertas. -->

- **Dev server**: `npm run dev -- --port N` no PowerShell tool NÃO repassa a flag (o Vite tratou o número como pasta raiz → 404 em tudo). Use `npx vite --port N --strictPort`. A porta 5173 costuma estar ocupada por outro dev server do usuário — não matar.
- **Playwright MCP não esteve disponível** na sessão da Fase 1. Os scripts `scripts/extract-pdf-text-fixtures.mjs` e `scripts/pdf-corpus/generate-corpus.mjs` usam o pacote `playwright` que já está em `node_modules` (marcado "extraneous": não está no `package.json`; se sumir, `npm i --no-save playwright`). Nunca adicioná-lo ao `package.json` sem perguntar (constituição V).
- **Corpus é sintético** (gerado pelo Chromium com texto próprio): não substitui PDFs reais (LaTeX/InDesign/Word). Para calibrar T015 com mais fidelidade, copiar 2–3 PDFs reais do usuário para `debug-books/pdf/` e rodar `node scripts/extract-pdf-text-fixtures.mjs --only <nome>` (só versionar fixture de PDF cujo texto possa ser versionado).
- **Forma dos itens do pdf.js neste corpus** (relevante para `pdfParagraphs`): a palavra pode vir **quebrada em vários itens sem espaço entre eles** (soft hyphen, kerning); hifenização de fim de linha vem como um item `"-"` **isolado**; há itens `{ str: '', hasEOL: true }` vazios; espaços entre itens devem ser inferidos pelo gap em x.
- **Celular com PIN**: `adb shell input keyevent KEYCODE_WAKEUP` acorda, mas só o usuário destrava (Bouncer). Depois de destravado: `adb shell svc power stayon true` mantém a tela ligada. Device: SM-S911B (Android 16), 1080×2340, 480 dpi. APK: `npm run build; npx cap sync android; cd android; .\gradlew.bat assembleDebug; adb install -r app\build\outputs\apk\debug\app-debug.apk`.
- **Validar o viewer em Chromium (antes do celular)**: harness versionado em `scripts/verificacao-visual/harness/e2e.html` (monta `BookImportService` + `ReaderScreen` reais, sem o login Google; só dev server, fora do build). Verificação visual pronta: `scripts/verificacao-visual/pdf-pagina-fiel.check.js` via Playwright MCP (`browser_run_code_unsafe` com `filename`) — mede os pixels da tela em DPR 1 e 3, tema escuro e claro, início e meio do livro; instruções e controle negativo no topo do arquivo. Para outros casos: contexto com `deviceScaleFactor` 3 e `hasTouch`; pinça via CDP `Input.dispatchTouchEvent` com 2 pontos.
- **jsdom × PDF**: nos testes do viewer o `scrollIntoView` precisa ser stubado no realm do iframe (`doc.defaultView.Element.prototype`), e `beforeEach(() => mock.mockReset())` com arrow que devolve o mock é executado como teardown pelo Vitest — usar chaves.
- **Senha do `senha.pdf`**: `neoreader` (só para teste manual; o app deve recusar o arquivo, FR-015).
- **Sandbox no dev (R-029, resolvido)**: desde 2026-10-06 o dev aplica o mesmo sandbox do APK (iframes só com `allow-same-origin`). Plugins do Vite que transformam o foliate devem usar a forma clássica `transform(code, id)` — a forma `{ filter, handler }` não era aplicada no dev. Conferir no build: `dist/assets/fixed-layout-*.js`/`paginator-*.js` sem `allow-scripts`.
- **Nada de `<canvas>` visível dentro do iframe de página (R-030)**: o documento não tem scripts, e o canvas mostra só o fallback. Para exibir pixels, use `<img>` (ou desenhe fora do iframe). Overlays de TTS/highlights das fases 5–7 devem usar DOM/SVG, não canvas.
- **Screenshots do Playwright MCP** só podem ser gravados dentro do repositório (`.playwright-mcp/`, já ignorado no git); apagar ao terminar.
- **Testes de pinça no Chromium deixam estado na aba**: um gesto não capturado aplica zoom nativo (`visualViewport.scale` > 1) que sobrevive a reload e desalinha cliques seguintes (parecia "EPUB não abre a tradução"). Zerar com CDP `Emulation.setPageScaleFactor({ pageScaleFactor: 1 })` ou fechar a aba (a verificação versionada usa um contexto novo por configuração, sem esse problema).
- **Medir vazamento no Chromium**: `HeapProfiler.collectGarbage` (2×) antes de ler `performance.memory.usedJSHeapSize`; o tamanho do `pageCleanupsRef` dá para ler pela fiber do React (`__reactFiber$…` → `PdfPageViewer` → hook com `Map` de `Document`).
- `grande.pdf` = 1000 páginas / 188,4 MB (abaixo do teto de 200 MB, de propósito: representa o caso "sem aviso"). Para testar o aviso de FR-016, gerar um maior à parte.
