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
  prepareLocalEpubImport: vi.fn(),
  deleteLocalBookFile: vi.fn(),
  transaction: vi.fn(),
  booksToArray: vi.fn(),
  restoreBookBookmarksFromDrive: vi.fn(),
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
  NATIVE_FILE_READ_TIMEOUT_MS: 300_000,
  readNativeFolderFile: mocks.readNativeFolderFile,
  prepareLocalEpubImport: mocks.prepareLocalEpubImport,
  deleteLocalBookFile: mocks.deleteLocalBookFile,
}))

vi.mock('@/services/BookmarkDriveRestoreService', () => ({
  restoreBookBookmarksFromDrive: mocks.restoreBookBookmarksFromDrive,
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
    mocks.prepareLocalEpubImport.mockReset()
    mocks.deleteLocalBookFile.mockReset()
    mocks.transaction.mockReset()
    mocks.booksToArray.mockReset()
    mocks.restoreBookBookmarksFromDrive.mockReset()
    mocks.booksToArray.mockResolvedValue([])
    mocks.saveSourceFolder.mockResolvedValue(3)
    mocks.deleteLocalBookFile.mockResolvedValue(true)
    mocks.restoreBookBookmarksFromDrive.mockResolvedValue({
      restoredCount: 0,
      mergedCount: 0,
      remoteBookmarkCount: 0,
    })
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
    expect(mocks.restoreBookBookmarksFromDrive).toHaveBeenCalledWith(42)
  })

  it('notifica a UI quando bookmarks sao restaurados depois da importacao individual', async () => {
    const file = new File(['epub'], 'book.epub', { type: 'application/epub+zip' })
    const onBookmarksRestored = vi.fn()

    mocks.parseMetadata.mockResolvedValue({
      title: 'Imported Book',
      author: 'Imported Author',
      coverBlob: null,
    })
    mocks.addBook.mockResolvedValue(42)
    mocks.restoreBookBookmarksFromDrive.mockResolvedValue({
      restoredCount: 3,
      mergedCount: 3,
      remoteBookmarkCount: 3,
    })

    await expect(BookImportService.importEpub(file, { onBookmarksRestored })).resolves.toBe(42)

    expect(mocks.restoreBookBookmarksFromDrive).toHaveBeenCalledWith(42)
    expect(onBookmarksRestored).toHaveBeenCalledWith(3)
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

  it('salva importacao nativa como arquivo local privado e preserva a URI original', async () => {
    const prepared = preparedNativeEpub({ size: 11 })
    const nativeFile = {
      name: 'native.epub',
      uri: 'content://books/native',
      path: 'Folder/native.epub',
      size: 99,
    }

    mocks.prepareLocalEpubImport.mockResolvedValue(prepared)
    mocks.addBook.mockResolvedValue(51)

    await expect(BookImportService.importNativeEpub(nativeFile)).resolves.toBe(51)

    expect(mocks.addBook).toHaveBeenCalledWith(expect.objectContaining({
      title: 'Native Book',
      author: 'Native Author',
      fileBlob: undefined,
      storageMode: 'local',
      fileName: 'native.epub',
      filePath: 'Folder/native.epub',
      fileSize: prepared.size,
      fileHash: prepared.sha256,
      uri: prepared.localUri,
      originalUri: prepared.originalUri,
    }))
    expect(mocks.prepareLocalEpubImport).toHaveBeenCalledWith(nativeFile, expect.objectContaining({
      importId: expect.any(String),
      signal: expect.any(AbortSignal),
    }))
    expect(mocks.readNativeFolderFile).not.toHaveBeenCalled()
  })

  it('finaliza importacao nativa sem aguardar enriquecimento externo', async () => {
    const prepared = preparedNativeEpub({ coverBase64: null })
    const nativeFile = {
      name: 'native.epub',
      uri: 'content://books/native',
      path: 'Folder/native.epub',
      size: prepared.size,
    }
    let resolveCollect: (value: unknown) => void = () => {}

    mocks.prepareLocalEpubImport.mockResolvedValue(prepared)
    mocks.collectBookInfo.mockReturnValue(new Promise((resolve) => { resolveCollect = resolve }))
    mocks.addBook.mockResolvedValue(51)

    await expect(BookImportService.importNativeEpub(nativeFile)).resolves.toBe(51)

    expect(mocks.addBook).toHaveBeenCalledTimes(1)
    expect(mocks.collectBookInfo).toHaveBeenCalledTimes(1)
    expect(mocks.collectBookInfo).toHaveBeenCalledWith(null, expect.objectContaining({
      lookupHints: expect.objectContaining({
        title: 'Native Book',
        author: 'Native Author',
      }),
    }))
    expect(mocks.saveBookInfo).not.toHaveBeenCalled()

    resolveCollect({
      category: null,
      rating: null,
      synopsis: null,
      pageCount: null,
      publishedDate: null,
      universalIdentifier: null,
      reviews: null,
      lookupHints: {
        title: 'Native Book',
        author: 'Native Author',
        identifiers: [],
      },
    })
    await Promise.resolve()
    await Promise.resolve()

    expect(mocks.saveBookInfo).toHaveBeenCalledWith(51, expect.objectContaining({
      lookupHints: expect.objectContaining({
        title: 'Native Book',
      }),
    }))
  })

  it('bloqueia outra importacao enquanto uma importacao nativa esta em andamento', async () => {
    const prepared = preparedNativeEpub({ coverBase64: null })
    const nativeFile = {
      name: 'native.epub',
      uri: 'content://books/native',
      path: 'Folder/native.epub',
      size: prepared.size,
    }
    let resolvePrepare: (prepared: ReturnType<typeof preparedNativeEpub>) => void = () => {}

    mocks.prepareLocalEpubImport.mockReturnValueOnce(new Promise((resolve) => { resolvePrepare = resolve }))
    mocks.addBook.mockResolvedValue(51)

    const firstImport = BookImportService.importNativeEpub(nativeFile)
    await Promise.resolve()

    await expect(BookImportService.importNativeEpub({
      ...nativeFile,
      uri: 'content://books/second',
    })).rejects.toThrow('Ja existe uma importacao em andamento')

    resolvePrepare(prepared)
    await expect(firstImport).resolves.toBe(51)
    expect(mocks.prepareLocalEpubImport).toHaveBeenCalledTimes(1)
    expect(mocks.prepareLocalEpubImport).toHaveBeenCalledWith(nativeFile, expect.objectContaining({
      importId: expect.any(String),
      signal: expect.any(AbortSignal),
    }))
  })

  it('cancela a importacao ativa e nao salva registro parcial', async () => {
    const nativeFile = {
      name: 'cancel.epub',
      uri: 'content://books/cancel',
      path: 'Folder/cancel.epub',
      size: 1024,
    }

    mocks.prepareLocalEpubImport.mockImplementation((_file, options?: { signal?: AbortSignal }) => (
      new Promise((_resolve, reject) => {
        options?.signal?.addEventListener('abort', () => reject(options.signal?.reason), { once: true })
      })
    ))

    const pendingImport = BookImportService.importNativeEpub(nativeFile)
    await Promise.resolve()

    BookImportService.cancelActiveImport('teste')

    await expect(pendingImport).rejects.toThrow('Importacao cancelada: teste.')
    expect(mocks.addBook).not.toHaveBeenCalled()
  })

  it('remove arquivo local preparado quando a importacao nativa detecta duplicado', async () => {
    const prepared = preparedNativeEpub({ sha256: 'b'.repeat(64) })
    const nativeFile = {
      name: 'native.epub',
      uri: prepared.originalUri,
      path: 'Folder/native.epub',
      size: prepared.size,
    }

    mocks.prepareLocalEpubImport.mockResolvedValue(prepared)
    mocks.booksToArray.mockResolvedValue([{
      id: 1,
      title: 'Existing',
      author: 'Author',
      fileHash: prepared.sha256,
      fileName: 'existing.epub',
      fileSize: prepared.size,
    }])

    await expect(BookImportService.importNativeEpub(nativeFile)).rejects.toThrow('Este livro ja esta na biblioteca.')

    expect(mocks.addBook).not.toHaveBeenCalled()
    expect(mocks.deleteLocalBookFile).toHaveBeenCalledWith(prepared.localUri)
  })

  it('salva lote nativo como arquivos locais sem embutir os EPUBs no IndexedDB', async () => {
    const prepared = preparedNativeEpub({
      name: 'native-batch.epub',
      path: 'Folder/native-batch.epub',
      originalUri: 'content://books/native-batch',
      localUri: 'file:///data/user/0/com.johnny.neoreader/files/books/c.epub',
      sha256: 'c'.repeat(64),
      title: 'Native Batch Book',
    })
    const nativeFile = {
      name: 'native-batch.epub',
      uri: 'content://books/native-batch',
      path: 'Folder/native-batch.epub',
      size: prepared.size + 99,
    }

    mocks.prepareLocalEpubImport.mockResolvedValue(prepared)
    mocks.addBook.mockResolvedValue(52)

    const summary = await BookImportService.importSelectedBooks({
      items: [{
        id: 'native-batch',
        nativeFile,
        fileName: nativeFile.name,
        fileSize: nativeFile.size,
        format: 'EPUB',
        supported: true,
        duplicate: false,
        selected: true,
      }],
      tagIds: [],
      sourceFolder: {
        folderName: 'Folder',
        folderUri: 'content://folder',
        includeSubfolders: true,
        autoImportEnabled: false,
      },
    })

    expect(summary).toEqual({
      imported: 1,
      duplicate: 0,
      unsupported: 0,
      errors: 0,
      restoredBookmarks: 0,
    })
    expect(mocks.addBook).toHaveBeenCalledWith(expect.objectContaining({
      title: 'Native Batch Book',
      fileBlob: undefined,
      storageMode: 'local',
      fileName: 'native-batch.epub',
      filePath: 'Folder/native-batch.epub',
      fileSize: prepared.size,
      uri: prepared.localUri,
      originalUri: prepared.originalUri,
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
      restoredBookmarks: 0,
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
      restoredBookmarks: 0,
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
      restoredBookmarks: 0,
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

function preparedNativeEpub(overrides: Partial<{
  name: string
  path: string
  size: number
  sha256: string
  localUri: string
  originalUri: string
  title: string
  author: string
  coverBase64: string | null
  localFileExisted: boolean
}> = {}) {
  const name = overrides.name ?? 'native.epub'
  const sha256 = overrides.sha256 ?? 'a'.repeat(64)

  return {
    importId: 'native-import-1',
    name,
    path: overrides.path ?? `Folder/${name}`,
    size: overrides.size ?? 11,
    sha256,
    localUri: overrides.localUri ?? `file:///data/user/0/com.johnny.neoreader/files/books/${sha256}.epub`,
    originalUri: overrides.originalUri ?? `content://books/${name}`,
    metadata: {
      title: overrides.title ?? 'Native Book',
      author: overrides.author ?? 'Native Author',
      identifiers: [],
      language: 'pt-BR',
      description: 'Descricao nativa',
    },
    ...(overrides.coverBase64 === null ? {} : {
      cover: {
        base64: overrides.coverBase64 ?? btoa('cover'),
        mimeType: 'image/jpeg',
      },
    }),
    diagnostics: {
      copyMs: 10,
      inspectMs: 5,
      bytesCopied: overrides.size ?? 11,
      localFileExisted: overrides.localFileExisted ?? false,
    },
  }
}
