import { useMemo } from 'react'
import { Play, BookOpen } from 'lucide-react'
import type { BookWithProgress } from '../hooks/useLibraryGroups'
import type { Book } from '../types/book'

interface HeroBannerProps {
  book: BookWithProgress
  onPress: (book: Book) => void
}

export function HeroBanner({ book, onPress }: HeroBannerProps) {
  // Cria URL temporária para exibir o Blob da capa (cleanup não crítico no MVP)
  const coverUrl = useMemo(() => (
    book.coverBlob ? URL.createObjectURL(book.coverBlob) : null
  ), [book.coverBlob])

  return (
    <div className="relative w-full aspect-[16/9]">
      {coverUrl ? (
        <img src={coverUrl} alt={book.title} className="w-full h-full object-cover" />
      ) : (
        <div className="w-full h-full flex items-center justify-center bg-bg-surface text-text-muted">
          <BookOpen size={56} />
        </div>
      )}

      {/* Gradiente do DS: bg-base sólido na base → transparente no topo */}
      <div className="absolute inset-0 bg-gradient-to-t from-bg-base via-bg-base/50 to-transparent" />

      <div className="absolute bottom-0 left-0 right-0 px-4 pb-5">
        <h2 className="text-xl font-serif font-bold text-text-primary truncate">{book.title}</h2>
        <p className="text-sm text-text-muted truncate mb-3">{book.author}</p>

        <div className="flex items-center gap-3">
          <button
            onClick={() => onPress(book)}
            className="flex items-center gap-2 bg-white text-black px-5 py-2 rounded-md font-semibold text-sm active:scale-[0.97] transition-transform duration-150"
          >
            <Play size={14} fill="currentColor" />
            {book.readingStatus === 'finished'
              ? 'Reler'
              : book.readingStatus === 'reading'
                ? 'Continuar'
                : 'Ler'}
          </button>
          {book.readingStatus !== 'unread' && (
            <span className="text-sm text-text-muted">
              {book.readingStatus === 'finished' ? 'Concluído' : `${book.percentage}% lido`}
            </span>
          )}
        </div>
      </div>
    </div>
  )
}
