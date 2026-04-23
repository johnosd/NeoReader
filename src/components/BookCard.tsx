import { MoreVertical, BookOpen } from 'lucide-react'
import type { BookWithProgress } from '../hooks/useLibraryGroups'
import { useBookCoverUrl } from '../hooks/useBookCoverUrl'

interface BookCardProps {
  book: BookWithProgress
  onPress: (book: BookWithProgress) => void
  onOpenOptions?: (book: BookWithProgress) => void
}

export function BookCard({ book, onPress, onOpenOptions }: BookCardProps) {
  const coverUrl = useBookCoverUrl(book.id)

  const pct = book.percentage

  return (
    <div
      onClick={() => onPress(book)}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => e.key === 'Enter' && onPress(book)}
      className="w-full flex flex-col gap-[6px] cursor-pointer active:scale-[0.96] transition-transform duration-150"
    >
      {/* Cover */}
      <div
        className="relative w-full overflow-hidden"
        style={{
          aspectRatio: '2/3',
          borderRadius: 6,
          background: '#1e0e2d',
          border: '1px solid rgba(255,255,255,0.07)',
          boxShadow: '0 4px 14px rgba(0,0,0,0.45)',
        }}
      >
        {coverUrl ? (
          <img src={coverUrl} alt={book.title} className="w-full h-full object-cover" />
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            <BookOpen size={28} className="text-white/15" />
          </div>
        )}

        {/* Bottom gradient for badge legibility */}
        {pct > 0 && (
          <div
            className="absolute inset-0"
            style={{ background: 'linear-gradient(to top, rgba(7,3,12,0.6) 0%, transparent 40%)' }}
          />
        )}

        {/* Progress bar */}
        {pct > 0 && (
          <div className="absolute bottom-0 left-0 right-0 h-[3px]" style={{ background: 'rgba(255,255,255,0.1)' }}>
            <div
              className="h-full transition-all duration-300"
              style={{ width: `${pct}%`, background: '#7b2cbf' }}
            />
          </div>
        )}

        {/* Options button */}
        {onOpenOptions && (
          <button
            onClick={(e) => { e.stopPropagation(); onOpenOptions(book) }}
            className="absolute top-[5px] right-[5px] w-6 h-6 rounded-full flex items-center justify-center active:opacity-60 transition-opacity"
            style={{ background: 'rgba(0,0,0,0.65)', border: '1px solid rgba(255,255,255,0.1)' }}
            aria-label="Opções do livro"
          >
            <MoreVertical size={12} className="text-white/80" />
          </button>
        )}
      </div>

      {/* Info */}
      <div className="min-w-0 px-[2px]">
        <p className="text-[12px] font-semibold leading-tight truncate" style={{ color: '#f1f5f9' }}>
          {book.title}
        </p>
        <p className="text-[10px] mt-[2px] truncate" style={{ color: 'rgba(100,116,139,0.9)' }}>
          {book.author}
        </p>
      </div>
    </div>
  )
}
