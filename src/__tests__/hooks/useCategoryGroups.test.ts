import { renderHook } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { Book, ReadingProgress } from '@/types/book'
import type { StoredBookInfo } from '@/types/bookInfo'

const mocks = vi.hoisted(() => ({
  data: undefined as
    | { books: Book[]; allProgress: ReadingProgress[]; allBookInfo: StoredBookInfo[] }
    | undefined,
}))

// Substitui useLiveQuery por um retorno síncrono direto — a query real usa
// db.books/db.progress/db.bookInfo (IndexedDB), indisponível no ambiente de
// teste; não há motivo pra executá-la aqui, só pra computação do useMemo.
vi.mock('dexie-react-hooks', () => ({
  useLiveQuery: vi.fn(() => mocks.data),
}))

import { useCategoryGroups } from '@/hooks/useCategoryGroups'

function makeBook(id: number): Book {
  return { id, title: `Livro ${id}`, author: 'Autor', addedAt: new Date(2026, 0, id), lastOpenedAt: null }
}

function makeBookInfo(bookId: number, categoryLabel: string): StoredBookInfo {
  return {
    bookId,
    createdAt: new Date(2026, 0, 1),
    updatedAt: new Date(2026, 0, 1),
    metadataSchemaVersion: 2,
    category: { value: [{ label: categoryLabel }], source: 'epub-metadata', confidence: 'high' },
    rating: null,
    synopsis: null,
    pageCount: null,
    publishedDate: null,
    publisher: null,
    language: null,
    isbn10: null,
    isbn13: null,
    subtitle: null,
    series: null,
    edition: null,
    universalIdentifier: null,
    reviews: null,
    lookupHints: { title: null, author: null, identifiers: [] },
  }
}

// Cada row de gênero na Home não limitava quantos livros carregava — um
// gênero com muitos livros tentava montar todas as capas de uma vez
// (achado do bug alerta-play-console-uso-memoria-acima). Trava o limite
// pra não regredir.
describe('useCategoryGroups', () => {
  it('limita os livros de cada row de gênero a 20, mesmo com mais livros no gênero', () => {
    const books = Array.from({ length: 25 }, (_, i) => makeBook(i + 1))
    const allBookInfo = books.map((b) => makeBookInfo(b.id!, 'Fiction'))
    mocks.data = { books, allProgress: [], allBookInfo }

    const { result } = renderHook(() => useCategoryGroups())

    const fiction = result.current.groups.find((g) => g.genre === 'fiction')
    expect(fiction?.books).toHaveLength(20)
  })

  it('não corta o gênero quando ele tem menos livros que o limite', () => {
    const books = [makeBook(1), makeBook(2)]
    const allBookInfo = books.map((b) => makeBookInfo(b.id!, 'Fiction'))
    mocks.data = { books, allProgress: [], allBookInfo }

    const { result } = renderHook(() => useCategoryGroups())

    const fiction = result.current.groups.find((g) => g.genre === 'fiction')
    expect(fiction?.books).toHaveLength(2)
  })
})
