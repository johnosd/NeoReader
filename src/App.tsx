import { useState } from 'react'
import { LibraryScreen } from './screens/LibraryScreen'
import { BookDetailsScreen } from './screens/BookDetailsScreen'
import { ReaderScreen } from './screens/ReaderScreen'
import { VocabularyScreen } from './screens/VocabularyScreen'
import { SettingsScreen } from './screens/SettingsScreen'
import type { Book } from './types/book'

type Screen = 'library' | 'book-details' | 'reader' | 'vocabulary' | 'settings'

function App() {
  const [screen, setScreen] = useState<Screen>('library')
  const [selectedBook, setSelectedBook] = useState<Book | null>(null)
  const [readerStartHref, setReaderStartHref] = useState<string | undefined>()

  function handleOpenBookDetails(book: Book) {
    setSelectedBook(book)
    setScreen('book-details')
  }

  function handleOpenReader(book: Book, startHref?: string) {
    setSelectedBook(book)
    setReaderStartHref(startHref)
    setScreen('reader')
  }

  if (screen === 'book-details' && selectedBook) {
    return (
      <BookDetailsScreen
        book={selectedBook}
        onBack={() => setScreen('library')}
        onRead={handleOpenReader}
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
    return <SettingsScreen onBack={() => setScreen('library')} />
  }

  return (
    <LibraryScreen
      onOpenBook={handleOpenBookDetails}
      onOpenVocabulary={() => setScreen('vocabulary')}
      onOpenSettings={() => setScreen('settings')}
    />
  )
}

export default App
