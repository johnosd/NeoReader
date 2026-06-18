import { fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { FeatureQuotaService } from '@/services/FeatureQuotaService'

const mocks = vi.hoisted(() => ({
  hasValidCache: vi.fn(),
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
    />,
  )
}

describe('DiscoverScreen', () => {
  beforeEach(() => {
    FeatureQuotaService.reset()
    mocks.hasValidCache.mockReturnValue(false)
  })

  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it('mantem listas atuais e adiciona a secao infantil na ordem definida', () => {
    renderDiscoverScreen('nyt-key')

    expect(screen.getByText('Tendencias no Mundo')).toBeTruthy()
    expect(screen.getByText('O que as crianças estão lendo agora')).toBeTruthy()

    expect(screen.getByText(/Restam 4 de 5 atualizacoes/)).toBeTruthy()
    expect(FeatureQuotaService.getSnapshot('nyt-discovery', { isPro: false }).used).toBe(1)

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
})
