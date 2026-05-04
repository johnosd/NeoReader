import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { BookOptionsSheet } from '@/components/BookOptionsSheet'
import type { Book } from '@/types/book'

const mocks = vi.hoisted(() => ({
  deleteBook: vi.fn(),
  reextractCover: vi.fn(),
  updateManualCover: vi.fn(),
  refreshBookInfo: vi.fn(),
}))

vi.mock('@/db/books', () => ({
  deleteBook: mocks.deleteBook,
}))

vi.mock('@/services/BookImportService', () => ({
  BookImportService: {
    reextractCover: mocks.reextractCover,
    updateManualCover: mocks.updateManualCover,
  },
}))

vi.mock('@/services/bookInfo', () => ({
  BookInfoRefreshService: {
    refreshBookInfo: mocks.refreshBookInfo,
  },
}))

const book: Book = {
  id: 42,
  title: 'Let Them',
  author: 'Mel Robbins',
  fileBlob: new Blob(['epub']),
  createdAt: new Date('2026-05-01T00:00:00.000Z'),
  addedAt: new Date('2026-05-01T00:00:00.000Z'),
  isFavorite: false,
}

describe('BookOptionsSheet', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('offers a menu action to refresh book info', async () => {
    const onClose = vi.fn()
    mocks.refreshBookInfo.mockResolvedValue(undefined)

    render(<BookOptionsSheet book={book} onClose={onClose} />)

    fireEvent.click(screen.getByRole('button', { name: /Atualizar dados do livro/ }))

    await waitFor(() => {
      expect(mocks.refreshBookInfo).toHaveBeenCalledWith(book)
    })
    expect(onClose).toHaveBeenCalled()
  })
})
