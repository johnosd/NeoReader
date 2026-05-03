import type { NytBook } from '../services/NytBooksService'

interface NytBookCardProps {
  book: NytBook
  onPress: (book: NytBook) => void
}

export function NytBookCard({ book, onPress }: NytBookCardProps) {
  return (
    <div
      onClick={() => onPress(book)}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => e.key === 'Enter' && onPress(book)}
      className="w-full flex flex-col gap-[6px] cursor-pointer active:scale-[0.96] transition-transform duration-150"
    >
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
        {book.book_image ? (
          <img src={book.book_image} alt={book.title} className="w-full h-full object-cover" loading="lazy" />
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            <span className="text-white/15 text-3xl font-bold">#{book.rank}</span>
          </div>
        )}

        <div
          className="absolute inset-0 pointer-events-none"
          style={{ background: 'linear-gradient(to top, rgba(7,3,12,0.75) 0%, transparent 40%)' }}
        />

        <div
          className="absolute bottom-[6px] left-[6px] flex items-center justify-center rounded-[4px] px-[5px] py-[2px]"
          style={{ background: 'rgba(123,44,191,0.92)', minWidth: 22 }}
        >
          <span className="text-[10px] font-bold text-white leading-none">#{book.rank}</span>
        </div>
      </div>

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
