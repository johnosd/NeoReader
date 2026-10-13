import { act, renderHook } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Book, BookCollection, BookTag } from '@/types/book'

const mocks = vi.hoisted(() => ({
  data: null as null | {
    books: Book[]
    progress: unknown[]
    tags: BookTag[]
    collections: BookCollection[]
    allBookInfo: unknown[]
  },
}))

vi.mock('dexie-react-hooks', () => ({
  useLiveQuery: () => mocks.data,
}))
vi.mock('@/db/database', () => ({ db: {} }))

import { useLibraryCatalog } from '@/hooks/useLibraryCatalog'

const NOW = new Date('2026-01-01')

function book(id: number, overrides: Partial<Book> = {}): Book {
  return {
    id,
    title: `Livro ${id}`,
    author: `Autor ${id}`,
    addedAt: NOW,
    lastOpenedAt: null,
    ...overrides,
  }
}

describe('useLibraryCatalog — filtro "Protegidos" (feature 024)', () => {
  beforeEach(() => {
    const tag: BookTag = { id: 5, name: 'ficcao', createdAt: NOW, updatedAt: NOW }
    const collection: BookCollection = { id: 9, name: 'Serie', createdAt: NOW, updatedAt: NOW }
    mocks.data = {
      books: [
        book(1, { isProtected: true, tags: [5], collectionId: 9 }),
        book(2),
        book(3, { isProtected: false }),
        book(4, { isProtected: true }),
      ],
      progress: [],
      tags: [tag],
      collections: [collection],
      allBookInfo: [],
    }
  })

  it('devolve só os livros protegidos', () => {
    const { result } = renderHook(() => useLibraryCatalog('protected'))

    expect(result.current.filteredBooks.map((b) => b.id).sort()).toEqual([1, 4])
  })

  it('"Todos" continua devolvendo todos, protegidos inclusive', () => {
    const { result } = renderHook(() => useLibraryCatalog('all'))

    expect(result.current.filteredBooks).toHaveLength(4)
  })

  it('livro protegido com tag e coleção aparece nos três filtros (FR-018)', () => {
    const tagged = renderHook(() => useLibraryCatalog('tag:5'))
    const collected = renderHook(() => useLibraryCatalog('collection:9'))
    const protectedOnly = renderHook(() => useLibraryCatalog('protected'))

    expect(tagged.result.current.filteredBooks.map((b) => b.id)).toContain(1)
    expect(collected.result.current.filteredBooks.map((b) => b.id)).toContain(1)
    expect(protectedOnly.result.current.filteredBooks.map((b) => b.id)).toContain(1)
  })

  it('a busca por título continua achando livro protegido dentro do filtro', () => {
    const { result } = renderHook(() => useLibraryCatalog('protected'))

    act(() => { result.current.setSearch('Livro 4') })

    expect(result.current.filteredBooks.map((b) => b.id)).toEqual([4])
  })

  it('o campo isProtected chega ao LibraryBook', () => {
    const { result } = renderHook(() => useLibraryCatalog('all'))

    const protectedBook = result.current.books.find((b) => b.id === 1)
    expect(protectedBook?.isProtected).toBe(true)
  })
})
