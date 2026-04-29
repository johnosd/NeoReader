import { useState } from 'react'
import { LibraryScreen } from './screens/LibraryScreen'
import { BookDetailsScreen } from './screens/BookDetailsScreen'
import { ReaderScreen } from './screens/ReaderScreen'
import { VocabularyScreen } from './screens/VocabularyScreen'
import { SettingsScreen } from './screens/SettingsScreen'
import { ErrorBoundary } from './components/ui'
import type { Book } from './types/book'

type Route =
  | { name: 'library' }
  | { name: 'book-details'; book: Book }
  | { name: 'reader'; book: Book; startHref?: string }
  | { name: 'vocabulary' }
  | { name: 'settings' }

function App() {
  const [stack, setStack] = useState<Route[]>([{ name: 'library' }])
  const current = stack[stack.length - 1]

  const push = (route: Route) => setStack((prev) => [...prev, route])
  const pop = () => setStack((prev) => (prev.length > 1 ? prev.slice(0, -1) : prev))

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

    case 'settings':
      return (
        <ErrorBoundary key="settings">
          <SettingsScreen onBack={pop} />
        </ErrorBoundary>
      )

    default:
      return (
        <ErrorBoundary key="library">
          <LibraryScreen
            onOpenBook={(book) => push({ name: 'book-details', book })}
            onOpenVocabulary={() => push({ name: 'vocabulary' })}
            onOpenSettings={() => push({ name: 'settings' })}
          />
        </ErrorBoundary>
      )
  }
}

export default App
