import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  addBook: vi.fn(),
  saveBookCover: vi.fn(),
  saveBookInfo: vi.fn(),
  saveSourceFolder: vi.fn(),
  parseMetadata: vi.fn(),
  collectBookInfo: vi.fn(),
  invalidateExtrasCache: vi.fn(),
  readNativeFolderFile: vi.fn(),
  transaction: vi.fn(),
  booksToArray: vi.fn(),
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

vi.mock('@/db/sourceFolders', () => ({
  saveSourceFolder: mocks.saveSourceFolder,
}))

vi.mock('@/db/database', () => ({
  db: {
    books: { name: 'books', toArray: mocks.booksToArray },
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

vi.mock('@/services/NativeLibraryImportService', () => ({
  readNativeFolderFile: mocks.readNativeFolderFile,
}))

import { BookImportService } from '@/services/BookImportService'

describe('BookImportService', () => {
  beforeEach(() => {
    mocks.addBook.mockReset()
    mocks.saveBookCover.mockReset()
    mocks.saveBookInfo.mockReset()
    mocks.saveSourceFolder.mockReset()
    mocks.parseMetadata.mockReset()
    mocks.collectBookInfo.mockReset()
    mocks.invalidateExtrasCache.mockReset()
    mocks.readNativeFolderFile.mockReset()
    mocks.transaction.mockReset()
    mocks.booksToArray.mockReset()
    mocks.booksToArray.mockResolvedValue([])
    mocks.saveSourceFolder.mockResolvedValue(3)
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

  it('bloqueia importacao individual quando o livro ja existe', async () => {
    const file = new File(['epub'], 'book.epub', { type: 'application/epub+zip' })

    mocks.parseMetadata.mockResolvedValue({
      title: 'Livro duplicado',
      author: 'Autor',
      coverBlob: null,
    })
    mocks.booksToArray.mockResolvedValue([
      {
        id: 1,
        title: 'Outro titulo',
        author: 'Outro autor',
        fileName: 'book.epub',
        fileSize: file.size,
      },
    ])

    await expect(BookImportService.importEpub(file)).rejects.toThrow('Este livro ja esta na biblioteca.')

    expect(mocks.addBook).not.toHaveBeenCalled()
    expect(mocks.saveBookCover).not.toHaveBeenCalled()
  })

  it('marca capas manuais com a origem correta', async () => {
    const coverBlob = new Blob(['manual'], { type: 'image/png' })

    await BookImportService.updateManualCover(15, coverBlob)

    expect(mocks.saveBookCover).toHaveBeenCalledWith(15, coverBlob, 'manual-upload')
  })

  it('salva importacao nativa como blob embedded e preserva a URI de origem', async () => {
    const file = new File(['native epub'], 'native.epub', { type: 'application/epub+zip' })
    const nativeFile = {
      name: 'native.epub',
      uri: 'content://books/native',
      path: 'Folder/native.epub',
      size: file.size,
    }

    mocks.readNativeFolderFile.mockResolvedValue(file)
    mocks.parseMetadata.mockResolvedValue({
      title: 'Native Book',
      author: 'Native Author',
      coverBlob: null,
    })
    mocks.addBook.mockResolvedValue(51)

    await expect(BookImportService.importNativeEpub(nativeFile)).resolves.toBe(51)

    expect(mocks.addBook).toHaveBeenCalledWith(expect.objectContaining({
      title: 'Native Book',
      author: 'Native Author',
      fileBlob: file,
      storageMode: 'embedded',
      fileName: 'native.epub',
      filePath: 'Folder/native.epub',
      uri: 'content://books/native',
    }))
  })

  it('ignora duplicado ja existente durante importacao em lote sem abortar os demais', async () => {
    const duplicate = new File(['duplicate'], 'duplicate.epub', { type: 'application/epub+zip' })
    const fresh = new File(['fresh'], 'fresh.epub', { type: 'application/epub+zip' })

    mocks.booksToArray.mockResolvedValue([{
      id: 1,
      title: 'Existing',
      author: 'Author',
      fileName: 'existing.epub',
      fileSize: 1,
      fileHash: 'same-hash',
    }])
    mocks.parseMetadata.mockResolvedValue({
      title: 'Fresh',
      author: 'Author',
      coverBlob: null,
    })
    mocks.addBook.mockResolvedValue(61)

    const summary = await BookImportService.importSelectedBooks({
      items: [
        {
          id: 'duplicate',
          file: duplicate,
          fileName: duplicate.name,
          fileSize: duplicate.size,
          format: 'EPUB',
          supported: true,
          duplicate: false,
          selected: true,
          fileHash: 'same-hash',
        },
        {
          id: 'fresh',
          file: fresh,
          fileName: fresh.name,
          fileSize: fresh.size,
          format: 'EPUB',
          supported: true,
          duplicate: false,
          selected: true,
          fileHash: 'new-hash',
        },
      ],
      tagIds: [],
      sourceFolder: {
        folderName: 'Folder',
        folderUri: 'folder-uri',
        includeSubfolders: true,
        autoImportEnabled: false,
      },
    })

    expect(summary).toEqual({
      imported: 1,
      duplicate: 1,
      unsupported: 0,
      errors: 0,
    })
    expect(mocks.booksToArray).toHaveBeenCalledTimes(1)
    expect(mocks.addBook).toHaveBeenCalledTimes(1)
    expect(mocks.addBook).toHaveBeenCalledWith(expect.objectContaining({
      fileName: 'fresh.epub',
      storageMode: 'embedded',
      fileBlob: fresh,
    }))
  })

  it('ignora duplicado dentro do proprio lote usando o indice em memoria', async () => {
    const first = new File(['first'], 'first.epub', { type: 'application/epub+zip' })
    const second = new File(['second'], 'second.epub', { type: 'application/epub+zip' })

    mocks.parseMetadata.mockResolvedValue({
      title: 'Same Book',
      author: 'Same Author',
      coverBlob: null,
    })
    mocks.addBook.mockResolvedValue(71)

    const summary = await BookImportService.importSelectedBooks({
      items: [
        {
          id: 'first',
          file: first,
          fileName: first.name,
          fileSize: first.size,
          format: 'EPUB',
          supported: true,
          duplicate: false,
          selected: true,
          fileHash: 'hash-one',
        },
        {
          id: 'second',
          file: second,
          fileName: second.name,
          fileSize: second.size,
          format: 'EPUB',
          supported: true,
          duplicate: false,
          selected: true,
          fileHash: 'hash-two',
        },
      ],
      tagIds: [],
      sourceFolder: {
        folderName: 'Folder',
        folderUri: 'folder-uri',
        includeSubfolders: true,
        autoImportEnabled: false,
      },
    })

    expect(summary.imported).toBe(1)
    expect(summary.duplicate).toBe(1)
    expect(mocks.addBook).toHaveBeenCalledTimes(1)
    expect(mocks.booksToArray).toHaveBeenCalledTimes(1)
  })

  it('contabiliza erro de um EPUB sem interromper o lote', async () => {
    const broken = new File(['broken'], 'broken.epub', { type: 'application/epub+zip' })
    const valid = new File(['valid'], 'valid.epub', { type: 'application/epub+zip' })

    mocks.parseMetadata
      .mockRejectedValueOnce(new Error('invalid epub'))
      .mockResolvedValueOnce({
        title: 'Valid Book',
        author: 'Valid Author',
        coverBlob: null,
      })
    mocks.addBook.mockResolvedValue(81)

    const summary = await BookImportService.importSelectedBooks({
      items: [
        {
          id: 'broken',
          file: broken,
          fileName: broken.name,
          fileSize: broken.size,
          format: 'EPUB',
          supported: true,
          duplicate: false,
          selected: true,
        },
        {
          id: 'valid',
          file: valid,
          fileName: valid.name,
          fileSize: valid.size,
          format: 'EPUB',
          supported: true,
          duplicate: false,
          selected: true,
        },
      ],
      tagIds: [],
      sourceFolder: {
        folderName: 'Folder',
        folderUri: 'folder-uri',
        includeSubfolders: true,
        autoImportEnabled: false,
      },
    })

    expect(summary).toEqual({
      imported: 1,
      duplicate: 0,
      unsupported: 0,
      errors: 1,
    })
    expect(mocks.addBook).toHaveBeenCalledTimes(1)
  })

  it('contabiliza arquivo selecionado nao suportado no resumo do lote', async () => {
    const summary = await BookImportService.importSelectedBooks({
      items: [{
        id: 'notes',
        fileName: 'notes.txt',
        fileSize: 12,
        format: 'UNSUPPORTED',
        supported: false,
        duplicate: false,
        selected: true,
      }],
      tagIds: [],
      sourceFolder: {
        folderName: 'Folder',
        folderUri: 'folder-uri',
        includeSubfolders: true,
        autoImportEnabled: false,
      },
    })

    expect(summary).toEqual({
      imported: 0,
      duplicate: 0,
      unsupported: 1,
      errors: 0,
    })
    expect(mocks.parseMetadata).not.toHaveBeenCalled()
    expect(mocks.addBook).not.toHaveBeenCalled()
  })

  it('mantem o lote importado quando o enriquecimento em background falha', async () => {
    const file = new File(['epub'], 'book.epub', { type: 'application/epub+zip' })

    mocks.parseMetadata.mockResolvedValue({
      title: 'Livro',
      author: 'Autor',
      coverBlob: null,
    })
    mocks.addBook.mockResolvedValue(91)
    mocks.collectBookInfo.mockRejectedValue(new Error('network failed'))

    const summary = await BookImportService.importSelectedBooks({
      items: [{
        id: 'book',
        file,
        fileName: file.name,
        fileSize: file.size,
        format: 'EPUB',
        supported: true,
        duplicate: false,
        selected: true,
      }],
      tagIds: [],
      sourceFolder: {
        folderName: 'Folder',
        folderUri: 'folder-uri',
        includeSubfolders: true,
        autoImportEnabled: false,
      },
    })

    expect(summary.imported).toBe(1)
    expect(summary.errors).toBe(0)
    expect(mocks.addBook).toHaveBeenCalledTimes(1)
  })
})
