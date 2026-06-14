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
})
