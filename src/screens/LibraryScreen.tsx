import { BookCard } from '../components/BookCard'
import { AddBookButton } from '../components/AddBookButton'
import { useLibrary } from '../hooks/useLibrary'
import type { Book } from '../types/book'

interface LibraryScreenProps {
  onOpenBook: (book: Book) => void
}

export function LibraryScreen({ onOpenBook }: LibraryScreenProps) {
  const { books, isEmpty } = useLibrary()

  return (
    <div className="min-h-screen bg-[#0a0a0a] text-white">
      {/* Header */}
      <header className="px-4 pt-10 pb-4 flex items-center justify-between">
        <h1 className="text-2xl font-bold text-[#6366f1]">NeoReader</h1>
        <p className="text-[#a0a0a0] text-sm">
          {books ? `${books.length} livro${books.length !== 1 ? 's' : ''}` : ''}
        </p>
      </header>

      <main className="px-4 pb-24">
        {/* Estado: carregando (books = undefined enquanto Dexie inicializa) */}
        {books === undefined && <SkeletonGrid />}

        {/* Estado: biblioteca vazia */}
        {isEmpty && <EmptyState />}

        {/* Estado: com livros */}
        {books && books.length > 0 && (
          <div className="grid grid-cols-2 gap-4">
            {books.map((book) => (
              <BookCard key={book.id} book={book} onPress={onOpenBook} />
            ))}
          </div>
        )}
      </main>

      <AddBookButton />
    </div>
  )
}

function EmptyState() {
  return (
    <div className="flex flex-col items-center justify-center py-24 gap-4 text-center">
      <span className="text-6xl">📚</span>
      <h2 className="text-xl font-semibold text-white">Sua biblioteca está vazia</h2>
      <p className="text-[#a0a0a0] text-sm max-w-56">
        Toque no botão + para adicionar seu primeiro livro EPUB
      </p>
    </div>
  )
}

// Skeleton com shimmer enquanto o IndexedDB inicializa (geralmente &lt;100ms)
function SkeletonGrid() {
  return (
    <div className="grid grid-cols-2 gap-4">
      {[1, 2, 3, 4].map((i) => (
        <div key={i} className="flex flex-col gap-2">
          <div className="w-full aspect-[2/3] rounded-md bg-[#1a1a1a] animate-pulse" />
          <div className="h-3 w-3/4 rounded bg-[#1a1a1a] animate-pulse" />
          <div className="h-2 w-1/2 rounded bg-[#1a1a1a] animate-pulse" />
        </div>
      ))}
    </div>
  )
}
