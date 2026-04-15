import { useState } from 'react'
import { LibraryScreen } from './screens/LibraryScreen'
import { ReaderScreen } from './screens/ReaderScreen'
import { VocabularyScreen } from './screens/VocabularyScreen'
import { SettingsScreen } from './screens/SettingsScreen'
import type { Book } from './types/book'

type Screen = 'library' | 'reader' | 'vocabulary' | 'settings'

function App() {
  const [screen, setScreen] = useState<Screen>('library')
  const [selectedBook, setSelectedBook] = useState<Book | null>(null)

  function handleOpenBook(book: Book) {
    setSelectedBook(book)
    setScreen('reader')
  }

  if (screen === 'reader' && selectedBook) {
    return (
      <ReaderScreen
        book={selectedBook}
        onBack={() => setScreen('library')}
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
      onOpenBook={handleOpenBook}
      onOpenVocabulary={() => setScreen('vocabulary')}
      onOpenSettings={() => setScreen('settings')}
    />
  )
}

export default App
