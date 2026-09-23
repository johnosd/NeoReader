# Contrato: plugin nativo Android (`NeoReaderLibraryPlugin`) aceitando PDF

Superfície JS ↔ Java usada por `src/services/NativeLibraryImportService.ts`.
Os **nomes dos métodos não mudam** (DI-001) — `*Epub*` passa a significar
"livro"; cada método ganha um comentário curto dizendo que também trata PDF.
Para EPUB, entradas e saídas continuam byte a byte iguais.

| Método | Hoje | Mudança |
| --- | --- | --- |
| `selectEpubFile()` | `EXTRA_MIME_TYPES = ["application/epub+zip", ...]` | Acrescenta `"application/pdf"`. |
| `selectEpubFolder()` | lista arquivos terminados em `.epub` (`collectEpubFiles*`) | Lista também `.pdf`. Cada item ganha `format: 'EPUB' \| 'PDF'` (pela extensão — só listagem; o formato real é confirmado no prepare). |
| `prepareLocalEpubImport({ uri, name, ... })` | copia para `booksDir/<sha256>.epub` e roda `inspectEpub` (metadados + capa) | Detecta formato pelos primeiros bytes (`%PDF-` / ZIP). **PDF**: copia para `booksDir/<sha256>.pdf`, não roda `inspectEpub`, renderiza a capa da página 1 com `PdfRenderer` (teto 2000 px), devolve `{ format: 'PDF', sha256, size, localUri, cover, pageCount, metadata: { title: <nome do arquivo sem extensão> } }`. PDF com senha → rejeita com código `PDF_PASSWORD_PROTECTED`; ilegível → `PDF_INVALID` (FR-015). **EPUB**: inalterado, mas a resposta ganha `format: 'EPUB'`. |
| `consumePendingExternalEpubIntent()` / evento `externalEpubIntent` | só aceita `application/epub+zip` ou `.epub` (`ExternalEpubIntentStore.isSupportedEpub`) | Aceita também `application/pdf` ou `.pdf`. |

`AndroidManifest.xml`: o intent-filter de VIEW ganha
`<data android:mimeType="application/pdf" />` ao lado do EPUB.

## Lado JS

- `NativeLibraryImportService.fileFromChunks()` cria o `File` com o MIME do
  formato real (hoje fixo em `application/epub+zip`).
- `BookImportService` lê `format` da resposta do prepare; ausente = `'EPUB'`
  (compatível com builds antigos do app durante o desenvolvimento).

## Verificação

`src/__tests__/services/NativeLibraryImportService.test.ts` (mock do plugin)
cobre as respostas PDF/EPUB; o comportamento Java é validado no device
(quickstart § Import).
