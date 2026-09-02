import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { PublicDomainCatalogEntry } from '@/services/PublicDomainCatalogService'
import type { PublicDomainDownloadState } from '@/services/PublicDomainDownloadCoordinator'

const mocks = vi.hoisted(() => ({
  usePublicDomainCatalog: vi.fn(() => ({
    entries: [],
    sampleEntries: [],
    loading: false,
    sampleLoading: false,
    error: false,
    getState: vi.fn((): PublicDomainDownloadState => ({ entryId: 'x', status: 'idle' })),
    download: vi.fn(),
    openDownloaded: vi.fn(),
  })),
}))

vi.mock('@/hooks/usePublicDomainCatalog', () => ({ usePublicDomainCatalog: mocks.usePublicDomainCatalog }))

import { PublicDomainCatalogSection } from '@/components/PublicDomainCatalogSection'

const sampleEntry: PublicDomainCatalogEntry = {
  id: 'jane-austen_pride-and-prejudice',
  title: 'Pride and Prejudice',
  author: 'Jane Austen',
  authorSlug: 'jane-austen',
  titleSlug: 'pride-and-prejudice',
}

describe('PublicDomainCatalogSection', () => {
  beforeEach(() => {
    mocks.usePublicDomainCatalog.mockReset().mockReturnValue({
      entries: [],
      sampleEntries: [],
      loading: false,
      sampleLoading: false,
      error: false,
      getState: vi.fn((): PublicDomainDownloadState => ({ entryId: 'x', status: 'idle' })),
      download: vi.fn(),
      openDownloaded: vi.fn(),
    })
  })

  it('mostra título/subtítulo e o botão "ver mais" (mesmo padrão das rows OPDS)', () => {
    render(<PublicDomainCatalogSection onOpenBook={vi.fn()} onSeeMore={vi.fn()} />)

    expect(screen.getByText('Classicos em Ingles')).toBeTruthy()
    expect(screen.getByText('Ver mais')).toBeTruthy()
  })

  it('dispara onSeeMore ao tocar em "ver mais"', () => {
    const onSeeMore = vi.fn()
    render(<PublicDomainCatalogSection onOpenBook={vi.fn()} onSeeMore={onSeeMore} />)

    fireEvent.click(screen.getByText('Ver mais'))
    expect(onSeeMore).toHaveBeenCalledTimes(1)
  })

  it('renderiza a amostra ao vivo (sampleEntries), não a lista curada completa (entries)', () => {
    mocks.usePublicDomainCatalog.mockReturnValue({
      entries: [sampleEntry, { ...sampleEntry, id: 'outro', title: 'Só na lista curada' }],
      sampleEntries: [sampleEntry],
      loading: false,
      sampleLoading: false,
      error: false,
      getState: vi.fn((): PublicDomainDownloadState => ({ entryId: 'x', status: 'idle' })),
      download: vi.fn(),
      openDownloaded: vi.fn(),
    })

    render(<PublicDomainCatalogSection onOpenBook={vi.fn()} onSeeMore={vi.fn()} />)

    expect(screen.getByText('Pride and Prejudice')).toBeTruthy()
    expect(screen.queryByText('Só na lista curada')).toBeNull()
  })

  it('mostra skeletons enquanto sampleLoading', () => {
    mocks.usePublicDomainCatalog.mockReturnValue({
      entries: [],
      sampleEntries: [],
      loading: false,
      sampleLoading: true,
      error: false,
      getState: vi.fn((): PublicDomainDownloadState => ({ entryId: 'x', status: 'idle' })),
      download: vi.fn(),
      openDownloaded: vi.fn(),
    })

    const { container } = render(<PublicDomainCatalogSection onOpenBook={vi.fn()} onSeeMore={vi.fn()} />)
    expect(container.querySelectorAll('.animate-pulse').length).toBeGreaterThan(0)
    // A seção continua renderizando o título mesmo em loading (não some).
    expect(screen.getByText('Classicos em Ingles')).toBeTruthy()
  })
})
