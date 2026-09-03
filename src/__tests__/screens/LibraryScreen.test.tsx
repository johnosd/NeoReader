import { fireEvent, render, screen } from '@testing-library/react'
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
  toggleFavorite: vi.fn(),
}))

vi.mock('@/hooks/useLibraryCatalog', () => ({
  useLibraryCatalog: mocks.useLibraryCatalog,
}))

vi.mock('@/db/books', () => ({
  toggleFavorite: mocks.toggleFavorite,
  setBookTags: vi.fn(),
}))

vi.mock('@/hooks/useImportActivity', () => ({
  useIsImportActive: () => false,
}))

vi.mock('@/hooks/useCapacitorAppListener', () => ({
  useCapacitorBackButton: () => undefined,
}))

vi.mock('@/services/NativeLibraryImportService', () => ({
  consumePendingNativeFolderSelection: vi.fn().mockResolvedValue(null),
  consumePendingNativeFileSelection: vi.fn().mockResolvedValue(null),
  selectNativeEpubFolder: vi.fn().mockResolvedValue(null),
  selectNativeEpubFile: vi.fn().mockResolvedValue(null),
}))

import { LibraryScreen } from '@/screens/LibraryScreen'

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

interface CatalogOverrides {
  search?: string
  activeFilter?: string
}

function buildCatalogMock(books: LibraryBook[], overrides: CatalogOverrides = {}) {
  return {
    isLoading: false,
    books,
    filteredBooks: books,
    tags: [],
    collections: [],
    search: overrides.search ?? '',
    setSearch: vi.fn(),
    activeFilter: overrides.activeFilter ?? 'all',
    setActiveFilter: vi.fn(),
    sort: 'recent',
    setSort: vi.fn(),
  }
}

function renderLibraryScreen() {
  return render(
    <LibraryScreen
      onOpenBook={vi.fn()}
      onOpenHome={vi.fn()}
      onOpenDiscover={vi.fn()}
      onOpenProfile={vi.fn()}
    />,
  )
}

describe('LibraryScreen (empty state)', () => {
  beforeEach(() => {
    mocks.useLibraryCatalog.mockReset()
    mocks.toggleFavorite.mockReset()
    mocks.useLibraryCatalog.mockReturnValue(buildCatalogMock([], { search: '#empty-state' }))
  })

  it('mostra o atalho de baixar classico gratis e chama onOpenDiscover ao tocar', () => {
    const onOpenDiscover = vi.fn()

    render(
      <LibraryScreen
        onOpenBook={vi.fn()}
        onOpenHome={vi.fn()}
        onOpenDiscover={onOpenDiscover}
        onOpenProfile={vi.fn()}
      />,
    )

    const shortcut = screen.getByText('Baixar um classico gratis')
    fireEvent.click(shortcut)

    expect(onOpenDiscover).toHaveBeenCalledTimes(1)
  })
})

describe('LibraryScreen (virtualização)', () => {
  let restoreElementDimensions: () => void

  beforeEach(() => {
    mocks.useLibraryCatalog.mockReset()
    mocks.toggleFavorite.mockReset()
    vi.spyOn(window, 'scrollTo').mockImplementation(() => {})
    // Garante ponto de partida limpo — outro teste pode ter deixado
    // window.scrollY em outro valor (jsdom nao reseta isso sozinho entre testes).
    Object.defineProperty(window, 'scrollY', { value: 0, configurable: true })
    // Sem isso, o measureElement do virtualizador mede tudo como 0px (jsdom
    // nao faz layout de verdade) e o calculo da janela visivel degenera.
    restoreElementDimensions = mockElementDimensions(800, 148)
  })

  afterEach(() => {
    restoreElementDimensions()
  })

  it('T008: renderiza so uma fracao das linhas no DOM com uma biblioteca grande', () => {
    const books = Array.from({ length: 500 }, (_, i) => makeBook(i))
    mocks.useLibraryCatalog.mockReturnValue(buildCatalogMock(books, { search: '#t008' }))

    renderLibraryScreen()

    const rows = screen.getAllByRole('article')
    expect(rows.length).toBeGreaterThan(0)
    expect(rows.length).toBeLessThan(books.length)
  })

  it('T008a: com uma biblioteca pequena, renderiza todos os livros normalmente (FR-006)', () => {
    const books = Array.from({ length: 4 }, (_, i) => makeBook(i))
    mocks.useLibraryCatalog.mockReturnValue(buildCatalogMock(books, { search: '#t008a' }))

    renderLibraryScreen()

    expect(screen.getAllByRole('article')).toHaveLength(4)
    for (const book of books) {
      // getByText lanca se nao encontrar — a chamada em si ja e a asserção.
      screen.getByText(book.title)
    }
  })

  it('T008b: clicar em favoritar numa linha virtualizada chama toggleFavorite com o id correto (FR-005)', () => {
    const books = Array.from({ length: 500 }, (_, i) => makeBook(i))
    mocks.useLibraryCatalog.mockReturnValue(buildCatalogMock(books, { search: '#t008b' }))
    mocks.toggleFavorite.mockResolvedValue(undefined)

    renderLibraryScreen()

    const favoriteButtons = screen.getAllByRole('button', { name: 'Favoritar' })
    fireEvent.click(favoriteButtons[0])

    expect(mocks.toggleFavorite).toHaveBeenCalledWith(books[0].id)
  })

  it('T008c: o container da lista virtualizada nao introduz overflow/scroll interno proprio (FR-002)', () => {
    const books = Array.from({ length: 500 }, (_, i) => makeBook(i))
    mocks.useLibraryCatalog.mockReturnValue(buildCatalogMock(books, { search: '#t008c' }))

    renderLibraryScreen()

    const listContainer = screen.getByTestId('library-virtual-list')
    expect(listContainer.style.overflow).toBe('')
    expect(listContainer.style.overflowY).toBe('')
  })

  it('T009: mudar filtro/busca/ordenacao reseta o scroll pro topo', () => {
    const books = Array.from({ length: 500 }, (_, i) => makeBook(i))
    const catalog = buildCatalogMock(books, { search: '#t009' })
    mocks.useLibraryCatalog.mockReturnValue(catalog)
    const scrollToSpy = window.scrollTo as unknown as ReturnType<typeof vi.fn>

    const { rerender } = renderLibraryScreen()
    scrollToSpy.mockClear()

    mocks.useLibraryCatalog.mockReturnValue({ ...catalog, activeFilter: 'favorites' })
    rerender(
      <LibraryScreen
        onOpenBook={vi.fn()}
        onOpenHome={vi.fn()}
        onOpenDiscover={vi.fn()}
        onOpenProfile={vi.fn()}
      />,
    )

    expect(scrollToSpy).toHaveBeenCalledWith(0, 0)
  })

  it('T010: remontar com a mesma assinatura de filtro/busca/ordenacao restaura a posicao de scroll salva', () => {
    const books = Array.from({ length: 500 }, (_, i) => makeBook(i))
    const catalog = buildCatalogMock(books, { search: '#t010' })
    mocks.useLibraryCatalog.mockReturnValue(catalog)
    const scrollToSpy = window.scrollTo as unknown as ReturnType<typeof vi.fn>

    const { unmount } = renderLibraryScreen()
    Object.defineProperty(window, 'scrollY', { value: 620, configurable: true })
    window.dispatchEvent(new Event('scroll'))
    unmount()

    scrollToSpy.mockClear()
    renderLibraryScreen()

    expect(scrollToSpy).toHaveBeenCalledWith(0, 620)
  })

  it('T015: no modo grid, a tela renderiza o grid virtualizado e mudar filtro reseta o scroll (assinatura inclui viewMode)', () => {
    localStorage.setItem('neoreader:library-view-mode', 'grid')
    try {
      const books = Array.from({ length: 500 }, (_, i) => makeBook(i))
      const catalog = buildCatalogMock(books, { search: '#t015' })
      mocks.useLibraryCatalog.mockReturnValue(catalog)
      const scrollToSpy = window.scrollTo as unknown as ReturnType<typeof vi.fn>

      const { rerender } = renderLibraryScreen()
      expect(screen.getByTestId('library-virtual-grid')).toBeTruthy()
      scrollToSpy.mockClear()

      mocks.useLibraryCatalog.mockReturnValue({ ...catalog, activeFilter: 'favorites' })
      rerender(
        <LibraryScreen
          onOpenBook={vi.fn()}
          onOpenHome={vi.fn()}
          onOpenDiscover={vi.fn()}
          onOpenProfile={vi.fn()}
        />,
      )

      expect(scrollToSpy).toHaveBeenCalledWith(0, 0)
    } finally {
      localStorage.removeItem('neoreader:library-view-mode')
    }
  })
})
