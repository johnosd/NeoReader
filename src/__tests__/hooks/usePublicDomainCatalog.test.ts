import { renderHook, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { PublicDomainCatalogEntry } from '@/services/PublicDomainCatalogService'

const mocks = vi.hoisted(() => ({
  listCatalog: vi.fn(),
  fetchNewReleasesSample: vi.fn(),
  findBookByFileName: vi.fn(),
  getBookById: vi.fn(),
  download: vi.fn(),
}))

vi.mock('@/services/PublicDomainCatalogService', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/services/PublicDomainCatalogService')>()
  return {
    ...actual,
    PublicDomainCatalogService: { listCatalog: mocks.listCatalog, fetchNewReleasesSample: mocks.fetchNewReleasesSample },
  }
})
vi.mock('@/db/books', () => ({ findBookByFileName: mocks.findBookByFileName, getBookById: mocks.getBookById }))
vi.mock('@/services/PublicDomainDownloadService', () => ({ PublicDomainDownloadService: { download: mocks.download } }))

import { usePublicDomainCatalog } from '@/hooks/usePublicDomainCatalog'

const curatedEntry: PublicDomainCatalogEntry = {
  id: 'jane-austen_pride-and-prejudice',
  title: 'Pride and Prejudice',
  author: 'Jane Austen',
  authorSlug: 'jane-austen',
  titleSlug: 'pride-and-prejudice',
}

const liveEntry: PublicDomainCatalogEntry = {
  id: 'samuel-taylor-coleridge_robert-southey_the-fall-of-robespierre',
  title: 'The Fall of Robespierre',
  author: 'Samuel Taylor Coleridge, Robert Southey',
  authorSlug: 'samuel-taylor-coleridge_robert-southey',
  titleSlug: 'the-fall-of-robespierre',
}

describe('usePublicDomainCatalog', () => {
  beforeEach(() => {
    mocks.listCatalog.mockReset().mockResolvedValue([curatedEntry])
    mocks.fetchNewReleasesSample.mockReset()
    mocks.findBookByFileName.mockReset().mockResolvedValue(undefined)
    mocks.getBookById.mockReset()
    mocks.download.mockReset()
  })

  it('usa a amostra ao vivo quando o feed responde', async () => {
    mocks.fetchNewReleasesSample.mockResolvedValue([liveEntry])

    const { result } = renderHook(() => usePublicDomainCatalog(vi.fn()))

    await waitFor(() => expect(result.current.sampleLoading).toBe(false))
    expect(result.current.sampleEntries).toEqual([liveEntry])
    expect(result.current.entries).toEqual([curatedEntry]) // lista curada intacta, usada só no "ver mais"
  })

  it('cai pros primeiros itens da lista curada quando o feed ao vivo falha (US5)', async () => {
    mocks.fetchNewReleasesSample.mockRejectedValue(new Error('offline'))

    const { result } = renderHook(() => usePublicDomainCatalog(vi.fn()))

    await waitFor(() => expect(result.current.sampleLoading).toBe(false))
    expect(result.current.sampleEntries).toEqual([curatedEntry])
  })

  it('reconcilia "já baixado" tanto pra lista curada quanto pra amostra ao vivo', async () => {
    mocks.fetchNewReleasesSample.mockResolvedValue([liveEntry])
    mocks.findBookByFileName.mockImplementation(async (fileName: string) =>
      fileName === 'samuel-taylor-coleridge_robert-southey_the-fall-of-robespierre.epub' ? { id: 99 } : undefined)

    const { result } = renderHook(() => usePublicDomainCatalog(vi.fn()))

    await waitFor(() => expect(result.current.getState(liveEntry.id).status).toBe('success'))
    expect(result.current.getState(liveEntry.id).bookId).toBe(99)
  })
})
