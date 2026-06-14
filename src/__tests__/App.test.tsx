import { render, screen, fireEvent } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { Book } from '@/types/book'

const mocks = vi.hoisted(() => ({
  homeProps: null as Record<string, unknown> | null,
  libraryProps: null as Record<string, unknown> | null,
  bookDetailsProps: null as Record<string, unknown> | null,
  readerProps: null as Record<string, unknown> | null,
  vocabularyProps: null as Record<string, unknown> | null,
  discoverProps: null as Record<string, unknown> | null,
  profileProps: null as Record<string, unknown> | null,
  settingsProps: null as Record<string, unknown> | null,
  authState: {
    status: 'signed-in',
    configured: true,
    user: {
      uid: 'user-1',
      displayName: 'Leitora',
      email: 'leitora@example.com',
      photoURL: null,
    },
  } as Record<string, unknown>,
  signInWithGoogle: vi.fn(),
  signOut: vi.fn(),
}))

const testBook: Book = {
  id: 1,
  title: 'Livro de Teste',
  author: 'Autor',
  fileBlob: new Blob(['epub']),
  addedAt: new Date(),
  lastOpenedAt: null,
}

vi.mock('@/screens/HomeScreen', () => ({
  HomeScreen: (props: Record<string, unknown>) => {
    mocks.homeProps = props
    return (
      <div data-testid="home">
        <button data-testid="open-book" onClick={() => (props.onOpenBook as (b: Book) => void)(testBook)}>
          Abrir livro
        </button>
        <button data-testid="open-library" onClick={() => (props.onOpenBiblioteca as () => void)()}>
          Biblioteca
        </button>
        <button data-testid="open-discover" onClick={() => (props.onOpenDiscover as () => void)()}>
          Descubra
        </button>
        <button data-testid="open-profile" onClick={() => (props.onOpenProfile as () => void)()}>
          Perfil
        </button>
        <button data-testid="open-settings" onClick={() => (props.onOpenSettings as () => void)()}>
          Configuracoes
        </button>
      </div>
    )
  },
}))

vi.mock('@/screens/LibraryScreen', () => ({
  LibraryScreen: (props: Record<string, unknown>) => {
    mocks.libraryProps = props
    return (
      <div data-testid="library">
        <button data-testid="library-open-book" onClick={() => (props.onOpenBook as (b: Book) => void)(testBook)}>
          Abrir livro
        </button>
        <button data-testid="library-open-home" onClick={() => (props.onOpenHome as () => void)()}>
          Inicio
        </button>
      </div>
    )
  },
}))

vi.mock('@/screens/BookDetailsScreen', () => ({
  BookDetailsScreen: (props: Record<string, unknown>) => {
    mocks.bookDetailsProps = props
    return (
      <div data-testid="book-details">
        <button data-testid="back" onClick={() => (props.onBack as () => void)()}>Voltar</button>
        <button data-testid="read" onClick={() => (props.onRead as (b: Book) => void)(testBook)}>Ler</button>
        <button data-testid="open-settings" onClick={() => (props.onOpenSettings as () => void)()}>
          Configuracoes
        </button>
      </div>
    )
  },
}))

vi.mock('@/screens/ReaderScreen', () => ({
  ReaderScreen: (props: Record<string, unknown>) => {
    mocks.readerProps = props
    return (
      <div data-testid="reader">
        <button data-testid="back" onClick={() => (props.onBack as () => void)()}>Voltar</button>
        <button data-testid="open-vocabulary" onClick={() => (props.onOpenVocabulary as () => void)()}>
          Vocabulario
        </button>
      </div>
    )
  },
}))

vi.mock('@/screens/VocabularyScreen', () => ({
  VocabularyScreen: (props: Record<string, unknown>) => {
    mocks.vocabularyProps = props
    return (
      <div data-testid="vocabulary">
        <button data-testid="back" onClick={() => (props.onBack as () => void)()}>Voltar</button>
      </div>
    )
  },
}))

vi.mock('@/screens/DiscoverScreen', () => ({
  DiscoverScreen: (props: Record<string, unknown>) => {
    mocks.discoverProps = props
    return (
      <div data-testid="discover">
        <button data-testid="back" onClick={() => (props.onBack as () => void)()}>Voltar</button>
        <button data-testid="open-profile" onClick={() => (props.onOpenProfile as () => void)()}>
          Perfil
        </button>
      </div>
    )
  },
}))

vi.mock('@/screens/ProfileScreen', () => ({
  ProfileScreen: (props: Record<string, unknown>) => {
    mocks.profileProps = props
    return (
      <div data-testid="profile">
        <button data-testid="back" onClick={() => (props.onBack as () => void)()}>Voltar</button>
        <button data-testid="open-settings" onClick={() => (props.onOpenSettings as () => void)()}>
          Configuracoes
        </button>
        <button data-testid="sign-out" onClick={() => (props.onSignOut as () => void)()}>Sair</button>
      </div>
    )
  },
}))

vi.mock('@/screens/SettingsScreen', () => ({
  SettingsScreen: (props: Record<string, unknown>) => {
    mocks.settingsProps = props
    return (
      <div data-testid="settings">
        <button data-testid="back" onClick={() => (props.onBack as () => void)()}>Voltar</button>
      </div>
    )
  },
}))

vi.mock('@/screens/WelcomeScreen', () => ({
  WelcomeScreen: (props: Record<string, unknown>) => (
    <div data-testid="welcome">
      <button data-testid="complete-welcome" onClick={() => (props.onComplete as () => void)()}>
        Comecar
      </button>
    </div>
  ),
}))

vi.mock('@/screens/LoginScreen', () => ({
  LoginScreen: (props: Record<string, unknown>) => (
    <div data-testid="login">
      <button data-testid="google-login" onClick={() => (props.onSignInWithGoogle as () => void)()}>
        Google
      </button>
      <span data-testid="login-configured">{String(props.configured)}</span>
    </div>
  ),
}))

vi.mock('@/components/ui', () => ({
  Spinner: () => <div data-testid="spinner" />,
  ErrorBoundary: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}))

vi.mock('@/hooks/useAuth', () => ({
  useAuth: () => ({
    state: mocks.authState,
    signInWithGoogle: mocks.signInWithGoogle,
    signOut: mocks.signOut,
  }),
}))

vi.mock('@/db/ttsVoiceCaches', () => ({
  cleanupExpiredTtsVoiceCaches: vi.fn(async () => 0),
}))

import App from '@/App'

function assertScreen(testId: string) {
  screen.getByTestId(testId)
}

function assertNoScreen(testId: string) {
  expect(screen.queryByTestId(testId)).toBeNull()
}

describe('App navigation and auth gate', () => {
  beforeEach(() => {
    mocks.homeProps = null
    mocks.libraryProps = null
    mocks.bookDetailsProps = null
    mocks.readerProps = null
    mocks.vocabularyProps = null
    mocks.discoverProps = null
    mocks.profileProps = null
    mocks.settingsProps = null
    mocks.authState = {
      status: 'signed-in',
      configured: true,
      user: {
        uid: 'user-1',
        displayName: 'Leitora',
        email: 'leitora@example.com',
        photoURL: null,
      },
    }
    mocks.signInWithGoogle.mockReset()
    mocks.signOut.mockReset()
    window.localStorage.clear()
  })

  it('comeca na home quando autenticado', () => {
    render(<App />)

    assertScreen('home')
    assertNoScreen('book-details')
    assertNoScreen('reader')
  })

  it('abre a pagina Biblioteca a partir da home', () => {
    render(<App />)

    fireEvent.click(screen.getByTestId('open-library'))

    assertScreen('library')
    assertNoScreen('home')
  })

  it('Home -> BookDetails -> Reader', () => {
    render(<App />)

    fireEvent.click(screen.getByTestId('open-book'))
    assertScreen('book-details')

    fireEvent.click(screen.getByTestId('read'))
    assertScreen('reader')
    assertNoScreen('book-details')
  })

  it('Reader -> Back -> BookDetails', () => {
    render(<App />)

    fireEvent.click(screen.getByTestId('open-book'))
    fireEvent.click(screen.getByTestId('read'))
    assertScreen('reader')

    fireEvent.click(screen.getByTestId('back'))
    assertScreen('book-details')
    assertNoScreen('reader')
  })

  it('BookDetails -> Back -> Home', () => {
    render(<App />)

    fireEvent.click(screen.getByTestId('open-book'))
    assertScreen('book-details')

    fireEvent.click(screen.getByTestId('back'))
    assertScreen('home')
    assertNoScreen('book-details')
  })

  it('Home -> Discover -> Back -> Home', () => {
    render(<App />)

    fireEvent.click(screen.getByTestId('open-discover'))
    assertScreen('discover')

    fireEvent.click(screen.getByTestId('back'))
    assertScreen('home')
    assertNoScreen('discover')
  })

  it('Reader -> Vocabulary -> Back -> Reader', () => {
    render(<App />)

    fireEvent.click(screen.getByTestId('open-book'))
    fireEvent.click(screen.getByTestId('read'))
    fireEvent.click(screen.getByTestId('open-vocabulary'))
    assertScreen('vocabulary')

    fireEvent.click(screen.getByTestId('back'))
    assertScreen('reader')
    assertNoScreen('vocabulary')
  })

  it('Home -> Profile -> Back -> Home', () => {
    render(<App />)

    fireEvent.click(screen.getByTestId('open-profile'))
    assertScreen('profile')

    fireEvent.click(screen.getByTestId('back'))
    assertScreen('home')
  })

  it('Profile -> Settings -> Back -> Profile', () => {
    render(<App />)

    fireEvent.click(screen.getByTestId('open-profile'))
    fireEvent.click(screen.getByTestId('open-settings'))
    assertScreen('settings')

    fireEvent.click(screen.getByTestId('back'))
    assertScreen('profile')
  })

  it('Home -> Settings -> Back -> Home', () => {
    render(<App />)

    fireEvent.click(screen.getByTestId('open-settings'))
    assertScreen('settings')

    fireEvent.click(screen.getByTestId('back'))
    assertScreen('home')
  })

  it('BookDetails -> Settings -> Back -> BookDetails', () => {
    render(<App />)

    fireEvent.click(screen.getByTestId('open-book'))
    fireEvent.click(screen.getByTestId('open-settings'))
    assertScreen('settings')

    fireEvent.click(screen.getByTestId('back'))
    assertScreen('book-details')
    assertNoScreen('home')
  })

  it('passa o livro correto para ReaderScreen', () => {
    render(<App />)

    fireEvent.click(screen.getByTestId('open-book'))
    fireEvent.click(screen.getByTestId('read'))

    expect(mocks.readerProps?.book).toEqual(expect.objectContaining({ id: 1, title: 'Livro de Teste' }))
  })

  it('mostra Welcome antes do Login quando nao autenticado', () => {
    mocks.authState = { status: 'signed-out', configured: true, user: null }
    render(<App />)

    assertScreen('welcome')
    fireEvent.click(screen.getByTestId('complete-welcome'))

    assertScreen('login')
    expect(screen.getByTestId('login-configured').textContent).toBe('true')
  })

  it('pula Welcome ja visto e envia login Google pela tela de Login', () => {
    window.localStorage.setItem('neoreader:welcome-seen', '1')
    mocks.authState = { status: 'signed-out', configured: true, user: null }
    render(<App />)

    assertScreen('login')
    fireEvent.click(screen.getByTestId('google-login'))

    expect(mocks.signInWithGoogle).toHaveBeenCalledTimes(1)
  })

  it('passa usuario e logout para Profile', () => {
    render(<App />)

    fireEvent.click(screen.getByTestId('open-profile'))
    fireEvent.click(screen.getByTestId('sign-out'))

    expect(mocks.profileProps?.authUser).toEqual(expect.objectContaining({ uid: 'user-1' }))
    expect(mocks.signOut).toHaveBeenCalledTimes(1)
  })
})
