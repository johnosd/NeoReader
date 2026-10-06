import { beforeEach, describe, expect, it, vi } from 'vitest'

// Casos de PDF do BookImportService (feature 022). Os casos de EPUB continuam em BookImportService.test.ts,
// que não foi alterado — este arquivo prova que PDF desvia só onde deve e que EPUB segue o caminho de sempre.

const mocks = vi.hoisted(() => ({
  addBook: vi.fn(),
  saveBookCover: vi.fn(),
  saveBookInfo: vi.fn(),
  saveSourceFolder: vi.fn(),
  epubParseMetadata: vi.fn(),
  pdfParseMetadata: vi.fn(),
  collectBookInfo: vi.fn(),
  fetchLocalFile: vi.fn(),
  prepareLocalEpubImport: vi.fn(),
  deleteLocalBookFile: vi.fn(),
  transaction: vi.fn(),
  booksToArray: vi.fn(),
  restoreBookBookmarksFromDrive: vi.fn(),
  resolveEpubFile: vi.fn(),
}))

vi.mock('@/db/books', () => ({ addBook: mocks.addBook }))
vi.mock('@/db/bookCovers', () => ({ saveBookCover: mocks.saveBookCover }))
vi.mock('@/db/bookInfo', () => ({ saveBookInfo: mocks.saveBookInfo }))
vi.mock('@/db/sourceFolders', () => ({ saveSourceFolder: mocks.saveSourceFolder }))
vi.mock('@/db/database', () => ({
  db: {
    books: { name: 'books', toArray: mocks.booksToArray },
    bookCovers: { name: 'bookCovers' },
    transaction: mocks.transaction,
  },
}))
vi.mock('@/services/EpubService', () => ({
  EpubService: { parseMetadata: mocks.epubParseMetadata, invalidateExtrasCache: vi.fn() },
}))
vi.mock('@/services/pdf/PdfService', () => ({ PdfService: { parseMetadata: mocks.pdfParseMetadata } }))
vi.mock('@/services/bookInfo', () => ({
  BookInfoService: vi.fn(function BookInfoServiceMock() {
    return { collect: mocks.collectBookInfo }
  }),
}))
vi.mock('@/services/BookFileResolver', () => ({
  BookFileResolver: { fetchLocalFile: mocks.fetchLocalFile, resolveEpubFile: mocks.resolveEpubFile },
}))
vi.mock('@/services/NativeLibraryImportService', () => ({
  NATIVE_FILE_READ_TIMEOUT_MS: 300_000,
  readNativeFolderFile: vi.fn(),
  prepareLocalEpubImport: mocks.prepareLocalEpubImport,
  deleteLocalBookFile: mocks.deleteLocalBookFile,
}))
vi.mock('@/services/BookmarkDriveRestoreService', () => ({
  restoreBookBookmarksFromDrive: mocks.restoreBookBookmarksFromDrive,
}))
vi.mock('@/utils/imageResize', () => ({
  resizeCoverBlob: (blob: Blob) => Promise.resolve(blob),
}))

import { BookImportService } from '@/services/BookImportService'
import { PdfImportError } from '@/services/pdf/PdfImportError'

const pdfFile = (name = 'livro.pdf', body = '%PDF-1.7\n...') => new File([body], name, { type: 'application/pdf' })
const coverBlob = new Blob(['cover'], { type: 'image/png' })

const parsedPdf = (overrides: Record<string, unknown> = {}) => ({
  title: 'Livro PDF',
  author: 'Autora',
  coverBlob,
  pageCount: 120,
  pdfTextLayer: 'full',
  detectedLanguage: 'pt-BR',
  ...overrides,
})

const preparedNativePdf = (overrides: Record<string, unknown> = {}) => ({
  importId: 'native-1',
  format: 'PDF',
  name: 'nativo.pdf',
  path: 'Pasta/nativo.pdf',
  size: 2048,
  sha256: 'abc123',
  localUri: 'file:///data/books/abc123.pdf',
  originalUri: 'content://docs/nativo',
  metadata: { title: 'nativo', author: '' },
  diagnostics: { copyMs: 1, inspectMs: 0, bytesCopied: 2048, localFileExisted: false },
  ...overrides,
})

beforeEach(() => {
  for (const mock of Object.values(mocks)) mock.mockReset()
  mocks.booksToArray.mockResolvedValue([])
  mocks.saveSourceFolder.mockResolvedValue(3)
  mocks.deleteLocalBookFile.mockResolvedValue(true)
  mocks.addBook.mockResolvedValue(77)
  mocks.restoreBookBookmarksFromDrive.mockResolvedValue({ restoredCount: 0, mergedCount: 0, remoteBookmarkCount: 0 })
  mocks.transaction.mockImplementation((...args: unknown[]) => (args.at(-1) as () => unknown)())
  mocks.collectBookInfo.mockResolvedValue({ lookupHints: { title: 'x', author: 'y', identifiers: [] } })
  mocks.pdfParseMetadata.mockResolvedValue(parsedPdf())
  mocks.epubParseMetadata.mockResolvedValue({ title: 'EPUB', author: 'Autor', coverBlob })
  mocks.fetchLocalFile.mockResolvedValue(new Blob(['%PDF-1.7']))
})

describe('importação web de PDF', () => {
  it('detecta PDF pelo conteúdo e grava formato, camada de texto, páginas, idioma e capa', async () => {
    const file = pdfFile()

    await expect(BookImportService.importEpub(file)).resolves.toBe(77)

    expect(mocks.pdfParseMetadata).toHaveBeenCalledWith(file, 'livro.pdf')
    expect(mocks.epubParseMetadata).not.toHaveBeenCalled()
    expect(mocks.addBook).toHaveBeenCalledWith(expect.objectContaining({
      title: 'Livro PDF',
      author: 'Autora',
      format: 'PDF',
      pdfTextLayer: 'full',
      pageCount: 120,
      detectedLanguage: 'pt-BR',
      storageMode: 'embedded',
      fileName: 'livro.pdf',
      fileBlob: file,
    }))
    expect(mocks.saveBookCover).toHaveBeenCalledWith(77, coverBlob, 'pdf-rendered')
  })

  it('usa o PDF mesmo que a extensão seja .epub (decide pelos bytes)', async () => {
    await BookImportService.importEpub(pdfFile('disfarçado.epub'))
    expect(mocks.pdfParseMetadata).toHaveBeenCalled()
    expect(mocks.addBook).toHaveBeenCalledWith(expect.objectContaining({ format: 'PDF' }))
  })

  it('arquivo .pdf que não é PDF de verdade vira PDF_INVALID (mensagem clara), sem tentar o parser de EPUB', async () => {
    const fake = new File(['isto é só texto'], 'falso.pdf')

    await expect(BookImportService.importEpub(fake)).rejects.toMatchObject({ code: 'PDF_INVALID' })

    expect(mocks.epubParseMetadata).not.toHaveBeenCalled()
    expect(mocks.pdfParseMetadata).not.toHaveBeenCalled()
    expect(mocks.addBook).not.toHaveBeenCalled()
  })

  it('arquivo .epub com conteúdo desconhecido segue o caminho EPUB de sempre (que dá o erro dele)', async () => {
    mocks.epubParseMetadata.mockRejectedValue(new Error('invalid zip data'))
    await expect(BookImportService.importEpub(new File(['lixo'], 'falso.epub'))).rejects.toThrow('invalid zip data')
    expect(mocks.epubParseMetadata).toHaveBeenCalled()
  })

  it('PDF sem capa não cria registro de capa', async () => {
    mocks.pdfParseMetadata.mockResolvedValue(parsedPdf({ coverBlob: null }))
    await BookImportService.importEpub(pdfFile())
    expect(mocks.saveBookCover).not.toHaveBeenCalled()
  })

  it('PDF escaneado importa com pdfTextLayer none e idioma indefinido', async () => {
    mocks.pdfParseMetadata.mockResolvedValue(parsedPdf({ pdfTextLayer: 'none', detectedLanguage: null }))
    await BookImportService.importEpub(pdfFile())
    expect(mocks.addBook).toHaveBeenCalledWith(expect.objectContaining({ pdfTextLayer: 'none', detectedLanguage: null }))
  })

  it('detecta duplicado como no EPUB e não grava nada', async () => {
    const file = pdfFile()
    mocks.booksToArray.mockResolvedValue([{ id: 1, title: 'Outro', author: 'Outro', fileName: 'livro.pdf', fileSize: file.size }])

    await expect(BookImportService.importEpub(file)).rejects.toThrow('Este livro ja esta na biblioteca.')

    expect(mocks.addBook).not.toHaveBeenCalled()
    expect(mocks.saveBookCover).not.toHaveBeenCalled()
  })

  it.each(['PDF_PASSWORD_PROTECTED', 'PDF_INVALID'] as const)('%s: recusa sem criar livro nem capa', async (code) => {
    mocks.pdfParseMetadata.mockRejectedValue(new PdfImportError(code))

    await expect(BookImportService.importEpub(pdfFile())).rejects.toMatchObject({ code })

    expect(mocks.addBook).not.toHaveBeenCalled()
    expect(mocks.saveBookCover).not.toHaveBeenCalled()
  })
})

describe('EPUB continua pelo caminho de sempre', () => {
  it('arquivo que não é PDF vai para o EpubService e o livro não ganha campos de PDF', async () => {
    const file = new File(['PK\u0003\u0004epub'], 'book.epub', { type: 'application/epub+zip' })

    await BookImportService.importEpub(file)

    expect(mocks.epubParseMetadata).toHaveBeenCalledWith(file)
    expect(mocks.pdfParseMetadata).not.toHaveBeenCalled()
    const saved = mocks.addBook.mock.calls[0][0]
    expect(saved.format).toBe('EPUB')
    expect(saved).not.toHaveProperty('pdfTextLayer')
    expect(saved).not.toHaveProperty('pageCount')
    expect(saved).not.toHaveProperty('detectedLanguage')
    expect(mocks.saveBookCover).toHaveBeenCalledWith(77, coverBlob, 'epub-extracted')
  })
})

describe('prévia de importação (arquivos e pasta)', () => {
  it('web: .pdf é suportado e identificado como PDF; outros formatos seguem recusados', async () => {
    const items = await BookImportService.buildImportPreview([
      pdfFile('a.pdf'),
      new File(['x'], 'b.epub'),
      new File(['x'], 'c.mobi'),
    ])
    expect(items.map((i) => [i.fileName, i.format, i.supported, i.selected])).toEqual([
      ['a.pdf', 'PDF', true, true],
      ['b.epub', 'EPUB', true, true],
      ['c.mobi', 'UNSUPPORTED', false, false],
    ])
  })

  it('nativo (pasta): lista .pdf com o formato certo', async () => {
    const items = await BookImportService.buildNativeImportPreview([
      { name: 'a.PDF', uri: 'content://a', size: 10 },
      { name: 'b.epub', uri: 'content://b', size: 10 },
      { name: 'c.txt', uri: 'content://c', size: 10 },
    ])
    expect(items.map((i) => [i.fileName, i.format, i.supported])).toEqual([
      ['a.PDF', 'PDF', true],
      ['b.epub', 'EPUB', true],
      ['c.txt', 'UNSUPPORTED', false],
    ])
  })
})

describe('importação nativa de PDF', () => {
  const nativeFile = { name: 'nativo.pdf', uri: 'content://docs/nativo', path: 'Pasta/nativo.pdf', size: 2048 }

  it('abre a cópia local no JS (pdf.js) e salva como arquivo local privado', async () => {
    mocks.prepareLocalEpubImport.mockResolvedValue(preparedNativePdf())

    await expect(BookImportService.importNativeEpub(nativeFile)).resolves.toBe(77)

    expect(mocks.fetchLocalFile).toHaveBeenCalledWith('file:///data/books/abc123.pdf')
    expect(mocks.pdfParseMetadata).toHaveBeenCalledWith(expect.any(Blob), 'nativo.pdf', { skipCover: false })
    expect(mocks.addBook).toHaveBeenCalledWith(expect.objectContaining({
      title: 'Livro PDF',
      author: 'Autora',
      format: 'PDF',
      pageCount: 120,
      pdfTextLayer: 'full',
      storageMode: 'local',
      fileBlob: undefined,
      uri: 'file:///data/books/abc123.pdf',
      originalUri: 'content://docs/nativo',
      fileHash: 'abc123',
    }))
  })

  it('prefere a capa renderizada pelo plugin (PdfRenderer) à do pdf.js', async () => {
    mocks.prepareLocalEpubImport.mockResolvedValue(
      preparedNativePdf({ cover: { base64: btoa('native-cover'), mimeType: 'image/jpeg' } }),
    )

    await BookImportService.importNativeEpub(nativeFile)

    const [, savedCover] = mocks.saveBookCover.mock.calls[0]
    expect(savedCover.type).toBe('image/jpeg')
    expect(savedCover).not.toBe(coverBlob)
  })

  it('PDF recusado depois da cópia: apaga a cópia local e não cria livro', async () => {
    mocks.prepareLocalEpubImport.mockResolvedValue(preparedNativePdf())
    mocks.pdfParseMetadata.mockRejectedValue(new PdfImportError('PDF_PASSWORD_PROTECTED'))

    await expect(BookImportService.importNativeEpub(nativeFile)).rejects.toMatchObject({ code: 'PDF_PASSWORD_PROTECTED' })

    expect(mocks.deleteLocalBookFile).toHaveBeenCalledWith('file:///data/books/abc123.pdf')
    expect(mocks.addBook).not.toHaveBeenCalled()
  })

  it('não apaga a cópia local se ela já existia antes (livro igual já importado)', async () => {
    mocks.prepareLocalEpubImport.mockResolvedValue(
      preparedNativePdf({ diagnostics: { copyMs: 0, inspectMs: 0, bytesCopied: 0, localFileExisted: true } }),
    )
    mocks.pdfParseMetadata.mockRejectedValue(new PdfImportError('PDF_INVALID'))

    await expect(BookImportService.importNativeEpub(nativeFile)).rejects.toMatchObject({ code: 'PDF_INVALID' })

    expect(mocks.deleteLocalBookFile).not.toHaveBeenCalled()
  })

  it('duplicado por hash é detectado antes de abrir o PDF', async () => {
    mocks.prepareLocalEpubImport.mockResolvedValue(preparedNativePdf())
    mocks.booksToArray.mockResolvedValue([{ id: 1, fileHash: 'abc123' }])

    await expect(BookImportService.importNativeEpub(nativeFile)).rejects.toThrow('Este livro ja esta na biblioteca.')

    expect(mocks.pdfParseMetadata).not.toHaveBeenCalled()
    expect(mocks.deleteLocalBookFile).toHaveBeenCalled()
  })

  it('lote misto: PDF recusado conta como erro e o resto do lote segue', async () => {
    const good = { name: 'ok.pdf', uri: 'content://ok', size: 10 }
    const bad = { name: 'senha.pdf', uri: 'content://senha', size: 10 }
    mocks.prepareLocalEpubImport
      .mockResolvedValueOnce(preparedNativePdf({ name: 'senha.pdf', sha256: 'h1', localUri: 'file:///h1.pdf' }))
      .mockResolvedValueOnce(preparedNativePdf({ name: 'ok.pdf', sha256: 'h2', localUri: 'file:///h2.pdf' }))
    mocks.pdfParseMetadata
      .mockRejectedValueOnce(new PdfImportError('PDF_PASSWORD_PROTECTED'))
      .mockResolvedValueOnce(parsedPdf())

    const items = await BookImportService.buildNativeImportPreview([bad, good])
    const summary = await BookImportService.importSelectedBooks({
      items,
      tagIds: [],
      sourceFolder: { folderName: 'Pasta', folderUri: 'content://pasta', includeSubfolders: false, autoImportEnabled: false },
    })

    expect(summary).toMatchObject({ imported: 1, errors: 1 })
    expect(mocks.addBook).toHaveBeenCalledTimes(1)
  })
})

describe('reextractCover', () => {
  it('PDF: reabre o arquivo com o PdfService e grava a capa como pdf-rendered', async () => {
    const book = { id: 9, title: 'PDF', format: 'PDF' as const, fileBlob: new Blob(['%PDF-']) }
    const file = new File(['%PDF-'], 'x.pdf')
    mocks.resolveEpubFile.mockResolvedValue(file)

    await expect(BookImportService.reextractCover(book)).resolves.toBe(true)

    expect(mocks.pdfParseMetadata).toHaveBeenCalledWith(file, 'x.pdf')
    expect(mocks.epubParseMetadata).not.toHaveBeenCalled()
    expect(mocks.saveBookCover).toHaveBeenCalledWith(9, coverBlob, 'pdf-rendered')
  })
})
