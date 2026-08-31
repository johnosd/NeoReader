import { render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { PublicDomainDownloadState } from '@/services/PublicDomainDownloadCoordinator'

const mocks = vi.hoisted(() => ({
  usePublicDomainCatalog: vi.fn(),
}))

vi.mock('@/hooks/usePublicDomainCatalog', () => ({ usePublicDomainCatalog: mocks.usePublicDomainCatalog }))
vi.mock('@/hooks/useCapacitorAppListener', () => ({ useCapacitorBackButton: vi.fn() }))

import { PublicDomainCatalogScreen } from '@/screens/PublicDomainCatalogScreen'

function baseReturn(overrides: Partial<ReturnType<typeof mocks.usePublicDomainCatalog>> = {}) {
  return {
    entries: [],
    sampleEntries: [],
    loading: false,
    sampleLoading: false,
    error: false,
    getState: vi.fn((): PublicDomainDownloadState => ({ entryId: 'x', status: 'idle' })),
    download: vi.fn(),
    openDownloaded: vi.fn(),
    ...overrides,
  }
}

describe('PublicDomainCatalogScreen', () => {
  beforeEach(() => {
    mocks.usePublicDomainCatalog.mockReset().mockReturnValue(baseReturn())
  })

  it('mostra a lista curada completa (entries), não a amostra', () => {
    mocks.usePublicDomainCatalog.mockReturnValue(baseReturn({
      entries: [
        { id: 'a', title: 'Pride and Prejudice', author: 'Jane Austen', authorSlug: 'jane-austen', titleSlug: 'pride-and-prejudice' },
        { id: 'b', title: 'Frankenstein', author: 'Mary Shelley', authorSlug: 'mary-shelley', titleSlug: 'frankenstein' },
      ],
    }))

    render(<PublicDomainCatalogScreen onBack={vi.fn()} onOpenBook={vi.fn()} />)

    expect(screen.getByText('Pride and Prejudice')).toBeTruthy()
    expect(screen.getByText('Frankenstein')).toBeTruthy()
  })

  it('mostra estado de erro quando a lista curada falha ao carregar', () => {
    mocks.usePublicDomainCatalog.mockReturnValue(baseReturn({ error: true }))

    render(<PublicDomainCatalogScreen onBack={vi.fn()} onOpenBook={vi.fn()} />)

    expect(screen.getByText('Nao foi possivel carregar')).toBeTruthy()
  })
})
