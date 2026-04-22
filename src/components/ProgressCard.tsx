import { useMemo } from 'react'
import { BookOpen, MoreVertical } from 'lucide-react'
import type { BookWithProgress } from '../hooks/useLibraryGroups'
import type { Book } from '../types/book'

interface ProgressCardProps {
  book: BookWithProgress
  onPress: (book: Book) => void
  onOpenOptions?: (book: Book) => void
}

export function ProgressCard({ book, onPress, onOpenOptions }: ProgressCardProps) {
  const coverUrl = useMemo(() => (
    book.coverBlob ? URL.createObjectURL(book.coverBlob) : null
  ), [book.coverBlob])

  return (
    <div
      onClick={() => onPress(book)}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => e.key === 'Enter' && onPress(book)}
      className="flex overflow-hidden rounded-lg active:scale-[0.97] transition-transform duration-150 cursor-pointer"
      style={{
        width: 252,
        flexShrink: 0,
        background: '#12091a',
        border: '1px solid rgba(255,255,255,0.07)',
        boxShadow: '0 4px 16px rgba(0,0,0,0.35)',
      }}
    >
      {/* Cover */}
      <div className="w-[72px] flex-shrink-0 relative overflow-hidden" style={{ background: '#1e0e2d' }}>
        {coverUrl ? (
          <img src={coverUrl} alt={book.title} className="w-full h-full object-cover" />
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            <BookOpen size={22} className="text-white/20" />
          </div>
        )}
      </div>

      {/* Content */}
      <div className="flex-1 flex flex-col justify-center gap-[5px] px-3 py-[14px] min-w-0">
        <p className="text-[13px] font-semibold text-white leading-tight truncate">{book.title}</p>
        <p className="text-[10px] truncate" style={{ color: 'rgba(148,163,184,0.75)' }}>{book.author}</p>

        {/* Progress bar */}
        <div className="h-[3px] overflow-hidden rounded-full mt-[2px]" style={{ background: 'rgba(255,255,255,0.1)' }}>
          <div
            className="h-full rounded-full transition-all duration-500"
            style={{ width: `${book.percentage}%`, background: '#7b2cbf' }}
          />
        </div>

        {/* Status row */}
        <div className="flex items-center justify-between mt-[1px]">
          <span className="text-[10px] font-semibold" style={{ color: '#a855f7' }}>
            {book.percentage}% concluído
          </span>
          {onOpenOptions && (
            <button
              onClick={(e) => { e.stopPropagation(); onOpenOptions(book) }}
              className="w-5 h-5 flex items-center justify-center rounded-full active:opacity-60 transition-opacity"
              style={{ background: 'rgba(255,255,255,0.06)' }}
              aria-label="Opções"
            >
              <MoreVertical size={11} className="text-white/50" />
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
