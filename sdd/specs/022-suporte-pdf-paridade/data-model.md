# Data Model: Suporte a PDF com paridade de recursos do EPUB

Nenhuma tabela nova e **nenhuma nova `version()` do Dexie** — todos os campos
novos são opcionais e não indexados (precedente: `Highlight.style`/`note`).
Registros existentes (todos EPUB) continuam válidos sem migração.

## `Book` (`src/types/book.ts`, tabela `books`)

| Campo | Mudança | Notas |
| --- | --- | --- |
| `format?: BookFormat` | `BookFormat = 'EPUB' \| 'PDF'` | Já indexado desde a v13. Ausente = `'EPUB'` (fallback existente em `db/books.ts`, `useLibraryCatalog.ts`). |
| `pdfTextLayer?: 'full' \| 'partial' \| 'none'` | **novo**, não indexado | Detectado no import por amostragem de páginas (R-009). Só existe em PDF. `'none'` → aviso de FR-014 e modo texto indisponível. |
| `pageCount?: number` | **novo**, não indexado | Só PDF. Usado para % de progresso e aviso de "PDF grande" (FR-016). |
| `detectedLanguage?: string \| null` | **novo**, não indexado | Só PDF (DI-012). Idioma dos metadados do PDF ou detectado no import; `null`/ausente = indefinido. Nunca sobrescreve `BookSettings.bookLanguage` (escolha manual). |

## `BookInfoSource` (`src/types/bookInfo.ts`)

| Mudança | Notas |
| --- | --- |
| `+ 'pdf-metadata'` | Origem dos dados do `PdfBookInfoProvider` (DI-013). Rótulo "PDF" na tela de Detalhes (mapa `labels` em `BookDetailsScreen.tsx`). |

## `BookSettings` (tabela `bookSettings`)

| Campo | Mudança | Notas |
| --- | --- | --- |
| `pdfReadingMode?: 'page' \| 'text'` | **novo**, não indexado | Último modo usado por livro (FR-008). Ausente = `'page'`. |

## Localizador PDF (`src/utils/pdfLocator.ts`)

Endereço de um ponto do PDF que vale nos dois modos e sobrevive a mudanças na
heurística de parágrafos (DI-005).

- **Texto bruto da página**: concatenação de `item.str` dos itens de
  `page.getTextContent()` na ordem devolvida pelo pdf.js, inserindo `\n` após
  itens com `hasEOL`. Nenhuma outra normalização (versão 1).
- **Ponto**: `neopdf:v1;p=<pageIndex>;o=<offset>` — `pageIndex` 0-based,
  `offset` em unidades UTF-16 no texto bruto da página.
- **Intervalo**: `neopdf:v1;p=<p1>;o=<o1>,p=<p2>;o=<o2>` (fim exclusivo).
- **Página sem texto**: `o=0`.
- Ordenação: por `(pageIndex, offset)`. Igualdade: comparação estrutural.

Onde é gravado (DI-006), apenas para livros PDF:

| Entidade | Campo | Conteúdo |
| --- | --- | --- |
| `ReadingProgress` | `cfi` | ponto |
| `Bookmark` | `cfi` | ponto (início do parágrafo); `syncKey` = hash da string (fallback já existente) |
| `Highlight` | `cfi` | intervalo |
| `Highlight` | `paraCfi` | ponto do início do parágrafo de origem |
| `Highlight` | `sectionIndex` | índice do **trecho** (DI-009), não da página |

`percentage` continua 0–100, calculado como `(pageIndex + fração do offset na página) / pageCount`.

## Trecho (`src/utils/pdfChunks.ts`)

Unidade de seção compartilhada pelos dois modos (DI-009).

- `{ index, startPage, endPage (inclusivo), label }`
- Com sumário: um trecho por item de nível 1 do outline (ordenado por página);
  trechos com mais de 40 páginas são subdivididos em blocos de 20.
- Sem sumário: blocos de 20 páginas, rótulo "Páginas X–Y".

## Parágrafo reconstruído (`src/utils/pdfParagraphs.ts`)

Saída da função pura (DI-007), não persistida.

- `{ kind: 'paragraph' | 'heading' | 'figure', text, pageIndex, ranges: Array<{ pageIndex, start, end }>, level? }`
- `ranges` apontam para o texto bruto (podem cruzar para a página seguinte).
- `figure`: região sem texto relevante (imagem/tabela/fórmula) → placeholder no modo texto (FR-009).

## OPDS (`src/services/opds/`)

| Tipo | Mudança |
| --- | --- |
| Entrada do catálogo | ganha `acquisitionFormat: 'EPUB' \| 'PDF'`; o parser escolhe EPUB quando houver os dois (FR-017). |
| Download | o `File` criado usa o MIME do formato real (detectado por magic bytes após baixar, DI-011). |
