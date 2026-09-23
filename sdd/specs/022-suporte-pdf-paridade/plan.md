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
| R-006 | Assets do pdf.js ausentes no dev server (`copyFoliatePdfjsAssets` só em build) | Médio — bloqueia teste em Chromium via `npm run dev` | Task de Setup: middleware `apply: 'serve'` em `vite.config.ts` servindo `/vendor/pdfjs` (sem afetar build/EPUB). |
| R-007 | Conversão localizador ↔ CFI no modo texto é assíncrona e depende do HTML sintético | Médio | `PdfLocatorResolver` usa atributos de offset gravados no HTML gerado; round-trip coberto por teste unitário. |
| R-008 | pdf.js real não roda de forma confiável em jsdom (worker, canvas) | Médio — cobertura automatizada | Lógica de valor fica em funções puras (fixtures); pdf.js mockado nos testes de integração; validação real em Chromium/device. research.md §4. |
| R-009 | Muitos PDFs com texto "quebrado" (fontes sem ToUnicode) parecem ter texto mas geram lixo | Médio | Detecção de camada de texto considera proporção de caracteres imprimíveis/válidos, não só presença de itens; esses caem no aviso de FR-014. |
| R-010 | `CLAUDE.md` diz schema v16; real é v19 | Baixo | Registrado aqui; corrigir o `CLAUDE.md` na fase de Polish. |
| R-011 | Passos pós-open do `EpubViewer` pensados para EPUB rodando no livro sintético (Analyze A1): pulo automático de capítulo-stub (`isChapterStubSection`, até 4 seções) sumiria trechos curtos; progresso pelo sumário depende de hrefs; setup só re-roda quando `book.id` muda | Médio — trecho pulado ou modo que não troca | Mitigado no HTML gerado e no `ReaderScreen`, sem tocar o `EpubViewer` (ver DI-003): `data-type="chapter"` em toda seção, sem `data-pdf-bookmark`, sem `transformTarget`/`entries`/`resources`, hrefs sintéticos resolvidos pelo próprio livro, `key` por modo. Validado por T045a/T045b no início da Fase 4; se falhar, reabrir o design. |
| R-012 | PDF raramente traz idioma nos metadados; Word Lens, tradução e TTS dependem dele (Analyze A3) | Médio — tradução/TTS no idioma errado em silêncio | DI-012: metadados → detecção por stopwords no import → indefinido com aviso único; nunca `'en'` silencioso para PDF. |
| R-013 | Ficha de PDF sem enriquecimento: provedor local só lê EPUB e Open Library exige ISBN (Analyze A2) | Baixo/Médio — ficha pobre em PDF | DI-013: `PdfBookInfoProvider` com ISBN extraído do texto; falha em achar ISBN é aceitável (Google Books ainda busca por título/autor). |

## Execution Notes

<!--
  Tabela append-only, mantida pelo sdd-execute. Quando passar de ~40 linhas,
  arquivar as mais antigas (exceto as ~10 mais recentes) em history.md,
  substituindo por uma linha de resumo consolidado aqui.
-->

| Data | Fase/Story | Resumo | Pendência Principal |
| --- | --- | --- | --- |

**PRÓXIMO**: —

## Arquivos Principais

<!-- Sobrescrita a cada checkpoint — foco da etapa atual, não a árvore inteira. -->

- (nenhum ainda)

## Cuidados para Retomada

<!-- Armadilhas operacionais específicas desta feature, anexadas conforme descobertas. -->

- (nenhum ainda)
