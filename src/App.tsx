import { useState } from 'react'
import { LibraryScreen } from './screens/LibraryScreen'
import { BookDetailsScreen } from './screens/BookDetailsScreen'
import { ReaderScreen } from './screens/ReaderScreen'
import { VocabularyScreen } from './screens/VocabularyScreen'
import { SettingsScreen } from './screens/SettingsScreen'
import { DiscoverScreen } from './screens/DiscoverScreen'
import { WelcomeScreen } from './screens/WelcomeScreen'
import { LoginScreen } from './screens/LoginScreen'
import { ErrorBoundary, Spinner } from './components/ui'
import { useAuth } from './hooks/useAuth'
import type { Book } from './types/book'

type Route =
  | { name: 'library' }
  | { name: 'book-details'; book: Book }
  | { name: 'reader'; book: Book; startHref?: string }
  | { name: 'vocabulary' }
  | { name: 'discover' }
  | { name: 'settings' }

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
  const [stack, setStack] = useState<Route[]>([{ name: 'library' }])
  const current = stack[stack.length - 1]

  const push = (route: Route) => setStack((prev) => [...prev, route])
  const pop = () => setStack((prev) => (prev.length > 1 ? prev.slice(0, -1) : prev))

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
            onOpenSettings={() => push({ name: 'settings' })}
          />
        </ErrorBoundary>
      )

    case 'settings':
      return (
        <ErrorBoundary key="settings">
          <SettingsScreen
            onBack={pop}
            authUser={auth.state.user}
            onSignOut={auth.signOut}
          />
        </ErrorBoundary>
      )

    default:
      return (
        <ErrorBoundary key="library">
          <LibraryScreen
            onOpenBook={(book) => push({ name: 'book-details', book })}
            onOpenDiscover={() => push({ name: 'discover' })}
            onOpenSettings={() => push({ name: 'settings' })}
          />
        </ErrorBoundary>
      )
  }
}

export default App
