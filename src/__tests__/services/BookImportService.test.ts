import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  addBook: vi.fn(),
  saveBookCover: vi.fn(),
  saveBookInfo: vi.fn(),
  parseMetadata: vi.fn(),
  collectBookInfo: vi.fn(),
  invalidateExtrasCache: vi.fn(),
  transaction: vi.fn(),
}))

vi.mock('@/db/books', () => ({
  addBook: mocks.addBook,
}))

vi.mock('@/db/bookCovers', () => ({
  saveBookCover: mocks.saveBookCover,
}))

vi.mock('@/db/bookInfo', () => ({
  saveBookInfo: mocks.saveBookInfo,
}))

vi.mock('@/db/database', () => ({
  db: {
    books: { name: 'books' },
    bookCovers: { name: 'bookCovers' },
    transaction: mocks.transaction,
  },
}))

vi.mock('@/services/EpubService', () => ({
  EpubService: {
    parseMetadata: mocks.parseMetadata,
    invalidateExtrasCache: mocks.invalidateExtrasCache,
  },
}))

vi.mock('@/services/bookInfo', () => ({
  BookInfoService: vi.fn(function BookInfoServiceMock() {
    return {
    collect: mocks.collectBookInfo,
    }
  }),
}))

import { BookImportService } from '@/services/BookImportService'

describe('BookImportService', () => {
  beforeEach(() => {
    mocks.addBook.mockReset()
    mocks.saveBookCover.mockReset()
    mocks.saveBookInfo.mockReset()
    mocks.parseMetadata.mockReset()
    mocks.collectBookInfo.mockReset()
    mocks.invalidateExtrasCache.mockReset()
    mocks.transaction.mockReset()
    mocks.transaction.mockImplementation((...args: unknown[]) => {
      const scope = args.at(-1)
      if (typeof scope !== 'function') throw new Error('transaction scope ausente')
      return scope()
    })
    mocks.collectBookInfo.mockResolvedValue({
      category: null,
      rating: null,
      synopsis: null,
      pageCount: null,
      publishedDate: null,
      universalIdentifier: null,
      reviews: null,
      lookupHints: {
        title: 'Imported Book',
        author: 'Imported Author',
        identifiers: [],
      },
    })
  })

  it('centraliza a importação e salva a capa extraída em storage separado', async () => {
    const file = new File(['epub'], 'book.epub', { type: 'application/epub+zip' })
    const coverBlob = new Blob(['cover'], { type: 'image/jpeg' })

    mocks.parseMetadata.mockResolvedValue({
      title: 'Imported Book',
      author: 'Imported Author',
      coverBlob,
    })
    mocks.addBook.mockResolvedValue(42)

    const bookId = await BookImportService.importEpub(file)

    expect(bookId).toBe(42)
    expect(mocks.transaction).toHaveBeenCalledTimes(1)
    expect(mocks.addBook).toHaveBeenCalledWith(expect.objectContaining({
      title: 'Imported Book',
      author: 'Imported Author',
      fileBlob: file,
      lastOpenedAt: null,
    }))
    expect(mocks.saveBookCover).toHaveBeenCalledWith(42, coverBlob, 'epub-extracted')
    expect(mocks.collectBookInfo).toHaveBeenCalledWith(file, {
      lookupHints: {
        title: 'Imported Book',
        author: 'Imported Author',
        identifiers: [],
      },
    })
    expect(mocks.saveBookInfo).toHaveBeenCalledWith(42, expect.objectContaining({
      lookupHints: expect.objectContaining({
        title: 'Imported Book',
      }),
    }))
  })

  it('não cria registro de capa quando o EPUB não expõe nenhuma imagem de capa', async () => {
    const file = new File(['epub'], 'book.epub', { type: 'application/epub+zip' })

    mocks.parseMetadata.mockResolvedValue({
      title: 'Sem capa',
      author: 'Autor',
      coverBlob: null,
    })
    mocks.addBook.mockResolvedValue(7)

    await BookImportService.importEpub(file)

    expect(mocks.addBook).toHaveBeenCalledTimes(1)
    expect(mocks.saveBookCover).not.toHaveBeenCalled()
  })

  it('mantem a importacao quando o enriquecimento de metadados falha', async () => {
    const file = new File(['epub'], 'book.epub', { type: 'application/epub+zip' })

    mocks.parseMetadata.mockResolvedValue({
      title: 'Livro',
      author: 'Autor',
      coverBlob: null,
    })
    mocks.addBook.mockResolvedValue(11)
    mocks.collectBookInfo.mockRejectedValue(new Error('network failed'))

    await expect(BookImportService.importEpub(file)).resolves.toBe(11)

    expect(mocks.saveBookInfo).not.toHaveBeenCalled()
  })

  it('reextrai e atualiza a capa de um livro já salvo sem duplicar lógica na UI', async () => {
    const book = {
      id: 9,
      title: 'Stored Book',
      fileBlob: new Blob(['epub'], { type: 'application/epub+zip' }),
    }
    const coverBlob = new Blob(['cover'], { type: 'image/png' })

    mocks.parseMetadata.mockResolvedValue({
      title: 'Stored Book',
      author: 'Author',
      coverBlob,
    })

    const hasCover = await BookImportService.reextractCover(book)

    expect(hasCover).toBe(true)
    expect(mocks.saveBookCover).toHaveBeenCalledWith(9, coverBlob, 'epub-extracted')
  })

  it('marca capas manuais com a origem correta', async () => {
    const coverBlob = new Blob(['manual'], { type: 'image/png' })

    await BookImportService.updateManualCover(15, coverBlob)

    expect(mocks.saveBookCover).toHaveBeenCalledWith(15, coverBlob, 'manual-upload')
  })
})
