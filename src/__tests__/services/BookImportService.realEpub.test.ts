import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { basename, join } from 'node:path'
import { Blob as NodeBlob, File as NodeFile } from 'node:buffer'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ImportProgress } from '@/services/BookImportService'

const bookInfoMocks = vi.hoisted(() => ({
  collect: vi.fn(),
}))

vi.mock('@/services/bookInfo', () => ({
  BookInfoService: vi.fn(function BookInfoServiceMock() {
    return {
      collect: bookInfoMocks.collect,
    }
  }),
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
  })
}
