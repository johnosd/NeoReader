import { useState } from 'react'
import { LibraryScreen } from './screens/LibraryScreen'
import type { Book } from './types/book'

// Navegação simples por estado — sem react-router por enquanto.
// Quando o Reader for implementado, migraremos pra react-router-dom.
type Screen = 'library' | 'reader'

function App() {
  const [screen, setScreen] = useState<Screen>('library')
  const [selectedBook, setSelectedBook] = useState<Book | null>(null)

  function handleOpenBook(book: Book) {
    setSelectedBook(book)
    setScreen('reader')
  }

  if (screen === 'library') {
    return <LibraryScreen onOpenBook={handleOpenBook} />
  }

  // Placeholder para o Reader (próxima feature)
  return (
    <div className="min-h-screen bg-[#0a0a0a] text-white flex flex-col items-center justify-center gap-4">
      <p className="text-[#a0a0a0]">Leitor em breve...</p>
      <p className="text-white font-semibold">{selectedBook?.title}</p>
      <button
        onClick={() => setScreen('library')}
        className="text-[#6366f1] text-sm underline"
      >
        Voltar à biblioteca
      </button>
    </div>
  )
}

export default App
