import { fireEvent, render, screen, within } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ProfileScreen } from '@/screens/ProfileScreen'
import type { ProfileSummary } from '@/hooks/useProfileSummary'
import type { AuthUser } from '@/types/auth'

const mocks = vi.hoisted(() => ({
  summary: null as ProfileSummary | null,
  onBack: vi.fn(),
  onOpenLibrary: vi.fn(),
  onOpenDiscover: vi.fn(),
  onOpenSettings: vi.fn(),
  onSignOut: vi.fn(async () => undefined),
}))

vi.mock('@capacitor/app', () => ({
  App: {
    addListener: vi.fn(async () => ({ remove: vi.fn() })),
  },
}))

vi.mock('@/hooks/useProfileSummary', () => ({
  useProfileSummary: () => mocks.summary,
}))

vi.mock('@/hooks/useBookCoverUrl', () => ({
  useBookCoverUrl: () => null,
}))

const authUser: AuthUser = {
  uid: 'user-1',
  displayName: 'Leitora Neo',
  email: 'leitora@example.com',
  photoURL: 'https://example.com/avatar.png',
}

const defaultSummary: ProfileSummary = {
  isLoading: false,
  stats: {
    finished: 2,
    reading: 1,
    favorites: 3,
    vocabulary: 12,
  },
  history: [
    {
      book: {
        id: 1,
        title: 'Livro Recente',
        author: 'Autora A',
        fileBlob: new Blob(['epub']),
        addedAt: new Date('2026-01-01T00:00:00Z'),
        lastOpenedAt: new Date('2026-04-02T00:00:00Z'),
        readingStatus: 'finished',
      },
      date: new Date('2026-04-02T00:00:00Z'),
      pageCount: 240,
      percentage: 100,
      rating: 4.5,
      readingStatus: 'finished',
    },
    {
      book: {
        id: 2,
        title: 'Livro Antigo',
        author: 'Autor B',
        fileBlob: new Blob(['epub']),
        addedAt: new Date('2026-01-01T00:00:00Z'),
        lastOpenedAt: new Date('2026-02-02T00:00:00Z'),
        readingStatus: 'reading',
      },
      date: new Date('2026-02-02T00:00:00Z'),
      pageCount: null,
      percentage: 42,
      rating: null,
      readingStatus: 'reading',
    },
  ],
  achievements: [
    {
      id: 'first-open',
      title: 'Primeira leitura',
      description: 'Abra seu primeiro livro.',
      unlocked: true,
    },
    {
      id: 'first-finished',
      title: 'Livro concluido',
      description: 'Finalize uma leitura.',
      unlocked: false,
    },
  ],
}

function renderProfile(user: AuthUser = authUser) {
  return render(
    <ProfileScreen
      authUser={user}
      onBack={mocks.onBack}
      onOpenLibrary={mocks.onOpenLibrary}
      onOpenDiscover={mocks.onOpenDiscover}
      onOpenSettings={mocks.onOpenSettings}
      onSignOut={mocks.onSignOut}
    />,
  )
}

describe('ProfileScreen', () => {
  beforeEach(() => {
    mocks.summary = defaultSummary
    mocks.onBack.mockClear()
    mocks.onOpenLibrary.mockClear()
    mocks.onOpenDiscover.mockClear()
    mocks.onOpenSettings.mockClear()
    mocks.onSignOut.mockClear()
  })

  it('renderiza dados da conta e metricas locais', () => {
    const { container } = renderProfile()

    expect(screen.getByText('Leitora Neo')).toBeTruthy()
    expect(screen.getByText('leitora@example.com')).toBeTruthy()
    expect(container.querySelector(`img[src="${authUser.photoURL}"]`)).toBeTruthy()
    expect(screen.getByText('Lidos').previousSibling?.textContent).toBe('2')
    expect(screen.getByText('Lendo').previousSibling?.textContent).toBe('1')
    expect(screen.getByText('Favoritos').previousSibling?.textContent).toBe('3')
    expect(screen.getByText('Vocabulario').previousSibling?.textContent).toBe('12')
  })

  it('usa fallback visual quando usuario nao tem foto', () => {
    const { container } = renderProfile({ ...authUser, photoURL: null })

    expect(container.querySelector('img')).toBeNull()
    expect(screen.getByText('Leitora Neo')).toBeTruthy()
  })

  it('mostra historico na ordem recebida do resumo', () => {
    renderProfile()

    const rows = screen.getAllByText(/Livro /)
    expect(rows[0].textContent).toBe('Livro Recente')
    expect(rows[1].textContent).toBe('Livro Antigo')
    expect(screen.getByText('Concluido')).toBeTruthy()
    expect(screen.getByText('42%')).toBeTruthy()
    expect(screen.getByText('240 pags.')).toBeTruthy()
  })

  it('mostra conquistas desbloqueadas e bloqueadas', () => {
    renderProfile()

    fireEvent.click(screen.getByRole('button', { name: 'Conquistas' }))

    expect(screen.getByText('Primeira leitura')).toBeTruthy()
    expect(screen.getByText('Livro concluido')).toBeTruthy()
    expect(screen.getByText('1 de 2 desbloqueadas')).toBeTruthy()
    expect(screen.getByText('Desbloqueada')).toBeTruthy()
  })

  it('mostra estado vazio em seguindo', () => {
    renderProfile()

    fireEvent.click(screen.getByRole('button', { name: 'Seguindo' }))

    expect(screen.getByText('Social indisponivel')).toBeTruthy()
    expect(screen.getByText('Recursos sociais ainda nao estao disponiveis nesta versao.')).toBeTruthy()
  })

  it('mantem editar perfil desabilitado e abre configuracoes pelo botao do topo', () => {
    renderProfile()

    expect((screen.getByRole('button', { name: /Editar perfil/i }) as HTMLButtonElement).disabled).toBe(true)
    fireEvent.click(screen.getByRole('button', { name: 'Abrir configuracoes' }))

    expect(mocks.onOpenSettings).toHaveBeenCalledTimes(1)
  })

  it('aciona sign-out pelo perfil', () => {
    renderProfile()

    fireEvent.click(screen.getByRole('button', { name: 'Sair da conta' }))

    expect(mocks.onSignOut).toHaveBeenCalledTimes(1)
  })

  it('navega pela bottom nav', () => {
    renderProfile()

    const nav = screen.getByRole('navigation')
    fireEvent.click(within(nav).getByRole('button', { name: 'Descubra' }))
    fireEvent.click(within(nav).getByRole('button', { name: 'Início' }))

    expect(mocks.onOpenDiscover).toHaveBeenCalledTimes(1)
    expect(mocks.onOpenLibrary).toHaveBeenCalledTimes(1)
  })
})
