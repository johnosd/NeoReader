import { useMemo } from 'react'
import { MoreVertical, BookOpen } from 'lucide-react'
import type { BookWithProgress } from '../hooks/useLibraryGroups'

interface BookCardProps {
  book: BookWithProgress
  onPress: (book: BookWithProgress) => void
  onOpenOptions?: (book: BookWithProgress) => void
}

export function BookCard({ book, onPress, onOpenOptions }: BookCardProps) {
  // Converte o Blob da capa em uma URL de objeto para exibir no <img>.
  // useMemo evita recriar a URL a cada render (em prod, revogaríamos no cleanup).
  const coverUrl = useMemo(() => {
    if (!book.coverBlob) return null
    return URL.createObjectURL(book.coverBlob)
  }, [book.coverBlob])

  const percentage = book.percentage

  return (
    // div em vez de button: HTML não permite button aninhado (precisamos do "opções" na capa).
    <div
      onClick={() => onPress(book)}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => e.key === 'Enter' && onPress(book)}
      className="w-full flex flex-col gap-2 text-left cursor-pointer transition-transform duration-200 active:scale-[0.97]"
    >
      <div className="relative w-full aspect-[2/3] rounded-md overflow-hidden bg-bg-surface shadow-card">
        {coverUrl ? (
          <img src={coverUrl} alt={book.title} className="w-full h-full object-cover" />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-text-muted">
            <BookOpen size={32} />
          </div>
        )}

        {percentage > 0 && (
          <div className="absolute bottom-0 left-0 right-0 h-1 bg-black/40">
            <div
              className="h-full bg-success transition-all duration-300"
              style={{ width: `${percentage}%` }}
            />
          </div>
        )}

        {onOpenOptions && (
          <button
            onClick={(e) => { e.stopPropagation(); onOpenOptions(book) }}
            className="absolute top-1 right-1 p-1 rounded-full bg-black/50 text-white active:opacity-60"
            aria-label="Opções do livro"
          >
            <MoreVertical size={14} />
          </button>
        )}
      </div>

      <div className="min-w-0">
        <p className="text-text-primary text-sm font-semibold truncate">{book.title}</p>
        <p className="text-text-muted text-xs truncate">{book.author}</p>
      </div>
    </div>
  )
}
