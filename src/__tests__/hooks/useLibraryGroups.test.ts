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

import { useLibraryGroups } from '@/hooks/useLibraryGroups'

function makeBook(id: number, addedAt: Date): Book {
  return { id, title: `Livro ${id}`, author: 'Autor', addedAt, lastOpenedAt: null }
}

// A row "Meus livros" da Home não paginava/virtualizava — com uma
// biblioteca grande, tentava montar todas as capas de uma vez (achado do
// bug alerta-play-console-uso-memoria-acima). Trava o limite pra não
// regredir.
describe('useLibraryGroups', () => {
  it('limita recentBooks a 20 itens mesmo com biblioteca maior, mantendo addedAt desc', () => {
    const books = Array.from({ length: 35 }, (_, i) => makeBook(i + 1, new Date(2026, 0, i + 1)))
    mocks.data = { books, allProgress: [], allBookInfo: [] }

    const { result } = renderHook(() => useLibraryGroups())

    expect(result.current.recentBooks).toHaveLength(20)
    expect(result.current.recentBooks[0]?.id).toBe(35) // addedAt mais recente primeiro
    expect(result.current.recentBooks[19]?.id).toBe(16)
  })

  it('não corta a biblioteca quando ela é menor que o limite', () => {
    const books = [makeBook(1, new Date(2026, 0, 1)), makeBook(2, new Date(2026, 0, 2))]
    mocks.data = { books, allProgress: [], allBookInfo: [] }

    const { result } = renderHook(() => useLibraryGroups())

    expect(result.current.recentBooks).toHaveLength(2)
  })
})
