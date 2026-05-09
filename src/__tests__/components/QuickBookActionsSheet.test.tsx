import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { QuickBookActionsSheet } from '@/components/QuickBookActionsSheet'
import type { Book, BookTag } from '@/types/book'

const mocks = vi.hoisted(() => ({
  deleteBook: vi.fn(),
  setBookTags: vi.fn(),
  updateReadingStatus: vi.fn(),
  createTag: vi.fn(),
  reextractCover: vi.fn(),
  updateManualCover: vi.fn(),
  refreshBookInfo: vi.fn(),
  tags: [] as BookTag[],
}))

vi.mock('dexie-react-hooks', () => ({
  useLiveQuery: () => mocks.tags,
}))

vi.mock('@/db/database', () => ({
  db: {
    tags: {
      orderBy: vi.fn(() => ({
        toArray: vi.fn(async () => mocks.tags),
      })),
    },
  },
}))

vi.mock('@/db/books', () => ({
  deleteBook: mocks.deleteBook,
  setBookTags: mocks.setBookTags,
  updateReadingStatus: mocks.updateReadingStatus,
}))

vi.mock('@/db/tags', () => ({
  createTag: mocks.createTag,
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
  addedAt: new Date('2026-05-01T00:00:00.000Z'),
  lastOpenedAt: null,
  isFavorite: false,
  tags: [1],
}

describe('QuickBookActionsSheet', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.tags = [
      { id: 1, name: 'Lendo', createdAt: new Date('2026-05-01'), updatedAt: new Date('2026-05-01') },
      { id: 2, name: 'Ingles', createdAt: new Date('2026-05-01'), updatedAt: new Date('2026-05-01') },
    ]
    mocks.deleteBook.mockResolvedValue(undefined)
    mocks.setBookTags.mockResolvedValue(undefined)
    mocks.updateReadingStatus.mockResolvedValue(undefined)
    mocks.createTag.mockResolvedValue(3)
    mocks.reextractCover.mockResolvedValue(true)
    mocks.updateManualCover.mockResolvedValue(undefined)
    mocks.refreshBookInfo.mockResolvedValue(undefined)
  })

  it('renderiza o titulo do menu e o livro', () => {
    render(<QuickBookActionsSheet book={book} onClose={vi.fn()} />)

    expect(screen.getByText('Ações rápidas')).toBeTruthy()
    expect(screen.getByText('Let Them')).toBeTruthy()
  })

  it('atualiza dados do livro', async () => {
    const onClose = vi.fn()
    render(<QuickBookActionsSheet book={book} onClose={onClose} />)

    fireEvent.click(screen.getByRole('button', { name: /Atualizar dados do livro/ }))

    await waitFor(() => expect(mocks.refreshBookInfo).toHaveBeenCalledWith(book))
    expect(onClose).toHaveBeenCalled()
  })

  it('recria capa do EPUB', async () => {
    render(<QuickBookActionsSheet book={book} onClose={vi.fn()} />)

    fireEvent.click(screen.getByRole('button', { name: /Recriar capa/ }))

    await waitFor(() => expect(mocks.reextractCover).toHaveBeenCalledWith(book))
  })

  it('escolhe imagem manual de capa', async () => {
    const { container } = render(<QuickBookActionsSheet book={book} onClose={vi.fn()} />)
    const input = container.querySelector('input[type="file"]') as HTMLInputElement
    const image = new File(['image'], 'cover.png', { type: 'image/png' })

    fireEvent.change(input, { target: { files: [image] } })

    await waitFor(() => expect(mocks.updateManualCover).toHaveBeenCalledWith(42, image))
  })

  it('marca como lendo e finalizado', async () => {
    render(<QuickBookActionsSheet book={book} onClose={vi.fn()} />)

    fireEvent.click(screen.getByRole('button', { name: /Marcar como lendo/ }))
    await waitFor(() => expect(mocks.updateReadingStatus).toHaveBeenCalledWith(42, 'reading'))

    render(<QuickBookActionsSheet book={book} onClose={vi.fn()} />)
    fireEvent.click(screen.getAllByRole('button', { name: /Marcar como finalizado/ }).at(-1)!)

    await waitFor(() => expect(mocks.updateReadingStatus).toHaveBeenCalledWith(42, 'finished'))
  })

  it('cria tag e aplica ao livro', async () => {
    render(<QuickBookActionsSheet book={book} onClose={vi.fn()} />)

    fireEvent.click(screen.getByRole('button', { name: /^Tags/ }))
    fireEvent.change(screen.getByPlaceholderText('Nova tag'), { target: { value: 'Fantasia' } })
    fireEvent.click(screen.getByRole('button', { name: 'Criar' }))

    await waitFor(() => expect(mocks.createTag).toHaveBeenCalledWith('Fantasia'))
    expect(mocks.setBookTags).toHaveBeenCalledWith(42, [1, 3])
  })

  it('marca e desmarca tag existente', async () => {
    render(<QuickBookActionsSheet book={book} onClose={vi.fn()} />)

    fireEvent.click(screen.getByRole('button', { name: /^Tags/ }))
    fireEvent.click(screen.getByLabelText('Ingles'))

    await waitFor(() => expect(mocks.setBookTags).toHaveBeenCalledWith(42, [1, 2]))

    fireEvent.click(screen.getByLabelText('Lendo'))
    await waitFor(() => expect(mocks.setBookTags).toHaveBeenCalledWith(42, []))
  })

  it('exige confirmacao antes de deletar', async () => {
    render(<QuickBookActionsSheet book={book} onClose={vi.fn()} />)

    fireEvent.click(screen.getByRole('button', { name: /Deletar livro/ }))
    expect(mocks.deleteBook).not.toHaveBeenCalled()

    fireEvent.click(screen.getByRole('button', { name: /^Deletar$/ }))

    await waitFor(() => expect(mocks.deleteBook).toHaveBeenCalledWith(42))
  })
})
