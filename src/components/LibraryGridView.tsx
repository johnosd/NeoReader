import { BookOpen } from 'lucide-react'
import { useBookCoverUrl } from '../hooks/useBookCoverUrl'
import type { Book } from '../types/book'
import type { LibraryBook } from '../hooks/useLibraryCatalog'

interface LibraryGridViewProps {
  books: LibraryBook[]
  onOpenBook: (book: Book) => void
}

export function LibraryGridView({ books, onOpenBook }: LibraryGridViewProps) {
  return (
    <div className="grid pb-10 pt-1" style={{ gridTemplateColumns: 'repeat(3, 1fr)', gap: '2px' }}>
      {books.map((book) => (
        <GridBookCard key={book.id} book={book} onOpenBook={onOpenBook} />
      ))}
    </div>
  )
}

function GridBookCard({ book, onOpenBook }: { book: LibraryBook; onOpenBook: (book: Book) => void }) {
  const coverUrl = useBookCoverUrl(book.id)

  return (
    <button
      type="button"
      onClick={() => onOpenBook(book)}
      className="relative w-full overflow-hidden bg-bg-surface-2 transition-opacity active:opacity-75"
      style={{ aspectRatio: '2 / 3' }}
    >
      {coverUrl ? (
        <img
          src={coverUrl}
          alt={book.title}
          className="h-full w-full object-cover"
          onContextMenu={(e) => e.preventDefault()}
        />
      ) : (
        <div className="flex h-full w-full items-center justify-center text-white/20">
          <BookOpen size={20} />
        </div>
      )}
      {book.percentage > 0 && (
        <div className="absolute bottom-0 left-0 right-0 h-[3px] bg-black/30">
          <div className="h-full bg-success" style={{ width: `${book.percentage}%` }} />
        </div>
      )}
    </button>
  )
}
