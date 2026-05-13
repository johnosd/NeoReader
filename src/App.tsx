import { useEffect, useState } from 'react'
import { HomeScreen } from './screens/HomeScreen'
import { LibraryScreen } from './screens/LibraryScreen'
import { BookDetailsScreen } from './screens/BookDetailsScreen'
import { ReaderScreen } from './screens/ReaderScreen'
import { VocabularyScreen } from './screens/VocabularyScreen'
import { SettingsScreen } from './screens/SettingsScreen'
import { DiscoverScreen } from './screens/DiscoverScreen'
import { ProfileScreen } from './screens/ProfileScreen'
import { WelcomeScreen } from './screens/WelcomeScreen'
import { LoginScreen } from './screens/LoginScreen'
import { PaywallScreen } from './screens/PaywallScreen'
import { ErrorBoundary, Spinner } from './components/ui'
import { useAuth } from './hooks/useAuth'
import { AdsService } from './services/AdsService'
import { BillingService } from './services/BillingService'
import type { Book } from './types/book'

type Route =
  | { name: 'home' }
  | { name: 'library' }
  | { name: 'book-details'; book: Book }
  | { name: 'reader'; book: Book; startHref?: string }
  | { name: 'vocabulary' }
  | { name: 'discover' }
  | { name: 'profile' }
  | { name: 'settings' }
  | { name: 'paywall' }

const WELCOME_SEEN_KEY = 'neoreader:welcome-seen'

function getWelcomeSeen() {
  try {
    return window.localStorage.getItem(WELCOME_SEEN_KEY) === '1'
  } catch {
    return false
  }
}

function setWelcomeSeen() {
  try {
    window.localStorage.setItem(WELCOME_SEEN_KEY, '1')
  } catch {
    // localStorage pode estar indisponivel em ambientes restritos; o fluxo continua em memoria.
  }
}

function App() {
  const auth = useAuth()
  const [authScreen, setAuthScreen] = useState<'welcome' | 'login'>(() => (
    getWelcomeSeen() ? 'login' : 'welcome'
  ))
  const [stack, setStack] = useState<Route[]>([{ name: 'home' }])
  const current = stack[stack.length - 1]

  const push = (route: Route) => setStack((prev) => [...prev, route])
  const pop = () => setStack((prev) => (prev.length > 1 ? prev.slice(0, -1) : prev))
  const openHome = () => setStack([{ name: 'home' }])
  const openLibrary = () => setStack([{ name: 'home' }, { name: 'library' }])
  const openDiscover = () => setStack([{ name: 'home' }, { name: 'discover' }])
  const openProfile = () => setStack([{ name: 'home' }, { name: 'profile' }])

  // Inicializa Billing (RevenueCat) e Ads (AdMob) apos o login Firebase.
  // Billing usa uid como appUserID. Ambos viram no-op silencioso em web/dev
  // sem env keys configuradas.
  const signedInUid = auth.state.status === 'signed-in' ? auth.state.user.uid : null
  useEffect(() => {
    if (!signedInUid) return
    void BillingService.init(signedInUid).catch((err) => {
      console.warn('[Billing] Falha ao inicializar:', err)
    })
    void AdsService.init().catch((err) => {
      console.warn('[Ads] Falha ao inicializar:', err)
    })
  }, [signedInUid])

  function completeWelcome() {
    setWelcomeSeen()
    setAuthScreen('login')
  }

  if (auth.state.status === 'loading') {
    return (
      <div className="fixed inset-0 flex items-center justify-center bg-bg-base">
        <Spinner tone="purple" label="Carregando" />
      </div>
    )
  }

  if (auth.state.status !== 'signed-in') {
    if (authScreen === 'welcome') {
      return (
        <ErrorBoundary key="welcome">
          <WelcomeScreen onComplete={completeWelcome} />
        </ErrorBoundary>
      )
    }

    return (
      <ErrorBoundary key="login">
        <LoginScreen
          configured={auth.state.configured}
          error={auth.state.error}
          onSignInWithGoogle={auth.signInWithGoogle}
        />
      </ErrorBoundary>
    )
  }

  switch (current.name) {
    case 'book-details':
      return (
        <ErrorBoundary key="book-details">
          <BookDetailsScreen
            book={current.book}
            onBack={pop}
            onRead={(book, startHref) => push({ name: 'reader', book, startHref })}
            onOpenSettings={() => push({ name: 'settings' })}
          />
        </ErrorBoundary>
      )

    case 'reader':
      return (
        <ErrorBoundary key="reader">
          <ReaderScreen
            book={current.book}
            startHref={current.startHref}
            onBack={pop}
            onOpenVocabulary={() => push({ name: 'vocabulary' })}
          />
        </ErrorBoundary>
      )

    case 'vocabulary':
      return (
        <ErrorBoundary key="vocabulary">
          <VocabularyScreen onBack={pop} />
        </ErrorBoundary>
      )

    case 'discover':
      return (
        <ErrorBoundary key="discover">
          <DiscoverScreen
            onBack={pop}
            onOpenHome={openHome}
            onOpenLibrary={openLibrary}
            onOpenProfile={openProfile}
          />
        </ErrorBoundary>
      )

    case 'profile':
      return (
        <ErrorBoundary key="profile">
          <ProfileScreen
            authUser={auth.state.user}
            onBack={pop}
            onOpenHome={openHome}
            onOpenLibrary={openLibrary}
            onOpenDiscover={openDiscover}
            onOpenSettings={() => push({ name: 'settings' })}
            onSignOut={auth.signOut}
          />
        </ErrorBoundary>
      )

    case 'settings':
      return (
        <ErrorBoundary key="settings">
          <SettingsScreen
            onBack={pop}
            onOpenPaywall={() => push({ name: 'paywall' })}
          />
        </ErrorBoundary>
      )

    case 'paywall':
      return (
        <ErrorBoundary key="paywall">
          <PaywallScreen onBack={pop} />
        </ErrorBoundary>
      )

    case 'library':
      return (
        <ErrorBoundary key="library">
          <LibraryScreen
            onOpenBook={(book) => push({ name: 'book-details', book })}
            onOpenHome={openHome}
            onOpenDiscover={openDiscover}
            onOpenProfile={openProfile}
          />
        </ErrorBoundary>
      )

    default:
      return (
        <ErrorBoundary key="home">
          <HomeScreen
            onOpenBook={(book) => push({ name: 'book-details', book })}
            onOpenBiblioteca={openLibrary}
            onOpenDiscover={openDiscover}
            onOpenProfile={openProfile}
            onOpenSettings={() => push({ name: 'settings' })}
          />
        </ErrorBoundary>
      )
  }
}

export default App
