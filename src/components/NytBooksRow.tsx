import { NytBookCard } from './NytBookCard'
import { Skeleton } from './ui'
import { useNytTrending } from '../hooks/useNytTrending'
import type { NytBook } from '../services/NytBooksService'
import { useI18n } from '../i18n'

interface NytBooksRowProps {
  listName: string
}

function openUrl(url: string) {
  window.open(url, '_blank', 'noopener,noreferrer')
}

export function NytBooksRow({ listName }: NytBooksRowProps) {
  const { t } = useI18n()
  const { books, displayName, loading, error } = useNytTrending(listName)

  function handlePress(book: NytBook) {
    if (book.amazon_product_url) openUrl(book.amazon_product_url)
  }

  return (
    <section className="mt-6">
      <div className="flex items-center gap-2 px-5 mb-3">
        <h2 className="text-[15px] font-semibold truncate" style={{ color: '#f1f5f9' }}>
          {loading ? ' ' : displayName}
        </h2>
        <span
          className="shrink-0 rounded-full px-[6px] py-[2px] text-[9px] font-bold tracking-wide uppercase"
          style={{ background: '#b00020', color: '#fff' }}
        >
          NYT
        </span>
      </div>

      <div className="flex gap-3 overflow-x-auto scrollbar-hide px-5 pb-1">
        {loading && Array.from({ length: 5 }).map((_, index) => (
          <div key={index} className="shrink-0 w-[100px]">
            <Skeleton variant="card" className="w-full" />
            <Skeleton variant="text" className="mt-2 w-4/5 h-3" />
            <Skeleton variant="text" className="mt-1 w-3/5 h-2" />
          </div>
        ))}

        {!loading && error && (
          <p className="text-[12px] px-1" style={{ color: 'rgba(100,116,139,0.75)' }}>
            {t('nyt.rowError')}
          </p>
        )}

        {!loading && !error && books.map((book) => (
          <div key={`${book.rank}-${book.title}`} className="shrink-0 w-[100px]">
            <NytBookCard book={book} onPress={handlePress} />
          </div>
        ))}
      </div>
    </section>
  )
}
