import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { LibraryBook } from '@/hooks/useLibraryCatalog'
import { mockElementDimensions } from '../testUtils/domMeasurements'

vi.mock('@capacitor/core', () => ({
  Capacitor: { isNativePlatform: () => false },
  registerPlugin: vi.fn(() => ({})),
  WebPlugin: class {},
}))

const mocks = vi.hoisted(() => ({
  useLibraryCatalog: vi.fn(),
  setActiveFilter: vi.fn(),
  hasPin: vi.fn(),
}))

vi.mock('@/hooks/useLibraryCatalog', () => ({
  useLibraryCatalog: mocks.useLibraryCatalog,
}))

vi.mock('@/db/books', () => ({
  toggleFavorite: vi.fn(),
  setBookTags: vi.fn(),
  deleteBooks: vi.fn(),
  setBookProtected: vi.fn(),
}))

vi.mock('@/services/BookProtectionService', () => ({
  BookProtectionService: { hasPin: mocks.hasPin },
}))

vi.mock('@/hooks/useImportActivity', () => ({
  useIsImportActive: () => false,
}))

vi.mock('@/hooks/useCapacitorAppListener', () => ({
  useCapacitorBackButton: vi.fn(),
}))

vi.mock('@/services/NativeLibraryImportService', () => ({
  consumePendingNativeFolderSelection: vi.fn().mockResolvedValue(null),
  consumePendingNativeFileSelection: vi.fn().mockResolvedValue(null),
  selectNativeEpubFolder: vi.fn().mockResolvedValue(null),
  selectNativeEpubFile: vi.fn().mockResolvedValue(null),
}))

import { LibraryScreen } from '@/screens/LibraryScreen'
import { useBookLockStore } from '@/store/bookLockStore'

function makeBook(index: number, overrides: Partial<LibraryBook> = {}): LibraryBook {
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
    ...overrides,
  }
}

function mockCatalog(books: LibraryBook[], activeFilter = 'all', filtered = books) {
  mocks.useLibraryCatalog.mockReturnValue({
    isLoading: false,
    books,
    filteredBooks: filtered,
    tags: [],
    collections: [],
    search: '',
    setSearch: vi.fn(),
    activeFilter,
    setActiveFilter: mocks.setActiveFilter,
    sort: 'recent',
    setSort: vi.fn(),
  })
}

function renderLibrary() {
  return render(
    <LibraryScreen
      onOpenBook={vi.fn()}
      onOpenHome={vi.fn()}
      onOpenDiscover={vi.fn()}
      onOpenProfile={vi.fn()}
    />,
  )
}

// Long-press com tempo real: timers falsos brigam com os efeitos das linhas (ver LibraryScreen.test).
async function longPress(element: Element) {
  fireEvent.pointerDown(element, { button: 0, clientX: 10, clientY: 10 })
  await act(async () => { await new Promise((resolve) => setTimeout(resolve, 520)) })
  fireEvent.pointerUp(element)
  fireEvent.click(element)
}

function rowOf(title: string) {
  const row = screen.getByText(title).closest('article')
  if (!row) throw new Error(`linha de "${title}" não encontrada`)
  return row
}

describe('LibraryScreen — grupo "Protegidos" e seleção (feature 024)', () => {
  let restoreDimensions: () => void

  beforeEach(() => {
    restoreDimensions = mockElementDimensions(1024, 800)
    window.localStorage.setItem('neoreader:library-view-mode', 'list')
    mocks.useLibraryCatalog.mockReset()
    mocks.setActiveFilter.mockReset()
    mocks.hasPin.mockResolvedValue(true)
    useBookLockStore.getState().settlePrompt(false)
    useBookLockStore.setState({ unlocked: false, prompt: null, setup: null })
  })

  afterEach(() => {
    restoreDimensions()
    window.localStorage.clear()
  })

  it('o chip "Protegidos" não aparece sem livro protegido', () => {
    mockCatalog([makeBook(0), makeBook(1)])
    renderLibrary()

    expect(screen.queryByText(/Protegidos/)).toBeNull()
  })

  it('com livro protegido o chip aparece e ativa o filtro', () => {
    mockCatalog([makeBook(0, { isProtected: true }), makeBook(1)])
    renderLibrary()

    fireEvent.click(screen.getByRole('button', { name: /Protegidos/ }))

    expect(mocks.setActiveFilter).toHaveBeenCalledWith('protected')
  })

  it('filtro ativo e bloqueado: "Desbloquear" pede o PIN uma vez e libera todos', async () => {
    const books = [makeBook(0, { isProtected: true }), makeBook(1, { isProtected: true })]
    mockCatalog(books, 'protected')
    renderLibrary()

    expect(screen.getByText('Livros protegidos bloqueados')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Desbloquear' }))

    await waitFor(() => expect(useBookLockStore.getState().prompt).not.toBeNull())
    act(() => { useBookLockStore.getState().settlePrompt(true) })

    expect(await screen.findByText('Livros protegidos desbloqueados')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Bloquear agora' }))
    expect(useBookLockStore.getState().unlocked).toBe(false)
  })

  it('o filtro volta para "Todos" quando não resta livro protegido', async () => {
    mockCatalog([makeBook(0), makeBook(1)], 'protected')
    renderLibrary()

    await waitFor(() => expect(mocks.setActiveFilter).toHaveBeenCalledWith('all'))
  })

  it('long-press em livro protegido BLOQUEADO não seleciona e avisa', async () => {
    mockCatalog([makeBook(0, { isProtected: true }), makeBook(1)])
    renderLibrary()

    await longPress(rowOf('Livro 1'))

    expect(await screen.findByText('Desbloqueie para selecionar')).toBeTruthy()
    expect(screen.queryAllByText('1 selecionado')).toHaveLength(0)
  })

  it('livro protegido DESBLOQUEADO seleciona como os demais', async () => {
    useBookLockStore.getState().unlock()
    mockCatalog([makeBook(0, { isProtected: true }), makeBook(1)])
    renderLibrary()

    await longPress(rowOf('Livro 1'))

    expect((await screen.findAllByText('1 selecionado')).length).toBeGreaterThan(0)
  })

  it('re-bloquear com um protegido selecionado limpa a seleção', async () => {
    useBookLockStore.getState().unlock()
    mockCatalog([makeBook(0, { isProtected: true }), makeBook(1)])
    renderLibrary()
    await longPress(rowOf('Livro 1'))
    await screen.findAllByText('1 selecionado')

    act(() => { useBookLockStore.getState().lock() })

    await waitFor(() => expect(screen.queryAllByText('1 selecionado')).toHaveLength(0))
  })

  it('livro comum seleciona normalmente com o app bloqueado', async () => {
    mockCatalog([makeBook(0, { isProtected: true }), makeBook(1)])
    renderLibrary()

    await longPress(rowOf('Livro 2'))

    expect((await screen.findAllByText('1 selecionado')).length).toBeGreaterThan(0)
  })

  it('o menu "⋯" de livro protegido bloqueado pede o PIN antes de abrir a folha de ações', async () => {
    mockCatalog([makeBook(0, { isProtected: true })])
    renderLibrary()

    fireEvent.click(screen.getByRole('button', { name: 'Opcoes do livro' }))

    await waitFor(() => expect(useBookLockStore.getState().prompt).not.toBeNull())
    // A folha fechada continua montada, mas inerte e fora da árvore de acessibilidade.
    expect(screen.queryByRole('dialog', { name: 'Ações rápidas' })).toBeNull()
  })

  it('livro protegido bloqueado na lista mostra só título e cadeado', () => {
    mockCatalog([makeBook(0, { isProtected: true })])
    renderLibrary()

    expect(screen.getByText('Livro 1')).toBeTruthy()
    expect(screen.queryByText('Autor 1')).toBeNull()
    expect(screen.getByRole('img', { name: 'Protegido, bloqueado' })).toBeTruthy()
  })
})
