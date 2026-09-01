import { render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { OpdsCatalog, OpdsDownloadState, OpdsFeedEntry, OpdsSortOrder } from '@/types/opds'

const mocks = vi.hoisted(() => ({
  getCatalog: vi.fn(),
  useOpdsCatalogBrowseReturn: {
    entries: [] as OpdsFeedEntry[],
    loading: false,
    error: false,
    breadcrumb: [{ title: 'Project Gutenberg', url: 'https://example.com/opds/' }],
    canSearch: false,
    searchQuery: '',
    setSearchQuery: vi.fn(),
    sortOrder: 'default' as OpdsSortOrder,
    setSortOrder: vi.fn(),
    hasMore: false,
    loadingMore: false,
    loadMore: vi.fn(),
    navigateTo: vi.fn(),
    navigateToBreadcrumb: vi.fn(),
    getState: vi.fn((): OpdsDownloadState => ({ key: 'x', status: 'idle' })),
    download: vi.fn(),
    openDownloaded: vi.fn(),
  },
}))

vi.mock('@/db/opdsCatalogs', () => ({ getCatalog: mocks.getCatalog }))
vi.mock('@/hooks/useOpdsCatalogBrowse', () => ({
  useOpdsCatalogBrowse: vi.fn(() => mocks.useOpdsCatalogBrowseReturn),
}))
vi.mock('@/hooks/useCapacitorAppListener', () => ({
  useCapacitorBackButton: vi.fn(),
}))

import { OpdsCatalogBrowseScreen } from '@/screens/OpdsCatalogBrowseScreen'

function catalog(overrides: Partial<OpdsCatalog> = {}): OpdsCatalog {
  return {
    id: 1,
    name: 'Project Gutenberg',
    baseUrl: 'https://example.com/opds/',
    hasCredential: false,
    isDefault: true,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  }
}

describe('OpdsCatalogBrowseScreen', () => {
  beforeEach(() => {
    mocks.getCatalog.mockReset()
    mocks.useOpdsCatalogBrowseReturn.entries = []
    mocks.useOpdsCatalogBrowseReturn.loading = false
    mocks.useOpdsCatalogBrowseReturn.error = false
    mocks.useOpdsCatalogBrowseReturn.breadcrumb = [{ title: 'Project Gutenberg', url: 'https://example.com/opds/' }]
    mocks.useOpdsCatalogBrowseReturn.sortOrder = 'default'
    mocks.useOpdsCatalogBrowseReturn.setSortOrder = vi.fn()
  })

  it('mostra "catálogo não encontrado" quando o catalogId não existe mais', async () => {
    mocks.getCatalog.mockResolvedValue(undefined)
    render(<OpdsCatalogBrowseScreen catalogId={999} onBack={vi.fn()} onOpenBook={vi.fn()} />)

    expect(await screen.findByText('Catalogo nao encontrado')).toBeTruthy()
  })

  it('renderiza o título do catálogo e os itens', async () => {
    mocks.getCatalog.mockResolvedValue(catalog())
    mocks.useOpdsCatalogBrowseReturn.entries = [
      { id: 'book-1', title: 'Dune', kind: 'publication', acquisitionUrl: 'https://example.com/1.epub', coverUrl: 'https://example.com/1.jpg' },
    ]

    render(<OpdsCatalogBrowseScreen catalogId={1} onBack={vi.fn()} onOpenBook={vi.fn()} />)

    await waitFor(() => expect(screen.getAllByText('Project Gutenberg').length).toBeGreaterThan(0))
    expect(screen.getByText('Dune')).toBeTruthy()
  })

  it('mostra lista compacta (não grid) quando todas as entries da página são pastas', async () => {
    mocks.getCatalog.mockResolvedValue(catalog())
    mocks.useOpdsCatalogBrowseReturn.entries = [
      { id: 'folder-1', title: 'Pride and Prejudice', kind: 'navigation', navigationUrl: 'https://example.com/opds/1' },
      { id: 'folder-2', title: 'Moby Dick', kind: 'navigation', navigationUrl: 'https://example.com/opds/2' },
    ]

    const { container } = render(<OpdsCatalogBrowseScreen catalogId={1} onBack={vi.fn()} onOpenBook={vi.fn()} />)

    await waitFor(() => expect(screen.getByText('Pride and Prejudice')).toBeTruthy())
    expect(screen.getByText('Moby Dick')).toBeTruthy()
    expect(container.querySelector('.grid')).toBeNull()
  })

  it('mostra grid de cards quando a página tem pelo menos uma entry de publicação (não só pastas)', async () => {
    mocks.getCatalog.mockResolvedValue(catalog())
    mocks.useOpdsCatalogBrowseReturn.entries = [
      { id: 'folder-1', title: 'Pride and Prejudice', kind: 'navigation', navigationUrl: 'https://example.com/opds/1' },
      // coverUrl obrigatório aqui: sem capa, o card mostra o título 2x (fallback
      // + legenda), o que quebra getByText com "multiple elements" ambíguo.
      { id: 'book-1', title: 'Dune', kind: 'publication', acquisitionUrl: 'https://example.com/1.epub', coverUrl: 'https://example.com/1.jpg' },
    ]

    const { container } = render(<OpdsCatalogBrowseScreen catalogId={1} onBack={vi.fn()} onOpenBook={vi.fn()} />)

    await waitFor(() => expect(screen.getByText('Dune')).toBeTruthy())
    expect(container.querySelector('.grid')).toBeTruthy()
  })

  it('mostra estado vazio quando não há itens', async () => {
    mocks.getCatalog.mockResolvedValue(catalog())
    render(<OpdsCatalogBrowseScreen catalogId={1} onBack={vi.fn()} onOpenBook={vi.fn()} />)

    expect(await screen.findByText('Nenhum titulo encontrado')).toBeTruthy()
  })

  it('mostra estado de erro quando a busca falha', async () => {
    mocks.getCatalog.mockResolvedValue(catalog())
    mocks.useOpdsCatalogBrowseReturn.error = true

    render(<OpdsCatalogBrowseScreen catalogId={1} onBack={vi.fn()} onOpenBook={vi.fn()} />)

    expect(await screen.findByText('Nao foi possivel carregar')).toBeTruthy()
  })

  it('mostra breadcrumb quando há mais de um nível de navegação', async () => {
    mocks.getCatalog.mockResolvedValue(catalog())
    mocks.useOpdsCatalogBrowseReturn.breadcrumb = [
      { title: 'Project Gutenberg', url: 'https://example.com/opds/' },
      { title: 'Ficção', url: 'https://example.com/opds/folder-1' },
    ]

    render(<OpdsCatalogBrowseScreen catalogId={1} onBack={vi.fn()} onOpenBook={vi.fn()} />)

    await waitFor(() => expect(screen.getByText('Ficção')).toBeTruthy())
  })

  it('mostra campo de busca só quando canSearch é true', async () => {
    mocks.getCatalog.mockResolvedValue(catalog())
    mocks.useOpdsCatalogBrowseReturn.canSearch = true

    render(<OpdsCatalogBrowseScreen catalogId={1} onBack={vi.fn()} onOpenBook={vi.fn()} />)

    expect(await screen.findByPlaceholderText('Buscar neste catalogo')).toBeTruthy()
    mocks.useOpdsCatalogBrowseReturn.canSearch = false
  })

  it('mostra os chips de ordenação (Popular/Latest/Random) só na raiz do catálogo, e chamar um deles dispara setSortOrder', async () => {
    mocks.getCatalog.mockResolvedValue(catalog())
    render(<OpdsCatalogBrowseScreen catalogId={1} onBack={vi.fn()} onOpenBook={vi.fn()} />)

    const popularChip = await screen.findByText('Populares')
    expect(screen.getByText('Padrao')).toBeTruthy()
    expect(screen.getByText('Recentes')).toBeTruthy()
    expect(screen.getByText('Aleatorio')).toBeTruthy()

    popularChip.click()
    expect(mocks.useOpdsCatalogBrowseReturn.setSortOrder).toHaveBeenCalledWith('downloads')
  })

  it('esconde os chips de ordenação quando há uma pasta aberta (breadcrumb > 1 nível)', async () => {
    mocks.getCatalog.mockResolvedValue(catalog())
    mocks.useOpdsCatalogBrowseReturn.breadcrumb = [
      { title: 'Project Gutenberg', url: 'https://example.com/opds/' },
      { title: 'Ficção', url: 'https://example.com/opds/folder-1' },
    ]

    render(<OpdsCatalogBrowseScreen catalogId={1} onBack={vi.fn()} onOpenBook={vi.fn()} />)

    await waitFor(() => expect(screen.getByText('Ficção')).toBeTruthy())
    expect(screen.queryByText('Populares')).toBeNull()
  })
})
