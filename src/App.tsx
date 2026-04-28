import { useState } from 'react'
import { LibraryScreen } from './screens/LibraryScreen'
import { BookDetailsScreen } from './screens/BookDetailsScreen'
import { ReaderScreen } from './screens/ReaderScreen'
import { VocabularyScreen } from './screens/VocabularyScreen'
import { SettingsScreen } from './screens/SettingsScreen'
import { ErrorBoundary } from './components/ui'
import type { Book } from './types/book'

type Screen = 'library' | 'book-details' | 'reader' | 'vocabulary' | 'settings'
type SettingsReturnScreen = 'library' | 'book-details'

function App() {
  const [screen, setScreen] = useState<Screen>('library')
  const [selectedBook, setSelectedBook] = useState<Book | null>(null)
  const [readerStartHref, setReaderStartHref] = useState<string | undefined>()
  const [settingsReturnScreen, setSettingsReturnScreen] = useState<SettingsReturnScreen>('library')

  function handleOpenBookDetails(book: Book) {
    setSelectedBook(book)
    setScreen('book-details')
  }

  function handleOpenReader(book: Book, startHref?: string) {
    setSelectedBook(book)
    setReaderStartHref(startHref)
    setScreen('reader')
  }

  function handleOpenSettings(returnScreen: SettingsReturnScreen) {
    setSettingsReturnScreen(returnScreen)
    setScreen('settings')
  }

  if (screen === 'book-details' && selectedBook) {
    return (
      <ErrorBoundary key="book-details">
        <BookDetailsScreen
          book={selectedBook}
          onBack={() => setScreen('library')}
          onRead={handleOpenReader}
          onOpenSettings={() => handleOpenSettings('book-details')}
        />
      </ErrorBoundary>
    )
  }

  if (screen === 'reader' && selectedBook) {
    return (
      <ErrorBoundary key="reader">
        <ReaderScreen
          book={selectedBook}
          startHref={readerStartHref}
          onBack={() => setScreen('book-details')}
          onOpenVocabulary={() => setScreen('vocabulary')}
        />
      </ErrorBoundary>
    )
  }

  if (screen === 'vocabulary') {
    return (
      <ErrorBoundary key="vocabulary">
        <VocabularyScreen onBack={() => setScreen('library')} />
      </ErrorBoundary>
    )
  }

  if (screen === 'settings') {
    return (
      <ErrorBoundary key="settings">
        <SettingsScreen onBack={() => setScreen(settingsReturnScreen)} />
      </ErrorBoundary>
    )
  }

  return (
    <ErrorBoundary key="library">
      <LibraryScreen
        onOpenBook={handleOpenBookDetails}
        onOpenVocabulary={() => setScreen('vocabulary')}
        onOpenSettings={() => handleOpenSettings('library')}
      />
    </ErrorBoundary>
  )
}

export default App
