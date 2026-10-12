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
  toggleFavorite: vi.fn(),
  deleteBooks: vi.fn(),
  // Guarda o callback que a tela registra no botão voltar do Android, pra poder acioná-lo.
  backHandler: { current: null as (() => void) | null },
}))

vi.mock('@/hooks/useLibraryCatalog', () => ({
  useLibraryCatalog: mocks.useLibraryCatalog,
}))

vi.mock('@/db/books', () => ({
  toggleFavorite: mocks.toggleFavorite,
  setBookTags: vi.fn(),
  deleteBooks: mocks.deleteBooks,
}))

vi.mock('@/hooks/useImportActivity', () => ({
  useIsImportActive: () => false,
}))

vi.mock('@/hooks/useCapacitorAppListener', () => ({
  useCapacitorBackButton: (handler: () => void) => { mocks.backHandler.current = handler },
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

describe('LibraryScreen — seletores de arquivo e pasta (feature 022)', () => {
  beforeEach(() => {
    mocks.useLibraryCatalog.mockReset()
    mocks.useLibraryCatalog.mockReturnValue(buildCatalogMock([], { search: '#empty-state' }))
  })

  it('os dois inputs (arquivos e pasta) aceitam EPUB e PDF', () => {
    const { container } = renderLibraryScreen()
    // Há também um input de imagem (capa manual): só interessam os de livro.
    const inputs = Array.from(container.querySelectorAll<HTMLInputElement>('input[type="file"]')).filter((input) => !input.accept.startsWith('image/'))
    expect(inputs.length).toBeGreaterThanOrEqual(2)
    for (const input of inputs) {
      expect(input.accept).toContain('.epub')
      expect(input.accept).toContain('.pdf')
      expect(input.accept).toContain('application/pdf')
    }
  })
})

describe('LibraryScreen — seleção múltipla (feature 023, US1)', () => {
  let restoreElementDimensions: () => void
  const books = Array.from({ length: 4 }, (_, i) => makeBook(i))

  // Long-press real (500 ms) em vez de fake timers: a tela tem virtualizador e live queries, e
  // timers falsos aqui brigam com os efeitos deles. Custa ~0,5 s por gesto.
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

  async function renderSelecting(onOpenBook = vi.fn(), onOpenHome = vi.fn()) {
    const view = render(
      <LibraryScreen onOpenBook={onOpenBook} onOpenHome={onOpenHome} onOpenDiscover={vi.fn()} onOpenProfile={vi.fn()} />,
    )
    await longPress(rowOf('Livro 1'))
    return { ...view, onOpenBook, onOpenHome }
  }

  beforeEach(() => {
    mocks.useLibraryCatalog.mockReset()
    mocks.deleteBooks.mockReset()
    mocks.backHandler.current = null
    vi.spyOn(window, 'scrollTo').mockImplementation(() => {})
    Object.defineProperty(window, 'scrollY', { value: 0, configurable: true })
    restoreElementDimensions = mockElementDimensions(800, 148)
    mocks.useLibraryCatalog.mockReturnValue(buildCatalogMock(books, { search: '#us1' }))
  })

  afterEach(() => {
    restoreElementDimensions()
  })

  it('long-press numa linha entra no modo: barra com "1 selecionado" e o livro NÃO abre', async () => {
    const { onOpenBook, container } = await renderSelecting()

    expect(screen.getByRole('status').textContent).toBe('1 selecionado')
    expect(screen.getByRole('button', { name: 'Desmarcar Livro 1' }).getAttribute('aria-pressed')).toBe('true')
    expect(onOpenBook).not.toHaveBeenCalled()
    // FR-005: cabeçalho (busca, filtros, ordenar) fica inerte enquanto o modo está ativo.
    expect(container.querySelector('header')?.hasAttribute('inert')).toBe(true)
  })

  it('toque em outro livro marca (2 selecionados) sem abrir', async () => {
    const { onOpenBook } = await renderSelecting()

    fireEvent.click(screen.getByRole('button', { name: 'Selecionar Livro 2' }))

    expect(screen.getByRole('status').textContent).toBe('2 selecionados')
    expect(onOpenBook).not.toHaveBeenCalled()
  })

  it('desmarcar o último livro encerra o modo', async () => {
    const { container } = await renderSelecting()

    fireEvent.click(screen.getByRole('button', { name: 'Desmarcar Livro 1' }))

    expect(screen.queryByRole('status')).toBeNull()
    expect(container.querySelector('header')?.hasAttribute('inert')).toBe(false)
  })

  it('o X sai do modo e o cabeçalho volta', async () => {
    const { container } = await renderSelecting()

    fireEvent.click(screen.getByRole('button', { name: 'Sair da seleção' }))

    expect(screen.queryByRole('status')).toBeNull()
    expect(container.querySelector('header')?.hasAttribute('inert')).toBe(false)
  })

  it('o botão voltar do Android sai do modo sem sair da tela (FR-006)', async () => {
    const { onOpenHome } = await renderSelecting()

    act(() => { mocks.backHandler.current?.() })

    expect(screen.queryByRole('status')).toBeNull()
    expect(onOpenHome).not.toHaveBeenCalled()
  })

  it('fora do modo, o voltar continua levando à Home', () => {
    const onOpenHome = vi.fn()
    render(<LibraryScreen onOpenBook={vi.fn()} onOpenHome={onOpenHome} onOpenDiscover={vi.fn()} onOpenProfile={vi.fn()} />)

    act(() => { mocks.backHandler.current?.() })

    expect(onOpenHome).toHaveBeenCalledTimes(1)
  })

  it('fora do modo, o toque curto na capa continua abrindo o livro (FR-002)', () => {
    const onOpenBook = vi.fn()
    render(<LibraryScreen onOpenBook={onOpenBook} onOpenHome={vi.fn()} onOpenDiscover={vi.fn()} onOpenProfile={vi.fn()} />)

    fireEvent.click(screen.getByText('Livro 2'))

    expect(onOpenBook).toHaveBeenCalledWith(books[1])
  })

  it('excluir em lote: confirma, chama deleteBooks com os ids e encerra o modo com aviso', async () => {
    mocks.deleteBooks.mockResolvedValue({ succeeded: 2, failed: 0 })
    await renderSelecting()
    fireEvent.click(screen.getByRole('button', { name: 'Selecionar Livro 3' }))

    fireEvent.click(screen.getByRole('button', { name: 'Ações em lote' }))
    fireEvent.click(screen.getByRole('button', { name: /Excluir livros selecionados/ }))
    fireEvent.click(screen.getByRole('button', { name: 'Excluir' }))

    await waitFor(() => expect(mocks.deleteBooks).toHaveBeenCalledTimes(1))
    expect(mocks.deleteBooks).toHaveBeenCalledWith([1, 3])
    await screen.findByText('2 livros excluídos')
    expect(screen.queryByRole('button', { name: 'Sair da seleção' })).toBeNull()
  })

  it('falha parcial mostra o aviso com quantos falharam e também encerra o modo (FR-013)', async () => {
    mocks.deleteBooks.mockResolvedValue({ succeeded: 1, failed: 1 })
    await renderSelecting()
    fireEvent.click(screen.getByRole('button', { name: 'Selecionar Livro 2' }))

    fireEvent.click(screen.getByRole('button', { name: 'Ações em lote' }))
    fireEvent.click(screen.getByRole('button', { name: /Excluir livros selecionados/ }))
    fireEvent.click(screen.getByRole('button', { name: 'Excluir' }))

    await screen.findByText('1 de 2 não puderam ser excluídos')
    expect(screen.queryByRole('button', { name: 'Sair da seleção' })).toBeNull()
  })
})

describe('LibraryScreen — seleção múltipla na grade (feature 023)', () => {
  let restoreElementDimensions: () => void

  beforeEach(() => {
    mocks.useLibraryCatalog.mockReset()
    vi.spyOn(window, 'scrollTo').mockImplementation(() => {})
    Object.defineProperty(window, 'scrollY', { value: 0, configurable: true })
    restoreElementDimensions = mockElementDimensions(900, 300)
    localStorage.setItem('neoreader:library-view-mode', 'grid')
    mocks.useLibraryCatalog.mockReturnValue(buildCatalogMock(Array.from({ length: 3 }, (_, i) => makeBook(i)), { search: '#grid' }))
  })

  afterEach(() => {
    restoreElementDimensions()
    localStorage.removeItem('neoreader:library-view-mode')
  })

  it('long-press num card da grade entra no modo de seleção sem abrir o livro', async () => {
    const onOpenBook = vi.fn()
    render(<LibraryScreen onOpenBook={onOpenBook} onOpenHome={vi.fn()} onOpenDiscover={vi.fn()} onOpenProfile={vi.fn()} />)
    // Sem capa no teste não há <img alt>, então o card não tem nome acessível: busca pelo container.
    const card = screen.getByTestId('library-virtual-grid').querySelector('button')
    if (!card) throw new Error('card da grade não encontrado')

    fireEvent.pointerDown(card, { button: 0, clientX: 10, clientY: 10 })
    await act(async () => { await new Promise((resolve) => setTimeout(resolve, 520)) })
    fireEvent.pointerUp(card)
    fireEvent.click(card)

    expect(screen.getByRole('status').textContent).toBe('1 selecionado')
    expect(onOpenBook).not.toHaveBeenCalled()
  })
})
