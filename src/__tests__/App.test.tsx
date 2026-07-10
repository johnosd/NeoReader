import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { FeatureQuotaService } from '@/services/FeatureQuotaService'
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
  isNativePlatform: vi.fn(() => false),
  appAddListener: vi.fn(async () => ({ remove: vi.fn() })),
  addExternalEpubIntentListener: vi.fn(async () => ({ remove: vi.fn() })),
  cleanupNativeImportTemp: vi.fn(async () => 0),
  consumePendingExternalEpubIntent: vi.fn(async () => null),
  importNativeEpub: vi.fn(),
  isImportInProgress: vi.fn(() => false),
  cancelActiveImport: vi.fn(),
  getBookById: vi.fn(),
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
  Toast: ({ children }: { children: React.ReactNode }) => <div role="status">{children}</div>,
  ErrorBoundary: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}))

vi.mock('@capacitor/core', () => ({
  Capacitor: {
    isNativePlatform: mocks.isNativePlatform,
  },
  registerPlugin: vi.fn(() => ({})),
}))

vi.mock('@capacitor/app', () => ({
  App: {
    addListener: mocks.appAddListener,
  },
}))

vi.mock('@/services/NativeLibraryImportService', () => ({
  addExternalEpubIntentListener: mocks.addExternalEpubIntentListener,
  cleanupNativeImportTemp: mocks.cleanupNativeImportTemp,
  consumePendingExternalEpubIntent: mocks.consumePendingExternalEpubIntent,
}))

vi.mock('@/services/BookImportService', () => ({
  BookImportService: {
    importNativeEpub: mocks.importNativeEpub,
    isImportInProgress: mocks.isImportInProgress,
    cancelActiveImport: mocks.cancelActiveImport,
  },
}))

vi.mock('@/services/BillingService', () => ({
  BillingService: {
    init: vi.fn(async () => undefined),
    waitForInit: vi.fn(async () => undefined),
  },
}))

vi.mock('@/services/AdsService', () => ({
  AdsService: {
    init: vi.fn(async () => undefined),
  },
}))

vi.mock('@/services/VocabularyDriveSyncService', () => ({
  scheduleVocabularyDriveSync: vi.fn(),
}))

vi.mock('@/db/books', () => ({
  getBookById: mocks.getBookById,
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
    mocks.isNativePlatform.mockReset()
    mocks.isNativePlatform.mockReturnValue(false)
    mocks.appAddListener.mockReset()
    mocks.appAddListener.mockResolvedValue({ remove: vi.fn() })
    mocks.addExternalEpubIntentListener.mockReset()
    mocks.addExternalEpubIntentListener.mockResolvedValue({ remove: vi.fn() })
    mocks.cleanupNativeImportTemp.mockReset()
    mocks.cleanupNativeImportTemp.mockResolvedValue(0)
    mocks.consumePendingExternalEpubIntent.mockReset()
    mocks.consumePendingExternalEpubIntent.mockResolvedValue(null)
    mocks.importNativeEpub.mockReset()
    mocks.isImportInProgress.mockReset()
    mocks.isImportInProgress.mockReturnValue(false)
    mocks.cancelActiveImport.mockReset()
    mocks.getBookById.mockReset()
    window.localStorage.clear()
    FeatureQuotaService.reset()
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

  it('mantem Biblioteca e leitura acessiveis para Free mesmo com quotas esgotadas', () => {
    for (let index = 0; index < 5; index += 1) {
      FeatureQuotaService.consume('book-intelligence', {
        isPro: false,
        subjectKey: `book:used-${index}`,
      })
      FeatureQuotaService.consume('nyt-discovery', { isPro: false })
    }

    render(<App />)

    fireEvent.click(screen.getByTestId('open-library'))
    assertScreen('library')

    fireEvent.click(screen.getByTestId('library-open-book'))
    assertScreen('book-details')

    fireEvent.click(screen.getByTestId('read'))
    assertScreen('reader')
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
    expect(mocks.vocabularyProps?.bookId).toBe(1)

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

  it('importa EPUB externo pendente no Android e abre o leitor quando autenticado', async () => {
    const nativeFile = {
      name: 'externo.epub',
      uri: 'content://downloads/externo',
      path: 'externo.epub',
      size: 1234,
    }
    const importedBook: Book = {
      ...testBook,
      id: 42,
      title: 'Livro Externo',
      storageMode: 'local',
      uri: 'file:///data/books/externo.epub',
    }
    mocks.isNativePlatform.mockReturnValue(true)
    mocks.consumePendingExternalEpubIntent.mockResolvedValue(nativeFile)
    mocks.importNativeEpub.mockResolvedValue(42)
    mocks.getBookById.mockResolvedValue(importedBook)

    render(<App />)

    await waitFor(() => {
      expect(mocks.importNativeEpub).toHaveBeenCalledWith(nativeFile, { importSource: 'local' })
    })
    await waitFor(() => assertScreen('reader'))
    expect(mocks.readerProps?.book).toEqual(expect.objectContaining({ id: 42, title: 'Livro Externo' }))
  })

  it('nao consome EPUB externo enquanto usuario nao esta autenticado', async () => {
    mocks.isNativePlatform.mockReturnValue(true)
    mocks.authState = { status: 'signed-out', configured: true, user: null }

    render(<App />)

    assertScreen('welcome')
    expect(mocks.consumePendingExternalEpubIntent).not.toHaveBeenCalled()
    expect(mocks.importNativeEpub).not.toHaveBeenCalled()
  })

  it('mostra erro quando EPUB externo ja existe na biblioteca', async () => {
    mocks.isNativePlatform.mockReturnValue(true)
    mocks.consumePendingExternalEpubIntent.mockResolvedValue({
      name: 'duplicado.epub',
      uri: 'content://downloads/duplicado',
      path: 'duplicado.epub',
      size: 1234,
    })
    mocks.importNativeEpub.mockRejectedValue(new Error('Este livro ja esta na biblioteca.'))

    render(<App />)

    await waitFor(() => {
      expect(screen.getByRole('status').textContent).toContain('Este livro ja esta na biblioteca.')
    })
    expect(mocks.getBookById).not.toHaveBeenCalled()
  })

  it('nao consome EPUB externo enquanto outra importacao esta em andamento', () => {
    mocks.isNativePlatform.mockReturnValue(true)
    mocks.isImportInProgress.mockReturnValue(true)

    render(<App />)

    expect(mocks.consumePendingExternalEpubIntent).not.toHaveBeenCalled()
    expect(mocks.importNativeEpub).not.toHaveBeenCalled()
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
