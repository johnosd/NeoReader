import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Book } from '@/types/book'

vi.mock('@capacitor/core', () => ({
  Capacitor: {
    convertFileSrc: vi.fn((uri: string) => `capacitor://${uri}`),
  },
  registerPlugin: vi.fn(() => ({})),
}))

vi.mock('@/db/database', () => ({
  db: {
    books: {
      update: vi.fn(),
    },
  },
}))

import { BookFileResolver } from '@/services/BookFileResolver'
import { db } from '@/db/database'

describe('BookFileResolver', () => {
  beforeEach(() => {
    vi.mocked(db.books.update).mockClear()
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('retorna URL convertida para livro local privado no reader', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('epub', { status: 200 })))
    const book: Book = {
      id: 1,
      title: 'Local Book',
      author: 'Author',
      storageMode: 'local',
      uri: 'file:///data/user/0/app/files/books/hash.epub',
      addedAt: new Date(),
      lastOpenedAt: null,
    }

    await expect(BookFileResolver.resolveReaderSource(book))
      .resolves
      .toBe('capacitor://file:///data/user/0/app/files/books/hash.epub')
  })

  it('marca livro local como ausente quando a validacao do reader falha', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('', { status: 404 })))
    const book: Book = {
      id: 2,
      title: 'Missing Local Book',
      author: 'Author',
      storageMode: 'local',
      uri: 'file:///data/user/0/app/files/books/missing.epub',
      addedAt: new Date(),
      lastOpenedAt: null,
    }

    await expect(BookFileResolver.resolveReaderSource(book))
      .rejects
      .toThrow('movido')
    expect(db.books.update).toHaveBeenCalledWith(2, { missingFile: true })
  })

  describe('PDF (feature 022)', () => {
    const base = { title: 'Livro', author: 'Autor', addedAt: new Date(), lastOpenedAt: null }

    it('resolveEpubFile devolve File com MIME e nome de PDF para livro PDF', async () => {
      const book: Book = { ...base, format: 'PDF', fileBlob: new Blob(['%PDF-1.7']), storageMode: 'embedded' }
      const file = await BookFileResolver.resolveEpubFile(book)
      expect(file.type).toBe('application/pdf')
      expect(file.name).toBe('Livro.pdf')
    })

    it('resolveEpubFile mantém application/epub+zip para EPUB e para livro sem format', async () => {
      const epub: Book = { ...base, format: 'EPUB', fileBlob: new Blob(['PK']), storageMode: 'embedded' }
      const legacy: Book = { ...base, fileBlob: new Blob(['PK']), storageMode: 'embedded', fileName: 'x.epub' }
      expect((await BookFileResolver.resolveEpubFile(epub)).type).toBe('application/epub+zip')
      expect((await BookFileResolver.resolveEpubFile(epub)).name).toBe('Livro.epub')
      expect((await BookFileResolver.resolveEpubFile(legacy)).type).toBe('application/epub+zip')
    })

    it('fetchLocalFile lê a cópia local pela URL do Capacitor', async () => {
      const fetchMock = vi.fn(async () => new Response('%PDF-1.7', { status: 200 }))
      vi.stubGlobal('fetch', fetchMock)
      const blob = await BookFileResolver.fetchLocalFile('file:///books/h.pdf')
      expect(fetchMock).toHaveBeenCalledWith('capacitor://file:///books/h.pdf')
      expect(await blob.text()).toBe('%PDF-1.7')
    })

    it('fetchLocalFile falha com HTTP de erro', async () => {
      vi.stubGlobal('fetch', vi.fn(async () => new Response('', { status: 404 })))
      await expect(BookFileResolver.fetchLocalFile('file:///x.pdf')).rejects.toThrow('HTTP 404')
    })
  })
})
