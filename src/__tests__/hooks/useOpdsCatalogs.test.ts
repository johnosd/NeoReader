import { renderHook, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Book } from '@/types/book'
import type { OpdsCatalog, OpdsFeedEntry, OpdsFeedPage } from '@/types/opds'

const mocks = vi.hoisted(() => ({
  listCatalogs: vi.fn(),
  fetchSample: vi.fn(),
  findDownloadedBookId: vi.fn(),
  download: vi.fn(),
  getBookById: vi.fn(),
}))

vi.mock('@/db/opdsCatalogs', () => ({ listCatalogs: mocks.listCatalogs }))
vi.mock('@/services/opds/OpdsCatalogService', () => ({ OpdsCatalogService: { fetchSample: mocks.fetchSample } }))
vi.mock('@/db/opdsDownloadedEntries', () => ({ findDownloadedBookId: mocks.findDownloadedBookId }))
vi.mock('@/services/opds/OpdsDownloadService', () => ({ OpdsDownloadService: { download: mocks.download } }))
vi.mock('@/db/books', () => ({ getBookById: mocks.getBookById }))

import { useOpdsCatalogs } from '@/hooks/useOpdsCatalogs'

const catalog: OpdsCatalog = {
  id: 1,
  name: 'Project Gutenberg',
  baseUrl: 'https://www.gutenberg.org/ebooks/search.opds/',
  hasCredential: false,
  isDefault: true,
  createdAt: new Date(),
  updatedAt: new Date(),
}

const entry: OpdsFeedEntry = { id: 'urn:book-1', title: 'Dune', kind: 'publication', acquisitionUrl: 'https://example.com/1.epub' }

function page(entries: OpdsFeedEntry[]): OpdsFeedPage {
  return { entries }
}

describe('useOpdsCatalogs', () => {
  beforeEach(() => {
    mocks.listCatalogs.mockReset()
    mocks.fetchSample.mockReset()
    mocks.findDownloadedBookId.mockReset().mockResolvedValue(null)
    mocks.download.mockReset()
    mocks.getBookById.mockReset()
  })

  it('carrega os catálogos e a amostra de cada um', async () => {
    mocks.listCatalogs.mockResolvedValue([catalog])
    mocks.fetchSample.mockResolvedValue(page([entry]))

    const { result } = renderHook(() => useOpdsCatalogs(vi.fn()))

    await waitFor(() => expect(result.current.rows[0]?.loading).toBe(false))
    expect(result.current.rows).toEqual([{ catalog, entries: [entry], loading: false, error: false, offline: false }])
  })

  it('marca error:true por catálogo quando a busca da amostra falha, sem afetar outros catálogos', async () => {
    const brokenCatalog: OpdsCatalog = { ...catalog, id: 2, name: 'Quebrado' }
    mocks.listCatalogs.mockResolvedValue([catalog, brokenCatalog])
    mocks.fetchSample.mockImplementation(async (c: OpdsCatalog) => {
      if (c.id === 2) throw new Error('falhou')
      return page([entry])
    })

    const { result } = renderHook(() => useOpdsCatalogs(vi.fn()))

    await waitFor(() => {
      expect(result.current.rows).toHaveLength(2)
      expect(result.current.rows.every((row) => !row.loading)).toBe(true)
    })
    const ok = result.current.rows.find((row) => row.catalog.id === 1)
    const broken = result.current.rows.find((row) => row.catalog.id === 2)
    expect(ok).toEqual({ catalog, entries: [entry], loading: false, error: false, offline: false })
    expect(broken).toEqual({ catalog: brokenCatalog, entries: [], loading: false, error: true, offline: false })
  })

  it('reconcilia como "já na biblioteca" quando a entry já foi baixada numa sessão anterior', async () => {
    mocks.listCatalogs.mockResolvedValue([catalog])
    mocks.fetchSample.mockResolvedValue(page([entry]))
    mocks.findDownloadedBookId.mockResolvedValue(42)

    const { result } = renderHook(() => useOpdsCatalogs(vi.fn()))

    await waitFor(() => expect(result.current.getState(1, entry).status).toBe('success'))
    expect(result.current.getState(1, entry).bookId).toBe(42)
  })

  it('download delega pro OpdsDownloadService', async () => {
    mocks.listCatalogs.mockResolvedValue([catalog])
    mocks.fetchSample.mockResolvedValue(page([entry]))
    mocks.download.mockResolvedValue(1)

    const { result } = renderHook(() => useOpdsCatalogs(vi.fn()))
    await waitFor(() => expect(result.current.rows[0]?.loading).toBe(false))

    result.current.download(catalog, entry)
    await waitFor(() => expect(mocks.download).toHaveBeenCalledWith(catalog, entry))
  })

  it('openDownloaded busca o Book e chama onOpenBook quando já baixado', async () => {
    mocks.listCatalogs.mockResolvedValue([catalog])
    mocks.fetchSample.mockResolvedValue(page([entry]))
    mocks.findDownloadedBookId.mockResolvedValue(42)
    const fakeBook = { id: 42, title: 'Dune' } as Book
    mocks.getBookById.mockResolvedValue(fakeBook)
    const onOpenBook = vi.fn()

    const { result } = renderHook(() => useOpdsCatalogs(onOpenBook))
    await waitFor(() => expect(result.current.getState(1, entry).status).toBe('success'))

    result.current.openDownloaded(catalog, entry)
    await waitFor(() => expect(onOpenBook).toHaveBeenCalledWith(fakeBook))
  })

  it('marca offline:true quando navigator.onLine é false no momento da falha (US5)', async () => {
    const onLineSpy = vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false)
    mocks.listCatalogs.mockResolvedValue([catalog])
    mocks.fetchSample.mockRejectedValue(new Error('sem rede'))

    const { result } = renderHook(() => useOpdsCatalogs(vi.fn()))

    await waitFor(() => expect(result.current.rows[0]?.error).toBe(true))
    expect(result.current.rows[0]?.offline).toBe(true)

    onLineSpy.mockRestore()
  })

  it('retryCatalog refaz a busca só daquele catálogo (US5)', async () => {
    mocks.listCatalogs.mockResolvedValue([catalog])
    mocks.fetchSample.mockRejectedValueOnce(new Error('falhou'))

    const { result } = renderHook(() => useOpdsCatalogs(vi.fn()))
    await waitFor(() => expect(result.current.rows[0]?.error).toBe(true))

    mocks.fetchSample.mockResolvedValueOnce(page([entry]))
    result.current.retryCatalog(catalog)

    await waitFor(() => expect(result.current.rows[0]?.error).toBe(false))
    expect(result.current.rows[0]?.entries).toEqual([entry])
    expect(mocks.fetchSample).toHaveBeenCalledTimes(2)
  })
})
