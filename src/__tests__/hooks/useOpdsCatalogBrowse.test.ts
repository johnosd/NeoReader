import { act, renderHook, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { OpdsCatalog, OpdsFeedEntry, OpdsFeedPage } from '@/types/opds'

const mocks = vi.hoisted(() => ({
  fetchPage: vi.fn(),
  search: vi.fn(),
  // Identidade por padrão — resolução de capa autenticada é testada à parte
  // em OpdsCatalogService.test.ts, não precisa mudar as entries aqui.
  resolveEntryCovers: vi.fn((_catalog: OpdsCatalog, entries: OpdsFeedEntry[]) => Promise.resolve(entries)),
  findDownloadedBookId: vi.fn(),
  download: vi.fn(),
  getBookById: vi.fn(),
}))

vi.mock('@/services/opds/OpdsCatalogService', () => ({
  OpdsCatalogService: { fetchPage: mocks.fetchPage, search: mocks.search, resolveEntryCovers: mocks.resolveEntryCovers },
}))
vi.mock('@/db/opdsDownloadedEntries', () => ({ findDownloadedBookId: mocks.findDownloadedBookId }))
vi.mock('@/services/opds/OpdsDownloadService', () => ({ OpdsDownloadService: { download: mocks.download } }))
vi.mock('@/db/books', () => ({ getBookById: mocks.getBookById }))

import { useOpdsCatalogBrowse } from '@/hooks/useOpdsCatalogBrowse'

const catalog: OpdsCatalog = {
  id: 1,
  name: 'Project Gutenberg',
  baseUrl: 'https://example.com/opds/',
  hasCredential: false,
  isDefault: true,
  createdAt: new Date(),
  updatedAt: new Date(),
}

const folderEntry: OpdsFeedEntry = { id: 'folder-1', title: 'Ficção', kind: 'navigation', navigationUrl: 'https://example.com/opds/folder-1' }
const bookEntry: OpdsFeedEntry = { id: 'book-1', title: 'Dune', kind: 'publication', acquisitionUrl: 'https://example.com/1.epub' }

function page(entries: OpdsFeedEntry[], extra: Partial<OpdsFeedPage> = {}): OpdsFeedPage {
  return { entries, ...extra }
}

describe('useOpdsCatalogBrowse', () => {
  beforeEach(() => {
    mocks.fetchPage.mockReset()
    mocks.search.mockReset()
    mocks.findDownloadedBookId.mockReset().mockResolvedValue(null)
    mocks.download.mockReset()
    mocks.getBookById.mockReset()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('carrega a raiz do catálogo ao montar', async () => {
    mocks.fetchPage.mockResolvedValue(page([folderEntry, bookEntry], { nextPageUrl: 'https://example.com/opds/?page=2', searchUrl: 'search{?q}' }))

    const { result } = renderHook(() => useOpdsCatalogBrowse(catalog, 'Project Gutenberg', vi.fn()))

    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(mocks.fetchPage).toHaveBeenCalledWith(catalog, catalog.baseUrl, 'default')
    expect(result.current.entries).toEqual([folderEntry, bookEntry])
    expect(result.current.breadcrumb).toEqual([{ title: 'Project Gutenberg', url: catalog.baseUrl }])
    expect(result.current.hasMore).toBe(true)
    expect(result.current.canSearch).toBe(true)
  })

  it('navigateTo empilha o breadcrumb e busca a pasta nova', async () => {
    mocks.fetchPage.mockResolvedValueOnce(page([folderEntry]))
    const { result } = renderHook(() => useOpdsCatalogBrowse(catalog, 'Project Gutenberg', vi.fn()))
    await waitFor(() => expect(result.current.loading).toBe(false))

    mocks.fetchPage.mockResolvedValueOnce(page([bookEntry]))
    act(() => result.current.navigateTo(folderEntry))

    await waitFor(() => expect(result.current.breadcrumb).toHaveLength(2))
    expect(mocks.fetchPage).toHaveBeenLastCalledWith(catalog, folderEntry.navigationUrl, 'default')
    await waitFor(() => expect(result.current.entries).toEqual([bookEntry]))
  })

  it('navigateToBreadcrumb volta pra um nível anterior', async () => {
    mocks.fetchPage.mockResolvedValue(page([folderEntry]))
    const { result } = renderHook(() => useOpdsCatalogBrowse(catalog, 'Project Gutenberg', vi.fn()))
    await waitFor(() => expect(result.current.loading).toBe(false))

    act(() => result.current.navigateTo(folderEntry))
    await waitFor(() => expect(result.current.breadcrumb).toHaveLength(2))

    act(() => result.current.navigateToBreadcrumb(0))
    await waitFor(() => expect(result.current.breadcrumb).toHaveLength(1))
    expect(result.current.breadcrumb[0]).toEqual({ title: 'Project Gutenberg', url: catalog.baseUrl })
  })

  it('loadMore concatena os itens da próxima página', async () => {
    mocks.fetchPage.mockResolvedValueOnce(page([bookEntry], { nextPageUrl: 'https://example.com/opds/?page=2' }))
    const { result } = renderHook(() => useOpdsCatalogBrowse(catalog, 'Project Gutenberg', vi.fn()))
    await waitFor(() => expect(result.current.loading).toBe(false))

    const secondBook: OpdsFeedEntry = { ...bookEntry, id: 'book-2', title: 'Foundation' }
    mocks.fetchPage.mockResolvedValueOnce(page([secondBook]))
    act(() => result.current.loadMore())

    await waitFor(() => expect(result.current.entries).toEqual([bookEntry, secondBook]))
    expect(mocks.fetchPage).toHaveBeenLastCalledWith(catalog, 'https://example.com/opds/?page=2')
  })

  it('busca com debounce chama OpdsCatalogService.search com o searchUrl da página raiz', async () => {
    mocks.fetchPage.mockResolvedValueOnce(page([bookEntry], { searchUrl: 'search{?q}' }))
    const { result } = renderHook(() => useOpdsCatalogBrowse(catalog, 'Project Gutenberg', vi.fn()))
    await waitFor(() => expect(result.current.loading).toBe(false))

    mocks.search.mockResolvedValueOnce(page([{ ...bookEntry, title: 'Resultado da busca' }]))
    act(() => result.current.setSearchQuery('dune'))

    await waitFor(() => expect(mocks.search).toHaveBeenCalledWith(catalog, 'search{?q}', 'dune', 'default'), { timeout: 2000 })
    await waitFor(() => expect(result.current.entries[0]?.title).toBe('Resultado da busca'))
  })

  it('limpar a busca volta a mostrar a navegação normal', async () => {
    mocks.fetchPage.mockResolvedValue(page([bookEntry], { searchUrl: 'search{?q}' }))
    const { result } = renderHook(() => useOpdsCatalogBrowse(catalog, 'Project Gutenberg', vi.fn()))
    await waitFor(() => expect(result.current.loading).toBe(false))

    mocks.search.mockResolvedValueOnce(page([{ ...bookEntry, title: 'Resultado da busca' }]))
    act(() => result.current.setSearchQuery('dune'))
    await waitFor(() => expect(result.current.entries[0]?.title).toBe('Resultado da busca'), { timeout: 2000 })

    act(() => result.current.setSearchQuery(''))
    await waitFor(() => expect(result.current.entries[0]?.title).toBe('Dune'))
  })

  it('marca error:true quando o fetch da pasta falha', async () => {
    mocks.fetchPage.mockRejectedValue(new Error('falhou'))
    const { result } = renderHook(() => useOpdsCatalogBrowse(catalog, 'Project Gutenberg', vi.fn()))

    await waitFor(() => expect(result.current.error).toBe(true))
    expect(result.current.entries).toEqual([])
  })

  it('setSortOrder refaz o fetch da URL atual com o sort_order escolhido (convenção do Gutenberg)', async () => {
    mocks.fetchPage.mockResolvedValueOnce(page([bookEntry]))
    const { result } = renderHook(() => useOpdsCatalogBrowse(catalog, 'Project Gutenberg', vi.fn()))
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.sortOrder).toBe('default')

    const popularBook: OpdsFeedEntry = { ...bookEntry, title: 'Foundation' }
    mocks.fetchPage.mockResolvedValueOnce(page([popularBook]))
    act(() => result.current.setSortOrder('downloads'))

    await waitFor(() => expect(result.current.entries[0]?.title).toBe('Foundation'))
    expect(mocks.fetchPage).toHaveBeenLastCalledWith(catalog, catalog.baseUrl, 'downloads')
  })

  it('reconcilia "já na biblioteca" pra entries carregadas na navegação (US3, AC5)', async () => {
    mocks.fetchPage.mockResolvedValue(page([bookEntry]))
    mocks.findDownloadedBookId.mockResolvedValue(42)

    const { result } = renderHook(() => useOpdsCatalogBrowse(catalog, 'Project Gutenberg', vi.fn()))
    await waitFor(() => expect(result.current.getState(bookEntry).status).toBe('success'))
    expect(result.current.getState(bookEntry).bookId).toBe(42)
  })
})
