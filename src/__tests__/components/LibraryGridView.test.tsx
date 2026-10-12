import { act, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { LibraryGridView } from '@/components/LibraryGridView'
import type { LibraryBook } from '@/hooks/useLibraryCatalog'
import { mockElementDimensions } from '../testUtils/domMeasurements'

vi.mock('@/hooks/useBookCoverUrl', () => ({
  useBookCoverUrl: () => null,
}))

function makeBook(index: number): LibraryBook {
  return {
    id: index + 1,
    title: `Livro ${index + 1}`,
    author: `Autor ${index + 1}`,
    format: 'EPUB',
    fileName: `livro-${index + 1}.epub`,
    fileSize: 1024,
    addedAt: new Date('2026-01-01'),
    importedAt: new Date('2026-01-01'),
    lastOpenedAt: null,
    tags: [],
    isFavorite: false,
    missingFile: false,
    percentage: 0,
    readingStatus: 'unread',
    tagRecords: [],
  }
}

describe('LibraryGridView (virtualizado)', () => {
  let restoreElementDimensions: () => void

  beforeEach(() => {
    restoreElementDimensions = mockElementDimensions(1024, 300)
  })

  afterEach(() => {
    restoreElementDimensions()
  })

  it('T014: renderiza so uma fracao dos cards no DOM com uma biblioteca grande', () => {
    const books = Array.from({ length: 500 }, (_, i) => makeBook(i))

    render(<LibraryGridView books={books} onOpenBook={vi.fn()} selectedIds={new Set()} onToggleBook={vi.fn()} />)

    const cards = screen.getAllByRole('button')
    expect(cards.length).toBeGreaterThan(0)
    expect(cards.length).toBeLessThan(books.length)
  })

  it('com poucos livros, renderiza todos os cards', () => {
    const books = Array.from({ length: 2 }, (_, i) => makeBook(i))

    render(<LibraryGridView books={books} onOpenBook={vi.fn()} selectedIds={new Set()} onToggleBook={vi.fn()} />)

    expect(screen.getAllByRole('button')).toHaveLength(2)
  })

  // Feature 023 (seleção múltipla)
  it('sem seleção, o toque curto abre o livro e não alterna (FR-002)', () => {
    const books = [makeBook(0), makeBook(1)]
    const onOpenBook = vi.fn()
    const onToggleBook = vi.fn()

    render(<LibraryGridView books={books} onOpenBook={onOpenBook} selectedIds={new Set()} onToggleBook={onToggleBook} />)
    fireEvent.click(screen.getAllByRole('button')[0])

    expect(onOpenBook).toHaveBeenCalledWith(books[0])
    expect(onToggleBook).not.toHaveBeenCalled()
  })

  it('com seleção ativa, o toque alterna o livro e NÃO abre (FR-003)', () => {
    const books = [makeBook(0), makeBook(1)]
    const onOpenBook = vi.fn()
    const onToggleBook = vi.fn()

    render(<LibraryGridView books={books} onOpenBook={onOpenBook} selectedIds={new Set([1])} onToggleBook={onToggleBook} />)
    fireEvent.click(screen.getByRole('button', { name: 'Selecionar Livro 2' }))

    expect(onToggleBook).toHaveBeenCalledWith(books[1])
    expect(onOpenBook).not.toHaveBeenCalled()
  })

  it('marca o livro selecionado com aria-pressed e rótulo de desmarcar (FR-004, FR-015)', () => {
    const books = [makeBook(0), makeBook(1)]

    render(<LibraryGridView books={books} onOpenBook={vi.fn()} selectedIds={new Set([1])} onToggleBook={vi.fn()} />)

    expect(screen.getByRole('button', { name: 'Desmarcar Livro 1' }).getAttribute('aria-pressed')).toBe('true')
    expect(screen.getByRole('button', { name: 'Selecionar Livro 2' }).getAttribute('aria-pressed')).toBe('false')
  })

  it('long-press num card chama onToggleBook e o click seguinte não abre o livro', () => {
    vi.useFakeTimers()
    try {
      const books = [makeBook(0)]
      const onOpenBook = vi.fn()
      const onToggleBook = vi.fn()

      render(<LibraryGridView books={books} onOpenBook={onOpenBook} selectedIds={new Set()} onToggleBook={onToggleBook} />)
      const card = screen.getByRole('button')
      fireEvent.pointerDown(card, { button: 0, clientX: 5, clientY: 5 })
      act(() => { vi.advanceTimersByTime(500) })
      fireEvent.pointerUp(card)
      fireEvent.click(card)

      expect(onToggleBook).toHaveBeenCalledTimes(1)
      expect(onOpenBook).not.toHaveBeenCalled()
    } finally {
      vi.useRealTimers()
    }
  })
})
