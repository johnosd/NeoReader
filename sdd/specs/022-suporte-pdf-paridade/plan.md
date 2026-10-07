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
| Fase 3 — US1 (import + página fiel) | **Concluída (2026-10-06)**. Device: SC-002 (aberturas fria/quente < 3 s), 30 min sem crash, pinça/nitidez, escaneado e marcador com sync. Restante de device (SC-001 no corpus, 20 PDFs/capa nativa, smoke do T038s, capa grande do T038l) movido para o T079 por decisão do dono do produto. |
| Fase 4 — US2 (modo texto) | **Implementada e validada em Chromium (2026-10-06)**; falta só o device (T044). SC-003 95–100% em 9 livros reais, SC-005 100% no E2E, troca de modo 0,5–1 s. DI-003 confirmado (`EpubViewer` +9 linhas). |
| Fase 5 — US3 (Word Lens + tradução) | **Implementada e validada em Chromium (2026-10-06)**; faltam T052/T053 no device. Página fiel: o toque traduz a frase num painel na própria página (R-047). Modo texto: bloco inline do `EpubViewer`. |
| Fase 6 — US4 (TTS) | **Implementada e validada em Chromium (2026-10-07)**; T059 e o checklist de device do T060 ficam no T079. Página fiel: parágrafos reconstruídos do trecho, destaque nas duas páginas de um parágrafo que cruza a virada, karaokê, acompanhamento e troca de trecho automática. Modo texto: TTS do `EpubViewer` sem ajuste. `pdf-tts.check.js` 7/7 nos dois modos. |
| Fase 7 — US5 (highlights) | **Implementada e validada em Chromium (2026-10-07)**; T065/T066 no device ficam no T079. Página fiel: seleção → menu → caixa unificada, pintura por estilo só em texto de parágrafo, menu de gerenciar com nota. Modo texto: localizador exato (R-054). `pdf-highlight.check.js` 6/6 (SC-006 nos dois sentidos + virada de página). |
| Fase 8 — US6 (OPDS) | **Implementada (2026-10-07)**; o download OPDS só roda no Android nativo (`CapacitorHttp`), então o download real de PDF e de EPUB pelo catálogo (T071) fica no T079. Parsers aceitam só-PDF (`acquisitionFormat`), mistas → EPUB, DRM (ACSM com `indirectAcquisition`) continua fora; download decide o formato pelos bytes (R-056); selo "PDF" no card. |
| Fase 9 — Polish | **Documentação, copy e licença concluídas (2026-10-07)**: README (com a seção "Leitor PDF" e o schema corrigido para v19), CLAUDE.md, 2 textos ajustados nos 3 idiomas, licença revisada, `docs/features/suporte-pdf.md`. Falta só o T079 (rodada de device). |
| Código de app para PDF | Import (web + Android, importadores por formato), `PdfService`, ficha, idioma, `usePdfReaderSession`, página fiel (`PdfPageViewer`, com tradução/Word Lens, TTS e highlights), modo texto (`PdfTextBookBuilder` + `PdfLocatorResolver` + `PdfTextModeViewer`), avisos, `ReaderScreen` por capacidades, plugin Java, **OPDS** |
| Regressão EPUB | 1539 testes passando + 2 skipped (base 1094 inalterada) · corpus EPUB 71 · lint/tipos/build ok · `EpubViewer` e `useTTS` sem mudança nas Fases 6–8 · entrada OPDS só-EPUB/mista com o mesmo link de antes (testes) · checklist no device pendente (T044/T053/T060/T066/T071 → T079) |

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
| R-020 | Validação no WebView do Android: pinça/pan, memória com PDF grande, capa nativa, import de pasta | Médio — cobertura incompleta do corpus | T027 concluído; T026 parcial. Pinça, imagem, aviso de escaneado, abertura quente/fria, 30 min sem crash e marcador PDF com sync medidos. Ainda faltam SC-001 no corpus e comparação de capa/import em lote. |
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
| R-035 | `imageResize.ts` (capa > 2000 px no import, EPUB e PDF) também usa `toBlob` | Médio — import lento no Android | Resolvido (T038l): `toDataURL` + `dataUrlToBlob` (`src/utils/dataUrl.ts`), autorizado pelo dono do produto; medir import de EPUB com capa grande no device no T079. |
| R-033 | Detalhes de um PDF nunca mostram o sumário (outline só é lido no leitor) | Baixo — o leitor tem o sumário | Resolvido: T038i lê o outline em `BookDetailsScreen`, converte destinos em localizadores PDF e libera o documento; testes com/sem sumário verdes. APK novo: `1col.pdf` mostrou 11 itens e "Chapter 5" abriu na seção correta. |
| R-036 | "Abrir com" descartado sem importar (efeito do App roda 2× na abertura; a 1ª execução consumia a pendência e era cancelada) e reimportação fantasma do último arquivo escolhido | Alto — arquivo recebido se perdia; livro reimportado sozinho | Resolvido (T038m): laço único que drena as pendências; seleção nativa limpa a pendência. Validado no device. |
| R-037 | Pinça instável no device: origem do zoom escorregava para fora da tela; pan por pointer events (mouse) reagia a cada dedo e movia a página no zoom out | Alto — zoom inutilizável no celular | Resolvido (T038n). Chromium desktop passou 4/4 sem pegar o pan dos dedos — gestos se medem no device via CDP. |
| R-038 | Depois do zoom a imagem ficava no tamanho antigo até o novo render (página "pulando", texto turvo, app travado ~2 s) | Médio — qualidade percebida ruim | Resolvido (T038o): imagem esticada no frame do zoom, render da página visível primeiro, teto de 2^24 px. |
| R-039 | Zoom ≥ 300% leva ~2 s até a nitidez final (página inteira em ~15 Mpx) | Baixo — aceito como está | Adiado: ideia registrada em `.planning/backlog.md` (T038p fechado sem implementação). |
| R-040 | Código compartilhado EPUB/PDF com ramificações por formato espalhadas (`BookImportService` 15, `ReaderScreen` 18); um bug no caminho comum afeta os dois (ex.: regressão do "abrir com", 19eae7b) | Médio — risco de regressão do EPUB a cada mudança de PDF, e a Fase 4 mexe muito na `ReaderScreen` | Resolvido (T038q): importadores por formato e capacidades do leitor; patch de descarte de páginas mantido para os dois formatos (decisão do dono do produto). |
| R-041 | EPUB de layout fixo não abre (timeout de 8 s no `EpubViewer`); não havia nenhum no corpus, nunca foi testado | Médio — afeta quadrinhos e livros ilustrados; **não é regressão da 022** (igual no `main`) | Encaminhado: `[Bug]` em `.planning/backlog.md` (caminho `sdd-bugfix`), fora da 022. Verificação pronta (`epub-fxl.check.js`). |
| R-031 | A busca do Google Books inclui o texto de reserva "Autor desconhecido" como termo quando o livro não tem autor | Baixo/Médio — piora o enriquecimento (PDF e EPUB) | Resolvido (T038g): `usableAuthorHint` descarta o texto de reserva na busca e no match do Google Books e do YouTube; autor real encontrado não é mais bloqueado. |
| R-042 | Links internos de anotações em PDF geram `Cannot read properties of undefined (reading 'getDestinationHash')`: o `linkService` é passado ao construtor de `AnnotationLayer`, mas esta versão do pdf.js só o lê em `render()` | Médio — erro não tratado ao renderizar páginas com links internos | Resolvido: T038s passa o serviço a `render()`, tem teste de regressão verde e renderizou no Chromium real um PDF sintético com 1 link interno sem exceção. O log original foi às 15:20 em 2026-10-06, antes do QA iniciado às 15:33; falta smoke no APK novo. Interagir com anotações nativas é fora do escopo da spec. |
| R-043 | PDF continuava preto no modo Original porque o `PdfPageViewer` aplicava `pageColors` do tema mesmo com `overrideBookColors=false` | Médio — cores e legibilidade do PDF alteradas contra a preferência salva | Resolvido (T038t): modo Original remove `pageColors`, usa fundo branco e redesenha a página; controle específico de PDF disponível na ficha e no painel de aparência. Regressões e Android SM-S911B confirmaram AMOLED preto → Original branco, inclusive após reabrir. |
| R-044 | A prévia da 1ª página do PDF na tela de carregamento (723b802) quebrava o carregamento de **qualquer** livro sem prévia (EPUB incluso): `coverState?.bookId === pdfPreviewBookId` vira `undefined === undefined` | Crítico — leitor não abria; entrou num commit sem gate (98 testes da `ReaderScreen` e o `tsc` acusavam) | Resolvido (T038u): checagem explícita de `coverState`. Lição: rodar o gate completo antes de todo commit, inclusive commits "wip". Não verificado no device (APK anterior ao 723b802). |
| R-045 | O EpubViewer injeta elementos no documento ao vivo (bloco de tradução entre parágrafos, spans de Word Lens dentro deles); CFIs calculados ali têm índices diferentes do documento limpo usado na conversão | Alto — marcador/highlight/progresso convertidos para o parágrafo errado | Resolvido no HTML gerado (DI-003): cada bloco tem `id` estável (`nrpdf-<pág>-<offset>`), o foliate grava o id no caminho do CFI e o `PdfLocatorResolver` acha o bloco por ele; offset exato no 1º trecho de texto, texto do highlight como dica dentro de spans. Teste com documento "ao vivo" modificado. Limite: relocate dentro de span sem dica cai no início do parágrafo. |
| R-046 | Ordem de leitura de páginas com 3+ colunas: a reconstrução só separa duas colunas e misturaria o texto (spec, Edge Cases) | Médio — modo texto ilegível em jornais/folhetos | Resolvido: `hasUncertainColumnOrder` (rio dentro de uma das metades) → a página aparece "como no original" (imagem) no modo texto. 0 falsos positivos em 1.882 páginas de 11 PDFs reais e em todo o corpus sintético. |
| R-047 | Página fiel: o toque abriria um balão "Traduzir/Marcar" (texto de T054) — um toque a mais que no EPUB | Médio — paridade de uso com o EPUB (pilar de aprendizado) | Decisão: o toque traduz direto a frase tocada, num painel dentro da página com as mesmas ações do bloco inline do EPUB + Fechar; "Marcar parágrafo" virou ação do painel. |
| R-048 | Livro sintético servido só por `load()` (blob `application/xhtml+xml`): a página do modo texto virava documento XML e o `innerHTML` do bloco de tradução do EpubViewer lançava ("invalid XML") | Alto — tradução/Word Lens quebrados no modo texto | Resolvido no HTML gerado (DI-003): `loadContent()` → `iframe.srcdoc` (HTML, como os EPUBs do foliate); documentos de conversão também parseados como HTML. Teste de regressão no builder. |
| R-050 | Marcador de PDF abria no topo da página, e não no parágrafo, quando a página tinha saído da memória: a espera aceitava a imagem antes da camada de texto | Médio — marcador "não abre no local correto" (achado no device) | Resolvido (T038v): espera a camada de texto quando há linha a alcançar + rolagem por conta explícita; `pdf-marcador.check.js` 5/5. Confirmar no device (T079). |
| R-053 | Seleção que atravessa páginas na página fiel é impossível: cada página é um documento (iframe) e o navegador não seleciona entre documentos | Baixo — spec pede o trecho destacado "nos dois modos", não a seleção na página fiel | Aceito: a seleção entre páginas é feita no modo texto; a página fiel pinta o intervalo nas duas páginas. |
| R-054 | Highlight criado no modo texto gravado com o intervalo deslocado (conversão CFI → localizador proporcional dentro do parágrafo; E2E: 1 caractere antes, a página fiel pintava " grandmother investiga") | Médio — trecho errado na página fiel | Resolvido: `snapRangeToText` ajusta o intervalo ao texto bruto da página pelo texto selecionado (espaço/quebra entre palavras, hífen de quebra dentro delas); sem ocorrência por perto, fica o aproximado. |
| R-055 | Intervalo que atravessa a virada de página contém, no texto bruto, o cabeçalho corrido e o número da página — a página fiel os pintava | Médio — cabeçalho sublinhado num highlight comum | Resolvido: só itens de blocos reconstruídos (corpo) são pintados, inclusive a continuação de parágrafo do trecho anterior. |
| R-051 | Karaokê de palavra na página fiel depende de achar a palavra lida no texto bruto da página (o TTS fala o texto reconstruído) | Baixo — palavra hifenizada entre linhas fica sem marca de palavra (o parágrafo continua destacado) | Aceito: busca restrita aos intervalos do bloco, fronteira entre páginas indo para a seguinte; sem palavra achada, só o destaque do parágrafo (mesma degradação do TTS traduzido). |
| R-052 | No navegador o TTS nativo é o `speechSynthesis`, que num teste automatizado não toca nem emite eventos de forma confiável | Médio — o fluxo real de TTS (troca de trecho, acompanhamento) ficaria sem E2E | Resolvido no E2E: `pdf-tts.check.js` troca o `speechSynthesis` por um falso antes do app carregar (registra cada frase e termina em 120 ms); todo o resto é o código real. Áudio, tela apagada e segundo plano só no device (T079). |
| R-056 | O `type` do link OPDS pode não bater com o arquivo servido (ex: anuncia PDF e entrega EPUB) | Baixo — arquivo salvo com extensão/MIME errados | Decisão: `acquisitionFormat` só serve para a UI (selo); o download decide pelos bytes (`detectBookFormat`, DI-011) e conteúdo desconhecido segue como EPUB, igual antes da 022 (o parser de EPUB continua recusando). |
| R-057 | Modo texto no modo de aparência Original: o leitor não impõe cores e o livro sintético não tinha nenhuma → texto preto sobre o fundo escuro do leitor (achado no device, T079) | Alto — modo texto ilegível no Original | Resolvido (T079a): o livro sintético declara as cores de um PDF (papel branco, texto preto); temas do NeoReader seguem por cima. |
| R-058 | Modo texto escondido no painel Aparência: o dono do produto não o achou no teste de device | Médio — recurso central da US2 sem uso | Resolvido (T079b): botão próprio na barra do leitor, só em PDF. |
| R-059 | Import nativo de PDF sem dedupe por título/autor: o plugin entrega título = nome do arquivo e autor vazio (os reais só saem do pdf.js no JS) | Médio — o mesmo livro em outro arquivo entrava duplicado (achado no device, T079) | Resolvido (T079d): checagem repetida com os metadados reais, em arquivo único e lote; só PDF. |
| R-049 | CSS da camada de texto do pdf.js (`.textLayer span { position:absolute; color:transparent }` e `.textLayer > :not(.markedContent) { font-size; transform }`) atinge qualquer coisa desenhada dentro dela | Médio — painel ilegível, sublinhados fora do lugar | Resolvido: seletores mais específicos (`.textLayer > .nr-pdf-translation`, reset de spans) e tamanho do painel pela escala real até a tela (iframe × camada). |

## Execution Notes

<!--
  Tabela append-only, mantida pelo sdd-execute. Quando passar de ~40 linhas,
  arquivar as mais antigas (exceto as ~10 mais recentes) em history.md,
  substituindo por uma linha de resumo consolidado aqui.
-->

| Data | Fase/Story | Resumo | Pendência Principal |
| --- | --- | --- | --- |
| 2026-10-07 | Fase 9 — T079 (bloco C) | SC-001: 21/21 PDFs do corpus importados por pasta e abertos sem erro, 3 inválidos recusados; SC-002: 1ª página ≤ 0,65 s (grande ~2 s), memória em platô (~615 MB); SC-007 2/2; SC-009 19/19. T038s e T038l OK no APK. Release (R8) OK: página fiel, modo texto, import nativo. Achado R-059 (dedupe por título/autor no import nativo de PDF) → T079d corrigido e verificado no device. Gate: 1545 + 2 skipped, 71 EPUB. Livros/arquivos de teste removidos. | Fase 8: download OPDS de entrada só-PDF (precisa de catálogo com PDF). |
| 2026-10-07 | Fase 9 — T079 (blocos A/B) | APK novo no SM-S911B. Dono do produto testou PDF (marcador no parágrafo, modo texto, tradução/Word Lens, TTS com tela apagada e traduzido, highlights nos dois modos, download OPDS de EPUB) e regressão EPUB: tudo OK → T044, T052, T053, T059, T060, T065, T066, T071 fechados. Achados corrigidos: R-057 (preto no preto no modo texto Original, medido via CDP), R-058 (botão do modo texto na barra), selo de formato em Detalhes (T079a–c). Gate: 1543 + 2 skipped, 71 EPUB. | Bloco C (SC-001 no corpus, 20 PDFs/capa, memória, release) e download OPDS de entrada só-PDF. |
| 2026-10-07 | Fase 9 — Polish | T075–T078, T080: README (PDF em formatos/stack/import/OPDS, seção "Leitor PDF", persistência v17 → v19 com `highlights`/`collections`, pastas, arquitetura), CLAUDE.md (v16 → v19 + parágrafo do PDF), copy (OPDS vazio e "buscando dados no EPUB" nos 3 idiomas), licença (cabeçalhos MIT ok, foliate-js MIT, nada do Readest), `docs/features/suporte-pdf.md`. Gate: tipos, lint, 1539 + 2 skipped, build, 71 EPUB. | T079: rodada de device com todos os itens acumulados. |
| 2026-10-07 | Fase 8 (US6) — OPDS | T069, T070, T072–T074: `pickAcquisition` nos dois parsers (EPUB preferido, PDF aceito, DRM fora) e `acquisitionFormat` na entrada; `OpdsDownloadService` com formato pelos bytes (R-056), `.pdf`/`application/pdf` e o mesmo `importEpub` (já despacha por conteúdo); selo "PDF" no `OpdsEntryCard`. 10 testes novos (8 falham no código antigo). Coordinator sem mudança (independe do formato; estado coberto pelo teste do download). Gate: tipos, lint, 1539 + 2 skipped, build, 71 EPUB. | T071 (download OPDS de PDF e EPUB no device) → T079. Próxima: Fase 9 (Polish). |
| 2026-10-07 | Fase 7 (US5) — highlights | T063, T064, T067, T068: página fiel com seleção → menu → caixa unificada, pintura por estilo e nota, menu de gerenciar, intervalo entre páginas; `pdfPageTextMarks` compartilhado com o TTS. E2E achou 2 bugs (R-054 intervalo do modo texto deslocado → `snapRangeToText`; R-055 cabeçalho pintado → só corpo). `pdf-highlight.check.js` 6/6. Gate: 1531 + 2 skipped, 71 EPUB; TTS 7/7, marcador 5/5, pinça 4/4, página fiel 6/6. | Device no T079 (T065/T066). Próxima: Fase 8 (US6 — OPDS). |
| 2026-10-07 | Fase 6 (US4) — TTS | T057, T058, T061, T062: TTS da página fiel sobre os parágrafos reconstruídos do trecho (`pdfPageTts.ts` + métodos do contrato no `PdfPageViewer`), destaque nas duas páginas e karaokê (R-051), acompanhamento com rolagem do usuário respeitada, troca de trecho pelo mesmo protocolo do EPUB; modo texto sem ajuste. E2E com `speechSynthesis` falso (R-052): 7/7 em `1col.pdf` (página e texto) e em O Milagre da Manhã. Gate: 1512 + 2 skipped, 71 EPUB; marcador 5/5, pinça 4/4, página fiel 6/6. | Device no T079 (T059, checklist do T060). Próxima: Fase 7 (US5 — highlights). |
| 2026-10-07 | Fase 3 (US1) — T038v | Marcador de PDF não abria no parágrafo (R-050, achado no device): corrida imagem × camada de texto ao voltar a página descartada. Corrigido e verificado no Chromium (`pdf-marcador.check.js` 5/5, teste de contrato com controle negativo). Gate: tipos, lint, 1491 + 2 skipped, build, 71 EPUB. Por decisão do dono do produto, testes de device ficam para o fim (T079) | Fase 6 (US4 — TTS) |
| 2026-10-06 | Fase 5 (US3) — Word Lens e tradução | T050, T051, T054–T056: a página fiel traduz a frase tocada num painel na própria página (R-047) com definição, selo do provedor e ações; Word Lens passivo e vocabulário na camada de texto; mesmos handlers do EPUB na ReaderScreen. Modo texto validado sobre o livro sintético após corrigir documento XML → HTML (R-048). CSS do pdf.js contornado (R-049). E2E Chromium com tradução real e vocabulário gravado nos dois modos. Gate: 1490 + 2 skipped, 71 EPUB. | Device: T044, T052, T053 (APK novo). |
| 2026-10-06 | Fase 4 (US2) — modo texto | T039–T043, T045–T049 (exceto device): livro sintético reflowable no mesmo `EpubViewer` (só prop `openBook`), conversão localizador ↔ CFI imune a elementos injetados (R-045), páginas sem texto/3+ colunas como imagem (R-046), `PdfTextModeViewer`, alternância no painel e modo por livro. E2E Chromium: SC-003 95–100% em 9 livros reais, SC-005 100%, troca 0,5–1 s, zoom de figura OK, EPUB real OK. Gate: lint/tipos/build OK, 1467 + 2 skipped, 71 EPUB. | T044 no device (checklist EPUB + modo texto) com APK novo. |
| 2026-10-06 | Fase 3 (US1) — fechamento | Decisões do dono do produto: T038r → bug no backlog; patch de descarte mantido nos dois formatos (T038q); T038p → backlog; restante de device do T026 → T079. Implementados T038g (autor de reserva fora da busca) e T038l (`toDataURL` na capa). Gate pegou T038u/R-044 (carregamento do leitor quebrado desde 723b802) — corrigido. Gate: lint/tipos/build OK, 1420 + 2 skipped, 71 EPUB. | Fase 4: T045a/T045b primeiro (DI-003). Device no T079. |
| 2026-10-06 | Fase 3 (US1) — T038t tema Original | Relato do usuário reproduzido no SM-S911B: `overrideBookColors=false` salvo, mas `pageColors` AMOLED e pixel preto. Corrigido no viewer e nos controles de aparência. APK de debug instalado por cima: Original `pageColors={}`/pixel branco, AMOLED preto, retorno a Original branco e preferência mantida após reabrir. Lint/tipos/build, 1405 testes + 2 skipped e 71 EPUB verdes; sem crash/ANR no log (um aviso de seed do WebView). | T026: SC-001 completo e spike de 20 PDFs; smoke de T038s no APK; decisões T038q/T038r, T038g/T038l. |
| 2026-10-06 | Fase 3 (US1) — smoke do APK novo | `cap sync android` + `assembleDebug` + `adb install -r` verdes, dados preservados. `1col.pdf`: 11 itens no sumário de Detalhes; navegação ao capítulo 5 OK. Marcador `neopdf:` criado e removido com `syncedAt`; livro voltou a 4%/zero marcadores e app ao EPUB original em 42%. Log sem crash/ANR/PDF; um aviso de seed do WebView. PDF com 1 link interno renderizou no Chromium real sem exceção. | T026: SC-001 completo e spike de 20 PDFs; smoke de anotação com link interno no APK; decisões T038q/T038r, T038g/T038l. |
| 2026-10-06 | Fase 3 (US1) — abertura fria e memória | SM-S911B: 4 aberturas frias de `grande.pdf` 2339–2453 ms; 30 min/900 passos até pág. 1000 sem crash, PSS 346→477 MB com pico de 535 MB e queda intermediária para 324 MB, 8 iframes finais. T038i (outline em Detalhes), T038s (anotações) e isolamento parcial T038q implementados; lint, 1401 testes, build, 71 EPUB verdes. App e configurações restaurados. | T026: marcador PDF com sync, SC-001 e capa/import em lote; decisão T038q/T038r e smoke do APK novo. |
| 2026-10-06 | Fase 3 (US1) — retomada T026 | Device: `grande.pdf` 10 aberturas quentes 2033–2300 ms (mediana 2116,5; p95 2300), 3 iframes carregados; `escaneado.pdf` renderiza imagem e mostra aviso; lint, 1395 testes, build, 71 EPUB verdes. App e configurações do device restaurados. APK instalado = local e chunks PDF = `dist/` por SHA-256. | Abertura fria e 30 min/memória, marcador PDF com sync, corpus completo e spike capa nativa/20 PDFs. |
| 2026-10-06 | Fase 3 (US1) — T027 concluído | Regressão do EPUB no device OK (tradução, TTS com tela apagada, marcador com sync) + gate automatizado verde; T029/T030 marcados (já implementados e exercitados no import do device) | T026: itens de PDF no device ainda não medidos (SC-002 com `grande.pdf` → T038j; marcador de PDF com sync; aviso de escaneado; 30 min de leitura) |
| 2026-10-06 | Fase 3 (US1) — device (T027) | Import por arquivo/pasta/"abrir com" OK depois de T038m (R-036); pinça e nitidez do zoom corrigidas e medidas no device via CDP (T038n/T038o, R-037/R-038), aceitas pelo dono do produto; gate verde (1395 + 2 skipped) | T027: regressão do EPUB no device (tradução, TTS com tela apagada, marcador com sync) |
| 2026-10-06 | Fase 3 (US1) — achados pendentes | T038b–T038f: ISBN da edição certa, título-lixo, descarte de iframes (patch no foliate via Vite), UI dos avisos/sumário, sandbox no dev (R-029) e **página em branco com o sandbox de produção (R-030, crítico)**; gate verde (1381 + 71) | Reinstalar o APK e rodar T026/T027 no device; T038g (R-031) |
| 2026-10-05 | Fase 3 (US1) — testes E2E | Playwright MCP + `npm run dev` (harness temporário) com 15 arquivos do corpus: 4 bugs corrigidos (vazamento por página, pinça, posição salva, percentual — R-021..R-024, T038a), 9 testes novos; EPUB conferido; gate verde (1363 + 71) | T038b–T038e (R-025..R-028) e device (T026/T027) |
| 2026-10-05 | Fase 3 (US1) | T019–T025, T028–T038: import (web/nativo) e ficha de PDF, idioma, sessão, `PdfPageViewer`, avisos, `ReaderScreen` por formato, plugin Java; E2E em Chromium com 12 PDFs; gate EPUB verde (1354 + 71) | **Device (T026/T027)**: celular com PIN; APK de debug já instalado |
| 2026-10-05 | Fase 2 (Foundational) | T007–T018: tipos, utilitários puros, `pdfParagraphs` calibrado em 11 PDFs reais (SC-003 ≥ 95% em prosa), `PdfBookFactory`/`PdfTextExtractor` validados em Chromium (grande.pdf abre em 0,65 s); 135 testes novos; gate EPUB verde (1226 + 71) | `PdfService` deve normalizar `author` (array) e `language`; device só na Fase 3 |
| 2026-10-05 | Fase 1 (Setup) | T001–T006: baseline EPUB registrada; plugin dev `/vendor/pdfjs`; corpus sintético (12 PDFs, `grande` = 1000 pág./188 MB) + extrator de fixtures; gate EPUB idêntico à baseline (1094 testes + 71 corpus) | Corpus sintético: incluir PDFs reais na calibragem do T015 (R-014) |

**PRÓXIMO**: único item aberto — download OPDS de uma entrada só-PDF num catálogo real (ex: Calibre local com um livro só em PDF) para fechar a Fase 8; depois `update-feature-status.ps1 -Status Implementada` e `sdd-converge`. Ao fechar, marcar as Fases 4–8 no Checklist de Release e rodar `update-feature-status.ps1 -Status Implementada`.

## Arquivos Principais

<!-- Sobrescrita a cada checkpoint — foco da etapa atual, não a árvore inteira. -->

Foco atual: rodada final de device (T079):

- `sdd/specs/022-suporte-pdf-paridade/quickstart.md`: roteiro do device, incluindo § Regressão EPUB.
- `docs/features/suporte-pdf.md`: mapa de uma página da arquitetura do PDF.
- `scripts/verificacao-visual/pdf-*.check.js`: E2E de referência no Chromium, para comparar com o que o device mostrar.
- Skill `android-debug`: logs e diagnóstico no celular.

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
- **Documentos XHTML do modo texto**: `tagName` vem em minúscula (`p`, não `P`) — em verificações use `localName`. E não role o conteúdo com `scrollIntoView` programático dentro do iframe do paginator antes de clicar: o hit-test passa a cair no `#container` e o clique não chega ao documento (pareceu "zoom de figura quebrado"; com rolagem real funciona).
- **Playwright sem MCP**: roteiros Node no scratchpad carregam o pacote do projeto com `createRequire('<repo>/package.json')('playwright')`; o harness expõe `__import/__open/__progress/__books`, e `page.evaluate(() => import('/src/...'))` dá acesso aos módulos reais (ex.: `PdfBookFactory`) no dev server.
- **Desenhar dentro da `.textLayer` do pdf.js**: o CSS dele atinge tudo ali — `span` vira `position:absolute; color:transparent`, e filho direto ganha `font-size: calc(var(--text-scale-factor) * var(--font-height))` + `transform` (especificidade 0,2,0). Use seletores `.textLayer > .classe` e resete `span`. Para tamanhos visuais, meça a escala real (iframe da página × transform da camada); não suponha `devicePixelRatio`.
- **Modo texto = documento HTML**: o paginator usa `section.loadContent()` em `iframe.srcdoc` (HTML). Sem `loadContent` ele carrega o blob XHTML como XML e o EpubViewer quebra ao injetar HTML (R-048). Ao parsear para conversão de CFI, use `text/html` também.
- **E2E de TTS no navegador**: troque `window.speechSynthesis` por um falso com `page.addInitScript` ANTES de carregar o harness (o plugin web do TTS guarda a referência no construtor). O falso precisa: `speak()` chamar `onend` depois de um tempo, `cancel()` chamar o `onend` da fala interrompida (o plugin cancela antes de cada fala) e `getVoices()` devolver `[]`. Botão de iniciar: `[aria-label="Start reading"]` (clique via DOM — o chrome pode estar recolhido). Ver `scripts/verificacao-visual/pdf-tts.check.js`.
- **E2E de highlight**: (1) a `HighlightComposerSheet` fica SEMPRE montada (fora da tela quando fechada) — `isVisible()` do Playwright diz true mesmo fechada; confira pela posição (`getBoundingClientRect().top` < altura da tela) ou pelo efeito (banco). (2) Clique sintético nos menus do `EpubViewer` precisa de `clientX/clientY` do botão: ele acha o botão por hit-test (o alvo vem do realm do iframe). (3) Para escolher parágrafo visível no modo texto, some a posição do iframe da seção à do parágrafo. (4) Botão Salvar da caixa fica abaixo da dobra no viewport móvel: clique pelo DOM. Ver `scripts/verificacao-visual/pdf-highlight.check.js`.
- **Heredoc no Bash tool**: scripts Python longos em heredoc falharam algumas vezes com "unexpected EOF while looking for matching `''" — grave o script num arquivo do scratchpad e rode com `python arquivo.py`.
