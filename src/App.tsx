import { useState } from 'react'
import { LibraryScreen } from './screens/LibraryScreen'
import { BookDetailsScreen } from './screens/BookDetailsScreen'
import { ReaderScreen } from './screens/ReaderScreen'
import { VocabularyScreen } from './screens/VocabularyScreen'
import { SettingsScreen } from './screens/SettingsScreen'
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
      <BookDetailsScreen
        book={selectedBook}
        onBack={() => setScreen('library')}
        onRead={handleOpenReader}
        onOpenSettings={() => handleOpenSettings('book-details')}
      />
    )
  }

  if (screen === 'reader' && selectedBook) {
    return (
      <ReaderScreen
        book={selectedBook}
        startHref={readerStartHref}
        onBack={() => setScreen('book-details')}
        onOpenVocabulary={() => setScreen('vocabulary')}
      />
    )
  }

  if (screen === 'vocabulary') {
    return <VocabularyScreen onBack={() => setScreen('library')} />
  }

  if (screen === 'settings') {
    return <SettingsScreen onBack={() => setScreen(settingsReturnScreen)} />
  }

  return (
    <LibraryScreen
      onOpenBook={handleOpenBookDetails}
      onOpenVocabulary={() => setScreen('vocabulary')}
      onOpenSettings={() => handleOpenSettings('library')}
    />
  )
}

export default App
