import { render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { BookCard } from '@/components/BookCard'
import { HeroBanner } from '@/components/HeroBanner'
import { LibraryGridView } from '@/components/LibraryGridView'
import { BookLockBadge } from '@/components/BookLockBadge'
import { useBookLockStore } from '@/store/bookLockStore'
import type { BookWithProgress } from '@/hooks/useLibraryGroups'
import type { LibraryBook } from '@/hooks/useLibraryCatalog'
import { mockElementDimensions } from '../testUtils/domMeasurements'

vi.mock('@/hooks/useBookCoverUrl', () => ({
  useBookCoverUrl: () => null,
}))

function makeCardBook(overrides: Partial<BookWithProgress> = {}): BookWithProgress {
  return {
    id: 1,
    title: 'Dom Casmurro',
    author: 'Machado de Assis',
    addedAt: new Date('2026-01-01'),
    lastOpenedAt: new Date('2026-02-01'),
    percentage: 42,
    readingStatus: 'reading',
    bookInfo: null,
    ...overrides,
  }
}

function makeLibraryBook(overrides: Partial<LibraryBook> = {}): LibraryBook {
  return {
    id: 1,
    title: 'Dom Casmurro',
    author: 'Machado de Assis',
    format: 'EPUB',
    fileName: 'dom.epub',
    fileSize: 1,
    addedAt: new Date('2026-01-01'),
    importedAt: new Date('2026-01-01'),
    lastOpenedAt: null,
    tags: [],
    isFavorite: false,
    missingFile: false,
    percentage: 42,
    readingStatus: 'reading',
    tagRecords: [],
    ...overrides,
  }
}

describe('ocultação de dados extras de livro protegido (FR-006)', () => {
  beforeEach(() => {
    useBookLockStore.getState().settlePrompt(false)
    useBookLockStore.setState({ unlocked: false, prompt: null, setup: null })
  })

  describe('BookCard', () => {
    it('protegido e bloqueado: só título e cadeado, sem autor', () => {
      render(<BookCard book={makeCardBook({ isProtected: true })} onPress={vi.fn()} />)

      expect(screen.getByText('Dom Casmurro')).toBeTruthy()
      expect(screen.queryByText('Machado de Assis')).toBeNull()
      expect(screen.getByRole('img', { name: 'Protegido, bloqueado' })).toBeTruthy()
    })

    it('protegido e desbloqueado: mostra tudo e o cadeado aberto', () => {
      useBookLockStore.getState().unlock()
      render(<BookCard book={makeCardBook({ isProtected: true })} onPress={vi.fn()} />)

      expect(screen.getByText('Machado de Assis')).toBeTruthy()
      expect(screen.getByRole('img', { name: 'Protegido, desbloqueado' })).toBeTruthy()
    })

    it('livro comum nunca é ocultado nem ganha cadeado (FR-020)', () => {
      render(<BookCard book={makeCardBook()} onPress={vi.fn()} />)

      expect(screen.getByText('Machado de Assis')).toBeTruthy()
      expect(screen.queryByRole('img', { name: /Protegido/ })).toBeNull()
    })
  })

  describe('HeroBanner', () => {
    it('protegido e bloqueado: sem autor, progresso, descrição nem status', () => {
      render(<HeroBanner book={makeCardBook({ isProtected: true })} onPress={vi.fn()} />)

      expect(screen.getByText('Dom Casmurro')).toBeTruthy()
      expect(screen.queryByText('Machado de Assis')).toBeNull()
      expect(screen.queryByText(/42/)).toBeNull()
      expect(screen.queryByText('Continuar')).toBeNull()
      expect(screen.getByRole('img', { name: 'Protegido, bloqueado' })).toBeTruthy()
    })

    it('livro comum em leitura mostra autor e progresso', () => {
      render(<HeroBanner book={makeCardBook()} onPress={vi.fn()} />)

      expect(screen.getByText('Machado de Assis')).toBeTruthy()
      expect(screen.queryByRole('img', { name: /Protegido/ })).toBeNull()
    })
  })

  describe('LibraryGridView', () => {
    let restore: () => void
    beforeEach(() => { restore = mockElementDimensions(1024, 300) })
    afterEach(() => restore())

    it('protegido e bloqueado: cadeado e sem barra de progresso', () => {
      const { container } = render(
        <LibraryGridView
          books={[makeLibraryBook({ isProtected: true })]}
          onOpenBook={vi.fn()}
          selectedIds={new Set()}
          onToggleBook={vi.fn()}
        />,
      )

      expect(screen.getByRole('img', { name: 'Protegido, bloqueado' })).toBeTruthy()
      expect(container.querySelector('.bg-success')).toBeNull()
    })

    it('livro comum mantém a barra de progresso e não tem cadeado', () => {
      const { container } = render(
        <LibraryGridView
          books={[makeLibraryBook()]}
          onOpenBook={vi.fn()}
          selectedIds={new Set()}
          onToggleBook={vi.fn()}
        />,
      )

      expect(screen.queryByRole('img', { name: /Protegido/ })).toBeNull()
      expect(container.querySelector('.bg-success')).not.toBeNull()
    })
  })

  describe('BookLockBadge', () => {
    it('acompanha o estado do store', () => {
      const { rerender } = render(<BookLockBadge />)
      expect(screen.getByRole('img', { name: 'Protegido, bloqueado' })).toBeTruthy()

      useBookLockStore.getState().unlock()
      rerender(<BookLockBadge />)
      expect(screen.getByRole('img', { name: 'Protegido, desbloqueado' })).toBeTruthy()
    })
  })
})
