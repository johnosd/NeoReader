import { describe, expect, it, vi } from 'vitest'
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

describe('BookFileResolver', () => {
  it('retorna URL convertida para livro local privado no reader', async () => {
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
})
