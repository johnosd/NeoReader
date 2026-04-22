import { ChevronRight } from 'lucide-react'
import { BookCard } from './BookCard'
import { ProgressCard } from './ProgressCard'
import type { BookWithProgress } from '../hooks/useLibraryGroups'
import type { Book } from '../types/book'

interface BookRowProps {
  title: string
  books: BookWithProgress[]
  onPress: (book: Book) => void
  onOpenOptions?: (book: Book) => void
  /** 'progress' → horizontal ProgressCard; 'default' → vertical BookCard */
  variant?: 'default' | 'progress'
}

export function BookRow({ title, books, onPress, onOpenOptions, variant = 'default' }: BookRowProps) {
  if (books.length === 0) return null

  return (
    <section className="mt-7">
      {/* Row header */}
      <div className="flex items-center justify-between px-5 mb-3">
        <h2
          className="text-[15px] font-bold tracking-tight"
          style={{ color: '#f1f5f9' }}
        >
          {title}
        </h2>
        <button
          className="flex items-center gap-[2px] text-[11px] font-semibold active:opacity-60 transition-opacity"
          style={{ color: '#a855f7' }}
          aria-label={`Ver tudo em ${title}`}
        >
          Ver tudo
          <ChevronRight size={13} strokeWidth={2.5} />
        </button>
      </div>

      {/* Scroll horizontal */}
      <div className="overflow-x-auto scrollbar-hide">
        {variant === 'progress' ? (
          /* Horizontal progress cards — wider, gap generoso */
          <div className="flex gap-3 px-5 pb-2">
            {books.map(book => (
              <ProgressCard
                key={book.id}
                book={book}
                onPress={onPress}
                onOpenOptions={onOpenOptions}
              />
            ))}
          </div>
        ) : (
          /* Vertical cover cards */
          <div className="flex gap-3 px-5 pb-2">
            {books.map(book => (
              <div key={book.id} className="w-[100px] shrink-0">
                <BookCard book={book} onPress={onPress} onOpenOptions={onOpenOptions} />
              </div>
            ))}
          </div>
        )}
      </div>
    </section>
  )
}
