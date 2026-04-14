import { useState } from 'react'
import { LibraryScreen } from './screens/LibraryScreen'
import { ReaderScreen } from './screens/ReaderScreen'
import type { Book } from './types/book'

type Screen = 'library' | 'reader'

function App() {
  const [screen, setScreen] = useState<Screen>('library')
  const [selectedBook, setSelectedBook] = useState<Book | null>(null)

  function handleOpenBook(book: Book) {
    setSelectedBook(book)
    setScreen('reader')
  }

  if (screen === 'reader' && selectedBook) {
    return <ReaderScreen book={selectedBook} onBack={() => setScreen('library')} />
  }

  return <LibraryScreen onOpenBook={handleOpenBook} />
}

export default App
