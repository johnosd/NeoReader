import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { basename, join } from 'node:path'
import { Blob as NodeBlob, File as NodeFile } from 'node:buffer'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ImportProgress } from '@/services/BookImportService'
import type { NativeFolderFile } from '@/services/NativeLibraryImportService'

const bookInfoMocks = vi.hoisted(() => ({
  collect: vi.fn(),
}))
const nativeImportMocks = vi.hoisted(() => ({
  prepareLocalEpubImport: vi.fn(),
  deleteLocalBookFile: vi.fn(),
}))

vi.mock('@/services/bookInfo', () => ({
  BookInfoService: vi.fn(function BookInfoServiceMock() {
    return {
      collect: bookInfoMocks.collect,
    }
  }),
}))

vi.mock('@/services/NativeLibraryImportService', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/services/NativeLibraryImportService')>()
  return {
    ...actual,
    prepareLocalEpubImport: nativeImportMocks.prepareLocalEpubImport,
    deleteLocalBookFile: nativeImportMocks.deleteLocalBookFile,
  }
})

vi.mock('@/services/BookmarkDriveRestoreService', () => ({
  restoreBookBookmarksFromDrive: vi.fn(async () => ({
    restoredCount: 0,
    mergedCount: 0,
    remoteBookmarkCount: 0,
  })),
}))

const DEBUG_BOOKS_DIR = join(process.cwd(), 'debug-books')
const shouldRunRealBookImport = process.env.NEOREADER_RUN_DEBUG_EPUBS === '1'
  || process.argv.some((arg) => arg.replace(/\\/g, '/').includes('BookImportService.realEpub.test.ts'))
const epubPaths = existsSync(DEBUG_BOOKS_DIR)
  ? readdirSync(DEBUG_BOOKS_DIR)
    .filter((name) => name.toLowerCase().endsWith('.epub'))
    .sort((a, b) => a.localeCompare(b))
    .map((name) => join(DEBUG_BOOKS_DIR, name))
  : []
const singleImportEpubPaths = [...epubPaths]
  .sort((left, right) => statSync(left).size - statSync(right).size)
  .slice(0, 1)
const nativeBatchEpubPaths = [...epubPaths]
  .sort((left, right) => statSync(left).size - statSync(right).size)
  .slice(0, Math.min(2, epubPaths.length))

let db: typeof import('@/db/database')['db']
let BookImportService: typeof import('@/services/BookImportService')['BookImportService']

function makeEpubFile(filePath: string): File {
  const data = readFileSync(filePath)
  const bytes = new Uint8Array(data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength))
  return new NodeFile([bytes], basename(filePath), {
    type: 'application/epub+zip',
    lastModified: 0,
  }) as unknown as File
}

function makeNativeEpubReference(filePath: string): NativeFolderFile {
  const data = readFileSync(filePath)
  const name = basename(filePath)
  return {
    name,
    uri: `content://debug-books/${encodeURIComponent(name)}`,
    path: `debug-books/${name}`,
    size: data.byteLength,
    base64: data.toString('base64'),
  }
}

function makeEmptyFetch(): typeof fetch {
  return vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input)
    const headers = { 'content-type': 'application/json' }

    if (url.includes('openlibrary.org/isbn/')) {
      return new Response('{}', { status: 404, headers })
    }

    return new Response(JSON.stringify({
      totalItems: 0,
      items: [],
    }), { status: 200, headers })
  }) as unknown as typeof fetch
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = ''
  for (let index = 0; index < bytes.length; index += 1) {
    binary += String.fromCharCode(bytes[index])
  }
  return btoa(binary)
}

async function resetDatabase(): Promise<void> {
  await db.open()
  await db.transaction('rw', db.tables, async () => {
    for (const table of db.tables) {
      await table.clear()
    }
  })
}

async function waitForTableCount(
  tableName: string,
  expectedCount: number,
  timeoutMs = 30_000,
): Promise<void> {
  const deadline = Date.now() + timeoutMs

  while (Date.now() <= deadline) {
    const count = await db.table(tableName).count()
    if (count === expectedCount) return
    await new Promise((resolve) => setTimeout(resolve, 25))
  }

  const actualCount = await db.table(tableName).count()
  throw new Error(`${tableName} count ${actualCount}, expected ${expectedCount}`)
}

function assertStoredBookLooksImported(book: Awaited<ReturnType<typeof db.books.get>>, file: File): void {
  expect(book, `${file.name}: livro deve ser salvo no IndexedDB`).toBeTruthy()
  expect(book?.title.trim(), `${file.name}: titulo importado`).not.toBe('')
  expect(book?.author.trim(), `${file.name}: autor importado`).not.toBe('')
  expect(book?.storageMode).toBe('embedded')
  expect(book?.format).toBe('EPUB')
  expect(book?.fileName).toBe(file.name)
  expect(book?.fileSize).toBe(file.size)
  expect(book?.fileBlob?.size).toBe(file.size)
  expect(book?.fileHash, `${file.name}: hash SHA-256 persistido`).toMatch(/^[a-f0-9]{64}$/)
  expect(book?.lastOpenedAt).toBeNull()
  expect(book?.readingStatus).toBe('unread')
  expect(book?.missingFile).toBe(false)
}

function assertStoredNativeBookLooksImported(book: Awaited<ReturnType<typeof db.books.get>>, nativeFile: NativeFolderFile): void {
  expect(book, `${nativeFile.name}: livro nativo deve ser salvo no IndexedDB`).toBeTruthy()
  expect(book?.title.trim(), `${nativeFile.name}: titulo importado`).not.toBe('')
  expect(book?.author.trim(), `${nativeFile.name}: autor importado`).not.toBe('')
  expect(book?.storageMode).toBe('local')
  expect(book?.format).toBe('EPUB')
  expect(book?.fileName).toBe(nativeFile.name)
  expect(book?.filePath).toBe(nativeFile.path)
  expect(book?.fileSize).toBe(nativeFile.size)
  expect(book?.fileBlob).toBeUndefined()
  expect(book?.uri).toMatch(/^file:\/\//)
  expect(book?.originalUri).toBe(nativeFile.uri)
  expect(book?.fileHash, `${nativeFile.name}: hash SHA-256 persistido`).toMatch(/^[a-f0-9]{64}$/)
  expect(book?.lastOpenedAt).toBeNull()
  expect(book?.readingStatus).toBe('unread')
  expect(book?.missingFile).toBe(false)
}

if (!shouldRunRealBookImport) {
  describe.skip('BookImportService real EPUB import', () => {
    it('rode npm run test:debug-epubs para validar importacao real dos EPUBs locais', () => {})
  })
} else if (epubPaths.length === 0) {
  describe.skip('BookImportService real EPUB import', () => {
    it('coloque arquivos .epub em debug-books para validar importacao real', () => {})
  })
} else {
  describe('BookImportService real EPUB import', () => {
    beforeAll(async () => {
      await import('fake-indexeddb/auto')
      ;({ db } = await import('@/db/database'))
      ;({ BookImportService } = await import('@/services/BookImportService'))
    })

    beforeEach(async () => {
      vi.stubGlobal('Blob', NodeBlob)
      vi.stubGlobal('File', NodeFile)
      vi.stubGlobal('fetch', makeEmptyFetch())
      bookInfoMocks.collect.mockReset()
      nativeImportMocks.prepareLocalEpubImport.mockReset()
      nativeImportMocks.deleteLocalBookFile.mockReset()
      nativeImportMocks.deleteLocalBookFile.mockResolvedValue(true)
      bookInfoMocks.collect.mockImplementation(async (_file: File, context?: {
        lookupHints?: {
          title?: string | null
          author?: string | null
          identifiers?: unknown[]
        }
      }) => ({
        category: null,
        rating: null,
        synopsis: null,
        pageCount: null,
        publishedDate: null,
        universalIdentifier: null,
        reviews: null,
        lookupHints: {
          title: context?.lookupHints?.title ?? null,
          author: context?.lookupHints?.author ?? null,
          identifiers: context?.lookupHints?.identifiers ?? [],
        },
      }))
      nativeImportMocks.prepareLocalEpubImport.mockImplementation(async (nativeFile: NativeFolderFile, options?: { importId?: string }) => {
        const filePath = epubPaths.find((candidate) => basename(candidate) === nativeFile.name)
        if (!filePath) throw new Error(`EPUB nativo nao encontrado: ${nativeFile.name}`)
        const file = makeEpubFile(filePath)
        const { EpubService } = await import('@/services/EpubService')
        const metadata = await EpubService.parseMetadata(file)
        const hashBuffer = await crypto.subtle.digest('SHA-256', await file.arrayBuffer())
        const sha256 = Array.from(new Uint8Array(hashBuffer))
          .map((byte) => byte.toString(16).padStart(2, '0'))
          .join('')
        const cover = metadata.coverBlob
          ? {
            base64: bytesToBase64(new Uint8Array(await metadata.coverBlob.arrayBuffer())),
            mimeType: metadata.coverBlob.type,
          }
          : undefined

        return {
          importId: options?.importId ?? 'real-native-import',
          name: nativeFile.name,
          path: nativeFile.path,
          size: file.size,
          sha256,
          localUri: `file:///debug-books-local/${sha256}.epub`,
          originalUri: nativeFile.uri,
          metadata: {
            title: metadata.title,
            author: metadata.author,
            identifiers: [],
          },
          ...(cover ? { cover } : {}),
          diagnostics: {
            copyMs: 1,
            inspectMs: 1,
            bytesCopied: file.size,
            localFileExisted: false,
          },
        }
      })
      await resetDatabase()
    })

    afterEach(async () => {
      await resetDatabase()
      db.close()
      vi.unstubAllGlobals()
    })

    it.each(singleImportEpubPaths.map((filePath) => [basename(filePath), filePath]))(
      'importa EPUB real individual: %s',
      async (_fileName, filePath) => {
        const file = makeEpubFile(filePath)

        const bookId = await BookImportService.importEpub(file)

        const book = await db.books.get(bookId)
        assertStoredBookLooksImported(book, file)

        const cover = await db.bookCovers.get(bookId)
        expect(cover, `${file.name}: capa deve ser salva`).toBeTruthy()
        expect(cover?.source).toBe('epub-extracted')
        expect(cover?.blob.size ?? 0, `${file.name}: capa vazia`).toBeGreaterThan(128)
        expect(cover?.blob.type ?? '', `${file.name}: MIME da capa`).toMatch(/^image\//)

        const info = await db.bookInfo.get(bookId)
        expect(info?.lookupHints.title).toBe(book?.title)
        expect(info?.lookupHints.author).toBe(book?.author)

        await expect(BookImportService.importEpub(file)).rejects.toThrow('Este livro ja esta na biblioteca.')
        expect(await db.books.count()).toBe(1)
      },
      60_000,
    )

    it.each(singleImportEpubPaths.map((filePath) => [basename(filePath), filePath]))(
      'importa EPUB real individual pelo fluxo nativo externo: %s',
      async (_fileName, filePath) => {
        const nativeFile = makeNativeEpubReference(filePath)

        const bookId = await BookImportService.importNativeEpub(nativeFile)

        const book = await db.books.get(bookId)
        assertStoredNativeBookLooksImported(book, nativeFile)

        const cover = await db.bookCovers.get(bookId)
        expect(cover, `${nativeFile.name}: capa deve ser salva`).toBeTruthy()
        expect(cover?.source).toBe('epub-extracted')
        expect(cover?.blob.size ?? 0, `${nativeFile.name}: capa vazia`).toBeGreaterThan(128)
        expect(cover?.blob.type ?? '', `${nativeFile.name}: MIME da capa`).toMatch(/^image\//)

        await waitForTableCount('bookInfo', 1)
        await expect(BookImportService.importNativeEpub(nativeFile)).rejects.toThrow('Este livro ja esta na biblioteca.')
        expect(await db.books.count()).toBe(1)
      },
      60_000,
    )

    it('importa em lote os EPUBs reais selecionados da debug-books', async () => {
      const files = epubPaths.map(makeEpubFile)
      const progressEvents: ImportProgress[] = []
      const preview = await BookImportService.buildImportPreview(files)
      const selectedItems = preview.map((item) => ({
        ...item,
        selected: true,
        duplicate: false,
      }))

      expect(preview).toHaveLength(files.length)
      expect(preview.every((item) => item.supported)).toBe(true)
      expect(preview.every((item) => item.fileHash?.match(/^[a-f0-9]{64}$/))).toBe(true)

      const summary = await BookImportService.importSelectedBooks({
        items: selectedItems,
        tagIds: [101, 202],
        sourceFolder: {
          folderName: 'debug-books',
          folderUri: DEBUG_BOOKS_DIR,
          includeSubfolders: false,
          autoImportEnabled: false,
        },
        onProgress: (progress) => progressEvents.push(progress),
      })

      expect(summary.errors).toBe(0)
      expect(summary.unsupported).toBe(0)
      expect(summary.imported).toBeGreaterThan(0)
      expect(summary.imported + summary.duplicate).toBe(files.length)

      const books = await db.books.toArray()
      expect(books).toHaveLength(summary.imported)
      expect(await db.sourceFolders.count()).toBe(1)
      expect(await db.bookCovers.count()).toBe(summary.imported)

      const sourceFolder = await db.sourceFolders.where('uri').equals(DEBUG_BOOKS_DIR).first()
      expect(sourceFolder?.name).toBe('debug-books')

      for (const book of books) {
        const originalFile = files.find((file) => file.name === book.fileName)
        expect(originalFile, `${book.fileName}: arquivo original encontrado`).toBeTruthy()
        assertStoredBookLooksImported(book, originalFile!)
        expect(book.tags).toEqual([101, 202])
        expect(book.sourceFolderId).toBe(sourceFolder?.id)
        expect(book.uri).toBe(book.fileName)
      }

      const covers = await db.bookCovers.toArray()
      for (const cover of covers) {
        expect(cover.source).toBe('epub-extracted')
        expect(cover.blob.size).toBeGreaterThan(128)
        expect(cover.blob.type).toMatch(/^image\//)
      }

      await waitForTableCount('bookInfo', summary.imported)

      expect(progressEvents[0]).toMatchObject({
        phase: 'preparing',
        current: 0,
        total: files.length,
      })
      expect(progressEvents[progressEvents.length - 1]).toMatchObject({
        phase: 'finishing',
        current: files.length,
        total: files.length,
      })
    }, 180_000)

    it('importa em lote EPUBs reais pelo fluxo nativo externo', async () => {
      const nativeFiles = nativeBatchEpubPaths.map(makeNativeEpubReference)
      const preview = await BookImportService.buildNativeImportPreview(nativeFiles)

      expect(preview).toHaveLength(nativeFiles.length)
      expect(preview.every((item) => item.supported)).toBe(true)

      const summary = await BookImportService.importSelectedBooks({
        items: preview.map((item) => ({ ...item, selected: true, duplicate: false })),
        tagIds: [303],
        sourceFolder: {
          folderName: 'debug-books-native',
          folderUri: 'content://debug-books',
          includeSubfolders: false,
          autoImportEnabled: false,
        },
      })

      expect(summary.errors).toBe(0)
      expect(summary.unsupported).toBe(0)
      expect(summary.imported).toBeGreaterThan(0)
      expect(summary.imported + summary.duplicate).toBe(nativeFiles.length)

      const books = await db.books.toArray()
      expect(books).toHaveLength(summary.imported)

      for (const book of books) {
        const nativeFile = nativeFiles.find((file) => file.name === book.fileName)
        expect(nativeFile, `${book.fileName}: arquivo nativo original encontrado`).toBeTruthy()
        assertStoredNativeBookLooksImported(book, nativeFile!)
        expect(book.tags).toEqual([303])
      }

      await waitForTableCount('bookInfo', summary.imported)
    }, 120_000)
  })
}
