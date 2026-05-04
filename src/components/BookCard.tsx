import { BookOpen, MoreVertical, Star } from 'lucide-react'
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
  const isNew = book.lastOpenedAt === null
  const rating = formatCardRating(book.bookInfo?.rating?.value.average)
  const publishedYear = formatPublishedYear(book.bookInfo?.publishedDate?.value)
  const hasCardMeta = !!rating || !!publishedYear

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
          background: 'linear-gradient(145deg,#240046,#7b2cbf)',
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
        {(pct > 0 || hasCardMeta) && (
          <div
            className="absolute inset-0"
            style={{ background: 'linear-gradient(to top, rgba(7,3,12,0.72) 0%, rgba(7,3,12,0.28) 34%, transparent 58%)' }}
          />
        )}

        {isNew && (
          <div
            className="absolute top-2 left-2 px-2 py-[3px] rounded-[2px] text-[10px] font-extrabold uppercase tracking-[0.08em]"
            style={{ background: '#1bcc64', color: '#fff' }}
          >
            Novo
          </div>
        )}

        {hasCardMeta && (
          <div className="absolute left-2 right-2 bottom-2 flex items-center gap-[6px] flex-wrap">
            {rating && (
              <div className="inline-flex items-center gap-1 text-[11px]" style={{ color: 'rgba(248,250,252,0.74)' }}>
                <Star size={12} fill="#1bcc64" stroke="#1bcc64" style={{ color: '#1bcc64' }} />
                <span className="text-[12px] font-bold" style={{ color: '#1bcc64' }}>{rating}</span>
              </div>
            )}
            {publishedYear && (
              <span
                className="inline-flex items-center px-2 py-[3px] rounded-[2px] text-[10px] font-extrabold uppercase tracking-[0.08em]"
                style={{ color: '#cbd5e1', border: '1px solid rgba(203,213,225,0.34)', background: 'rgba(7,3,12,0.38)' }}
              >
                {publishedYear}
              </span>
            )}
          </div>
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

function formatCardRating(average?: number | null): string | null {
  if (typeof average !== 'number' || !Number.isFinite(average) || average <= 0) return null
  return average.toFixed(1)
}

function formatPublishedYear(value?: string | null): string | null {
  const match = value?.match(/\b(\d{4})\b/)
  return match?.[1] ?? null
}
