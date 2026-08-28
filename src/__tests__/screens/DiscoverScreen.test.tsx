import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { FeatureQuotaService } from '@/services/FeatureQuotaService'
import { completePublicDomainDownload } from '@/services/PublicDomainDownloadCoordinator'
import type { Book } from '@/types/book'

const mocks = vi.hoisted(() => ({
  hasValidCache: vi.fn(),
  getBookById: vi.fn(),
  findBookByFileName: vi.fn(),
}))

vi.mock('@/db/books', () => ({
  getBookById: mocks.getBookById,
  findBookByFileName: mocks.findBookByFileName,
}))

vi.mock('@/hooks/useEntitlements', () => ({
  useEntitlements: () => ({
    isPro: false,
    isLoading: false,
    expiresAt: undefined,
    activeProductId: undefined,
    refresh: vi.fn(),
  }),
}))

vi.mock('@capacitor/app', () => ({
  App: {
    addListener: vi.fn(async () => ({ remove: vi.fn() })),
  },
}))

vi.mock('@/components/NytBooksRow', () => ({
  NytBooksRow: ({ listName, allowNetwork }: { listName: string; allowNetwork?: boolean }) => (
    <div data-testid="nyt-row" data-list-name={listName} data-allow-network={String(allowNetwork)}>
      {listName}
    </div>
  ),
}))

vi.mock('@/services/NytBooksService', () => ({
  NytBooksService: {
    hasValidCache: mocks.hasValidCache,
  },
}))

vi.mock('@/components/BottomNav', () => ({
  BottomNav: () => <nav data-testid="bottom-nav" />,
}))

import { DiscoverScreen } from '@/screens/DiscoverScreen'

function renderDiscoverScreen(apiKey?: string) {
  if (apiKey) vi.stubEnv('VITE_NYT_API_KEY', apiKey)
  else vi.stubEnv('VITE_NYT_API_KEY', '')

  render(
    <DiscoverScreen
      onBack={vi.fn()}
      onOpenLibrary={vi.fn()}
      onOpenProfile={vi.fn()}
      onOpenPaywall={vi.fn()}
      onOpenBook={vi.fn()}
    />,
  )
}

describe('DiscoverScreen', () => {
  beforeEach(() => {
    FeatureQuotaService.reset()
    mocks.findBookByFileName.mockReset().mockResolvedValue(undefined)
    mocks.hasValidCache.mockReturnValue(false)
  })

  afterEach(() => {
    vi.unstubAllEnvs()
    vi.unstubAllGlobals()
  })

  it('mantem listas atuais e adiciona a secao infantil na ordem definida', () => {
    renderDiscoverScreen('nyt-key')

    expect(screen.getByText('Tendencias no Mundo')).toBeTruthy()
    expect(screen.getByText('O que as crianças estão lendo agora')).toBeTruthy()

    expect(screen.getByText(/Restam 5 de 5 atualizacoes/)).toBeTruthy()
    expect(FeatureQuotaService.getSnapshot('nyt-discovery', { isPro: false }).used).toBe(0)

    const rows = screen.getAllByTestId('nyt-row').map((row) => row.getAttribute('data-list-name'))
    expect(rows).toEqual([
      'advice-how-to-and-miscellaneous',
      'hardcover-fiction',
      'business-books',
      'childrens-middle-grade-hardcover',
      'series-books',
      'graphic-books-and-manga',
    ])
    expect(screen.getAllByTestId('nyt-row').map((row) => row.getAttribute('data-allow-network'))).toEqual([
      'true',
      'true',
      'true',
      'true',
      'true',
      'true',
    ])
  })

  it('mantem EmptyState quando a chave NYT nao esta configurada', () => {
    renderDiscoverScreen()

    expect(screen.getByText('Descobertas indisponiveis')).toBeTruthy()
    expect(screen.queryAllByTestId('nyt-row')).toHaveLength(0)
  })

  it('nao consome quota quando todas as listas NYT ja tem cache valido', () => {
    mocks.hasValidCache.mockReturnValue(true)

    renderDiscoverScreen('nyt-key')

    expect(screen.getByText(/Restam 5 de 5 atualizacoes/)).toBeTruthy()
    expect(FeatureQuotaService.getSnapshot('nyt-discovery', { isPro: false }).used).toBe(0)
    expect(screen.getAllByTestId('nyt-row')).toHaveLength(6)
  })

  it('bloqueia Descubra com CTA quando quota acaba e nao ha cache', () => {
    const onOpenPaywall = vi.fn()
    for (let index = 0; index < 5; index += 1) {
      FeatureQuotaService.consume('nyt-discovery', { isPro: false })
    }
    vi.stubEnv('VITE_NYT_API_KEY', 'nyt-key')

    render(
      <DiscoverScreen
        onBack={vi.fn()}
        onOpenLibrary={vi.fn()}
        onOpenProfile={vi.fn()}
        onOpenPaywall={onOpenPaywall}
        onOpenBook={vi.fn()}
      />,
    )

    expect(screen.getByText('Novas atualizacoes pausadas este mes')).toBeTruthy()
    expect(screen.getByText(/novas atualizacoes do Free/)).toBeTruthy()
    expect(screen.getByText(/Restam 0 de 5 atualizacoes/)).toBeTruthy()
    expect(screen.queryAllByTestId('nyt-row')).toHaveLength(0)

    fireEvent.click(screen.getByRole('button', { name: 'Ver NeoReader Pro' }))
    expect(onOpenPaywall).toHaveBeenCalledTimes(1)
  })

  it('mantem listas cacheadas visiveis quando quota acaba', () => {
    for (let index = 0; index < 5; index += 1) {
      FeatureQuotaService.consume('nyt-discovery', { isPro: false })
    }
    mocks.hasValidCache.mockImplementation((listName: string) => listName === 'hardcover-fiction')
    renderDiscoverScreen('nyt-key')

    expect(screen.getByText('Novas atualizacoes pausadas este mes')).toBeTruthy()
    expect(screen.getByText(/Listas ja carregadas continuam disponiveis/)).toBeTruthy()
    expect(screen.getAllByTestId('nyt-row')).toHaveLength(6)
    expect(screen.getAllByTestId('nyt-row').map((row) => row.getAttribute('data-allow-network'))).toEqual([
      'false',
      'false',
      'false',
      'false',
      'false',
      'false',
    ])
  })

  it('mostra a secao de dominio publico mesmo sem a chave NYT configurada (FR-009)', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify([
      { id: 'jane-austen_pride-and-prejudice', title: 'Pride and Prejudice', author: 'Jane Austen', authorSlug: 'jane-austen', titleSlug: 'pride-and-prejudice' },
    ]))))

    renderDiscoverScreen()

    expect(await screen.findByText('Classicos em Ingles')).toBeTruthy()
    expect(await screen.findByText('Pride and Prejudice')).toBeTruthy()
    expect(screen.getByText('Descobertas indisponiveis')).toBeTruthy()
  })

  it('mostra a secao de dominio publico junto com as listas do NYT quando a chave existe', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify([
      { id: 'jane-austen_pride-and-prejudice', title: 'Pride and Prejudice', author: 'Jane Austen', authorSlug: 'jane-austen', titleSlug: 'pride-and-prejudice' },
    ]))))

    renderDiscoverScreen('nyt-key')

    expect(await screen.findByText('Classicos em Ingles')).toBeTruthy()
    expect(screen.getByText('Tendencias no Mundo')).toBeTruthy()
  })

  it('abre o livro ao tocar num card de dominio publico ja baixado', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify([
      { id: 'mary-shelley_frankenstein', title: 'Frankenstein', author: 'Mary Shelley', authorSlug: 'mary-shelley', titleSlug: 'frankenstein' },
    ]))))
    completePublicDomainDownload('mary-shelley_frankenstein', 42)
    const fakeBook = { id: 42, title: 'Frankenstein' } as Book
    mocks.getBookById.mockResolvedValue(fakeBook)
    const onOpenBook = vi.fn()

    vi.stubEnv('VITE_NYT_API_KEY', '')
    render(
      <DiscoverScreen
        onBack={vi.fn()}
        onOpenLibrary={vi.fn()}
        onOpenProfile={vi.fn()}
        onOpenPaywall={vi.fn()}
        onOpenBook={onOpenBook}
      />,
    )

    const label = await screen.findByText('Na biblioteca')
    fireEvent.click(label.closest('[role="button"]')!)

    await waitFor(() => expect(onOpenBook).toHaveBeenCalledWith(fakeBook))
  })

  it('reconcilia com a Biblioteca real quando o titulo ja foi baixado numa sessao anterior', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify([
      { id: 'charles-dickens_a-christmas-carol', title: 'A Christmas Carol', author: 'Charles Dickens', authorSlug: 'charles-dickens', titleSlug: 'a-christmas-carol' },
    ]))))
    // Nada no coordinator desta sessao (simula app recem-aberto), mas o
    // livro ja existe na Biblioteca de uma sessao anterior.
    mocks.findBookByFileName.mockImplementation(async (fileName: string) =>
      fileName === 'charles-dickens_a-christmas-carol.epub' ? { id: 127 } : undefined)

    vi.stubEnv('VITE_NYT_API_KEY', '')
    render(
      <DiscoverScreen
        onBack={vi.fn()}
        onOpenLibrary={vi.fn()}
        onOpenProfile={vi.fn()}
        onOpenPaywall={vi.fn()}
        onOpenBook={vi.fn()}
      />,
    )

    expect(await screen.findByText('Na biblioteca')).toBeTruthy()
  })
})
