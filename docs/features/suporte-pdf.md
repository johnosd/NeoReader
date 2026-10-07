# Suporte a PDF — arquitetura em uma página

Feature `022-suporte-pdf-paridade`. Spec, plano, decisões (DI-xxx), riscos (R-xxx)
e registro de execução em `sdd/specs/022-suporte-pdf-paridade/`. Este arquivo é só
o mapa; o porquê de cada decisão está lá.

## Objetivo e regra de ouro

PDF com os mesmos recursos do EPUB (Word Lens, tradução, TTS, highlights,
marcadores com sync), sem mudar nada no EPUB (FR-018). Qualquer mudança em código
compartilhado passa pelo corpus `npm run test:debug-epubs` e pelo checklist de
regressão do EPUB em `quickstart.md`.

## Fluxo

```text
arquivo ─► detectBookFormat (bytes: %PDF- ou ZIP)          src/utils/bookFormat.ts
        ─► importers/PdfBookImporter ─► PdfService          src/services/importers/, src/services/pdf/
           (metadados, capa da 1ª página, camada de texto, idioma)
        ─► books (format='PDF', pageCount, pdfTextLayer, detectedLanguage)

abrir   ─► usePdfReaderSession: UM PDFDocumentProxy por livro (DI-008)
        ├─ página fiel ─► PdfPageViewer (foliate-fxl, flow=scrolled)
        │                 página = <img> + camada de texto do pdf.js + recursos em reader/pdfPage/
        └─ modo texto  ─► PdfTextBookBuilder (parágrafos reconstruídos, pdfParagraphs)
                          ─► PdfTextModeViewer ─► o mesmo EpubViewer do EPUB (DI-003)
```

## Peças principais

| Peça | Papel |
| --- | --- |
| `src/utils/pdfParagraphs.ts` | Reconstrói parágrafos dos itens do pdf.js (colunas, hifenização, cabeçalho/rodapé repetidos). Implementação própria, sem código do Readest (FR-019). |
| Localizador `neopdf:v1;p=..;o=..` | Página + posição no texto bruto da página; um ponto ou um intervalo. Independe da heurística de parágrafos (DI-005) e é gravado no mesmo campo `cfi` de progresso, marcadores e highlights — por isso vale nos dois modos. |
| `src/services/pdf/PdfLocatorResolver.ts` | Converte localizador ↔ CFI do livro sintético do modo texto; `snapRangeToText` acerta o intervalo de um highlight pelo texto selecionado. |
| `src/components/reader/PdfPageViewer.tsx` | Página fiel: pinça, tema, sumário, marcador, tradução da frase tocada (painel na página), Word Lens, TTS sobre os parágrafos reconstruídos, highlights. Expõe o mesmo contrato de handle que o `EpubViewer`. |
| `src/components/reader/pdfPage/*` | Partes da página fiel: gestos, palavras, tradução, TTS, highlights, marcas de texto. |
| `src/screens/ReaderScreen.tsx` | Liga cada recurso pelas capacidades do viewer ativo, não pelo formato. Modo usado fica em `bookSettings.pdfReadingMode`. |
| `src/services/opds/*` | Entradas OPDS só-PDF aparecem e baixam; mistas preferem EPUB; formato do download decidido pelos bytes. |

## Restrições que moldaram o desenho

- **Iframe sem scripts** (sandbox do foliate em produção): `<canvas>` dentro dele fica
  em branco, então a página é uma `<img>`; menus, painéis e destaques são DOM
  criado pelo app dentro do documento da página.
- **Memória**: o PDF é lido sob demanda (`disableAutoFetch`) e só um número limitado
  de páginas renderizadas fica em memória. Meta: até 1000 páginas / 200 MB sem
  travar (FR-016); acima disso, abre com aviso.
- **Android**: tocar num botão desfaz a seleção antes do clique chegar, então a
  seleção do highlight fica guardada; o alvo do evento vem de outro realm, então os
  botões são achados por coordenada.

## Limitações conhecidas

- Sem OCR: PDF escaneado abre só na página fiel, com aviso.
- PDF com senha ou DRM é recusado na importação.
- Formulários e anotações nativas do PDF não são interativos; highlights não são
  gravados no arquivo.
- Na página fiel não dá para selecionar um trecho que atravesse duas páginas (cada
  página é um documento); a seleção é feita no modo texto (R-053).
- Web: só Chromium é garantido.

## Como testar

- Unitários e de contrato: `npm test` (inclui `PdfPageViewer.contract.test.tsx`).
- Navegador real (Playwright MCP): scripts em `scripts/verificacao-visual/`
  (`pdf-*.check.js`) sobre o harness `harness/e2e.html`.
- Device: `sdd/specs/022-suporte-pdf-paridade/quickstart.md`.

Referência conceitual (não é código usado): `docs/features/pdf_support_report.md`
(análise do Readest, AGPL-3.0).
