import { render, screen } from '@testing-library/react'
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

    render(<LibraryGridView books={books} onOpenBook={vi.fn()} />)

    const cards = screen.getAllByRole('button')
    expect(cards.length).toBeGreaterThan(0)
    expect(cards.length).toBeLessThan(books.length)
  })

  it('com poucos livros, renderiza todos os cards', () => {
    const books = Array.from({ length: 2 }, (_, i) => makeBook(i))

    render(<LibraryGridView books={books} onOpenBook={vi.fn()} />)

    expect(screen.getAllByRole('button')).toHaveLength(2)
  })
})
