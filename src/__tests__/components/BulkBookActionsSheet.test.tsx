import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { LibraryBook } from '@/hooks/useLibraryCatalog'
import type { BookCollection } from '@/types/book'

const mocks = vi.hoisted(() => ({
  deleteBooks: vi.fn(),
  setBooksFavorite: vi.fn(),
  setBooksReadingStatus: vi.fn(),
  setBooksCollection: vi.fn(),
  createCollection: vi.fn(),
}))

vi.mock('@/db/books', () => ({
  deleteBooks: mocks.deleteBooks,
  setBooksFavorite: mocks.setBooksFavorite,
  setBooksReadingStatus: mocks.setBooksReadingStatus,
}))

vi.mock('@/db/collections', () => ({
  setBooksCollection: mocks.setBooksCollection,
  createCollection: mocks.createCollection,
}))

import { BulkBookActionsSheet } from '@/components/BulkBookActionsSheet'

function makeBook(id: number): LibraryBook {
  return {
    id,
    title: `Livro ${id}`,
    author: `Autor ${id}`,
    format: 'EPUB',
    fileName: `livro-${id}.epub`,
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

function makeCollection(id: number, name: string): BookCollection {
  return { id, name, createdAt: new Date('2026-01-01'), updatedAt: new Date('2026-01-01') }
}

function setup(books: LibraryBook[], collections: BookCollection[] = []) {
  const onClose = vi.fn()
  const onDone = vi.fn()
  const view = render(
    <BulkBookActionsSheet open books={books} collections={collections} onClose={onClose} onDone={onDone} />,
  )
  return { onClose, onDone, ...view }
}

describe('BulkBookActionsSheet — excluir (feature 023, US1)', () => {
  beforeEach(() => {
    mocks.deleteBooks.mockReset()
  })

  it('Excluir abre a confirmação com a contagem e o aviso de dados associados', () => {
    setup([makeBook(1), makeBook(2), makeBook(3)])

    fireEvent.click(screen.getByRole('button', { name: /Excluir livros selecionados/ }))

    expect(screen.getByText('Excluir 3 livros?')).toBeTruthy()
    expect(screen.getByText(/Progresso, marcadores e vocabulário/)).toBeTruthy()
  })

  it('usa o singular com 1 livro', () => {
    setup([makeBook(7)])

    fireEvent.click(screen.getByRole('button', { name: /Excluir livros selecionados/ }))

    expect(screen.getByText('Excluir 1 livro?')).toBeTruthy()
  })

  it('Cancelar volta à ação e não exclui nada', () => {
    setup([makeBook(1), makeBook(2)])

    fireEvent.click(screen.getByRole('button', { name: /Excluir livros selecionados/ }))
    fireEvent.click(screen.getByRole('button', { name: 'Cancelar' }))

    expect(mocks.deleteBooks).not.toHaveBeenCalled()
    expect(screen.queryByText('Excluir 2 livros?')).toBeNull()
    expect(screen.getByRole('button', { name: /Excluir livros selecionados/ })).toBeTruthy()
  })

  it('Confirmar exclui exatamente os ids selecionados e repassa o resultado', async () => {
    mocks.deleteBooks.mockResolvedValue({ succeeded: 3, failed: 0 })
    const { onDone } = setup([makeBook(4), makeBook(5), makeBook(6)])

    fireEvent.click(screen.getByRole('button', { name: /Excluir livros selecionados/ }))
    fireEvent.click(screen.getByRole('button', { name: 'Excluir' }))

    await waitFor(() => expect(onDone).toHaveBeenCalledTimes(1))
    expect(mocks.deleteBooks).toHaveBeenCalledWith([4, 5, 6])
    expect(onDone).toHaveBeenCalledWith({ tone: 'success', message: '3 livros excluídos' })
  })

  it('falha parcial vira aviso com quantos não puderam ser excluídos (FR-013)', async () => {
    mocks.deleteBooks.mockResolvedValue({ succeeded: 3, failed: 2 })
    const { onDone } = setup([1, 2, 3, 4, 5].map(makeBook))

    fireEvent.click(screen.getByRole('button', { name: /Excluir livros selecionados/ }))
    fireEvent.click(screen.getByRole('button', { name: 'Excluir' }))

    await waitFor(() => expect(onDone).toHaveBeenCalledTimes(1))
    expect(onDone).toHaveBeenCalledWith({ tone: 'warning', message: '2 de 5 não puderam ser excluídos' })
  })

  it('falha total vira aviso de erro', async () => {
    mocks.deleteBooks.mockResolvedValue({ succeeded: 0, failed: 2 })
    const { onDone } = setup([makeBook(1), makeBook(2)])

    fireEvent.click(screen.getByRole('button', { name: /Excluir livros selecionados/ }))
    fireEvent.click(screen.getByRole('button', { name: 'Excluir' }))

    await waitFor(() => expect(onDone).toHaveBeenCalledTimes(1))
    expect(onDone.mock.calls[0][0].tone).toBe('error')
  })

  it('fechar e reabrir a folha zera a confirmação pendente', () => {
    const books = [makeBook(1), makeBook(2)]
    const { rerender } = setup(books)

    fireEvent.click(screen.getByRole('button', { name: /Excluir livros selecionados/ }))
    expect(screen.getByText('Excluir 2 livros?')).toBeTruthy()

    rerender(<BulkBookActionsSheet open={false} books={books} collections={[]} onClose={vi.fn()} onDone={vi.fn()} />)
    rerender(<BulkBookActionsSheet open books={books} collections={[]} onClose={vi.fn()} onDone={vi.fn()} />)

    expect(screen.queryByText('Excluir 2 livros?')).toBeNull()
  })
})

describe('BulkBookActionsSheet — mover para coleção (feature 023, US2)', () => {
  const collections = [makeCollection(5, 'Série X'), makeCollection(6, 'Clássicos')]

  beforeEach(() => {
    mocks.setBooksCollection.mockReset().mockResolvedValue(undefined)
    mocks.createCollection.mockReset()
  })

  it('lista "Sem coleção" e as coleções existentes ao abrir a ação', () => {
    setup([makeBook(1)], collections)

    fireEvent.click(screen.getByRole('button', { name: /Mover para coleção/ }))

    expect(screen.getByRole('button', { name: 'Sem coleção' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Série X' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Clássicos' })).toBeTruthy()
  })

  it('escolher uma coleção move todos (substituindo a atual) e avisa o destino', async () => {
    const { onDone } = setup([makeBook(1), makeBook(2), makeBook(3)], collections)

    fireEvent.click(screen.getByRole('button', { name: /Mover para coleção/ }))
    fireEvent.click(screen.getByRole('button', { name: 'Série X' }))

    await waitFor(() => expect(onDone).toHaveBeenCalledTimes(1))
    expect(mocks.setBooksCollection).toHaveBeenCalledWith([1, 2, 3], 5)
    expect(onDone).toHaveBeenCalledWith({ tone: 'success', message: '3 livros movidos para Série X' })
  })

  it('usa o singular com 1 livro', async () => {
    const { onDone } = setup([makeBook(9)], collections)

    fireEvent.click(screen.getByRole('button', { name: /Mover para coleção/ }))
    fireEvent.click(screen.getByRole('button', { name: 'Clássicos' }))

    await waitFor(() => expect(onDone).toHaveBeenCalledTimes(1))
    expect(onDone).toHaveBeenCalledWith({ tone: 'success', message: '1 livro movido para Clássicos' })
  })

  it('"Sem coleção" passa null e avisa a remoção', async () => {
    const { onDone } = setup([makeBook(1), makeBook(2)], collections)

    fireEvent.click(screen.getByRole('button', { name: /Mover para coleção/ }))
    fireEvent.click(screen.getByRole('button', { name: 'Sem coleção' }))

    await waitFor(() => expect(onDone).toHaveBeenCalledTimes(1))
    expect(mocks.setBooksCollection).toHaveBeenCalledWith([1, 2], null)
    expect(onDone).toHaveBeenCalledWith({ tone: 'success', message: '2 livros removidos da coleção' })
  })

  it('criar coleção nova cria e move para o id novo', async () => {
    mocks.createCollection.mockResolvedValue(42)
    const { onDone } = setup([makeBook(1), makeBook(2)], collections)

    fireEvent.click(screen.getByRole('button', { name: /Mover para coleção/ }))
    fireEvent.change(screen.getByPlaceholderText('Nome da nova coleção'), { target: { value: '  Nova  ' } })
    fireEvent.click(screen.getByRole('button', { name: 'Criar e mover' }))

    await waitFor(() => expect(onDone).toHaveBeenCalledTimes(1))
    expect(mocks.createCollection).toHaveBeenCalledWith('Nova')
    expect(mocks.setBooksCollection).toHaveBeenCalledWith([1, 2], 42)
    expect(onDone.mock.calls[0][0].message).toBe('2 livros movidos para Nova')
  })

  it('nome que já existe (sem diferenciar maiúsculas) reaproveita a coleção em vez de criar', async () => {
    const { onDone } = setup([makeBook(1)], collections)

    fireEvent.click(screen.getByRole('button', { name: /Mover para coleção/ }))
    fireEvent.change(screen.getByPlaceholderText('Nome da nova coleção'), { target: { value: 'série x' } })
    fireEvent.click(screen.getByRole('button', { name: 'Criar e mover' }))

    await waitFor(() => expect(onDone).toHaveBeenCalledTimes(1))
    expect(mocks.createCollection).not.toHaveBeenCalled()
    expect(mocks.setBooksCollection).toHaveBeenCalledWith([1], 5)
  })

  it('nome vazio desabilita "Criar e mover"', () => {
    setup([makeBook(1)], collections)

    fireEvent.click(screen.getByRole('button', { name: /Mover para coleção/ }))
    const create = screen.getByRole('button', { name: 'Criar e mover' }) as HTMLButtonElement
    expect(create.disabled).toBe(true)

    fireEvent.change(screen.getByPlaceholderText('Nome da nova coleção'), { target: { value: '   ' } })
    expect(create.disabled).toBe(true)
  })

  it('erro ao mover mostra a mensagem e não chama onDone', async () => {
    mocks.setBooksCollection.mockRejectedValue(new Error('falhou no banco'))
    const { onDone } = setup([makeBook(1)], collections)

    fireEvent.click(screen.getByRole('button', { name: /Mover para coleção/ }))
    fireEvent.click(screen.getByRole('button', { name: 'Série X' }))

    await screen.findByText('falhou no banco')
    expect(onDone).not.toHaveBeenCalled()
  })
})

describe('BulkBookActionsSheet — favoritos e status (feature 023, US3)', () => {
  beforeEach(() => {
    mocks.setBooksFavorite.mockReset().mockResolvedValue(undefined)
    mocks.setBooksReadingStatus.mockReset().mockResolvedValue(undefined)
  })

  it('seleção mista mostra "Favoritar" e favorita todos (valor explícito true)', async () => {
    const { onDone } = setup([{ ...makeBook(1), isFavorite: true }, makeBook(2)])

    fireEvent.click(screen.getByRole('button', { name: /^Favoritar/ }))

    await waitFor(() => expect(onDone).toHaveBeenCalledTimes(1))
    expect(mocks.setBooksFavorite).toHaveBeenCalledWith([1, 2], true)
    expect(onDone).toHaveBeenCalledWith({ tone: 'success', message: '2 livros adicionados aos favoritos' })
  })

  it('todos já favoritos: vira "Remover dos favoritos" e desfavorita todos', async () => {
    const { onDone } = setup([{ ...makeBook(1), isFavorite: true }, { ...makeBook(2), isFavorite: true }])

    expect(screen.queryByRole('button', { name: /^Favoritar/ })).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: /^Remover dos favoritos/ }))

    await waitFor(() => expect(onDone).toHaveBeenCalledTimes(1))
    expect(mocks.setBooksFavorite).toHaveBeenCalledWith([1, 2], false)
    expect(onDone.mock.calls[0][0].message).toBe('2 livros removidos dos favoritos')
  })

  it('singular com 1 livro favoritado', async () => {
    const { onDone } = setup([makeBook(3)])

    fireEvent.click(screen.getByRole('button', { name: /^Favoritar/ }))

    await waitFor(() => expect(onDone).toHaveBeenCalledTimes(1))
    expect(onDone.mock.calls[0][0].message).toBe('1 livro adicionado aos favoritos')
  })

  it('"Status de leitura" oferece as 3 opções e aplica a escolhida a todos', async () => {
    const { onDone } = setup([makeBook(1), makeBook(2)])

    fireEvent.click(screen.getByRole('button', { name: /Status de leitura/ }))
    expect(screen.getByRole('button', { name: 'Não lido' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Lendo' })).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Lido' }))

    await waitFor(() => expect(onDone).toHaveBeenCalledTimes(1))
    expect(mocks.setBooksReadingStatus).toHaveBeenCalledWith([1, 2], 'finished')
    expect(onDone).toHaveBeenCalledWith({ tone: 'success', message: 'Status de 2 livros alterado para "Lido"' })
  })

  it('abrir um painel fecha o outro (só um expandido por vez)', () => {
    setup([makeBook(1)], [makeCollection(5, 'Série X')])

    fireEvent.click(screen.getByRole('button', { name: /Mover para coleção/ }))
    expect(screen.getByRole('button', { name: 'Série X' })).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: /Status de leitura/ }))
    expect(screen.queryByRole('button', { name: 'Série X' })).toBeNull()
    expect(screen.getByRole('button', { name: 'Lendo' })).toBeTruthy()
  })
})
