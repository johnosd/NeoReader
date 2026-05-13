import { render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

vi.mock('@capacitor/app', () => ({
  App: {
    addListener: vi.fn(async () => ({ remove: vi.fn() })),
  },
}))

vi.mock('@/components/NytBooksRow', () => ({
  NytBooksRow: ({ listName }: { listName: string }) => (
    <div data-testid="nyt-row" data-list-name={listName}>
      {listName}
    </div>
  ),
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
    />,
  )
}

describe('DiscoverScreen', () => {
  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it('mantem listas atuais e adiciona a secao infantil na ordem definida', () => {
    renderDiscoverScreen('nyt-key')

    expect(screen.getByText('Tendencias no Mundo')).toBeTruthy()
    expect(screen.getByText('O que as crianças estão lendo agora')).toBeTruthy()

    const rows = screen.getAllByTestId('nyt-row').map((row) => row.getAttribute('data-list-name'))
    expect(rows).toEqual([
      'advice-how-to-and-miscellaneous',
      'hardcover-fiction',
      'business-books',
      'childrens-middle-grade-hardcover',
      'series-books',
      'graphic-books-and-manga',
    ])
  })

  it('mantem EmptyState quando a chave NYT nao esta configurada', () => {
    renderDiscoverScreen()

    expect(screen.getByText('Descobertas indisponiveis')).toBeTruthy()
    expect(screen.queryAllByTestId('nyt-row')).toHaveLength(0)
  })
})
