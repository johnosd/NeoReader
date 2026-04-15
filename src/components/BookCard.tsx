import { useEffect, useState } from 'react'
import { MoreVertical } from 'lucide-react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../db/database'
import type { Book } from '../types/book'

interface BookCardProps {
  book: Book
  onPress: (book: Book) => void
  onOpenOptions?: (book: Book) => void
}

export function BookCard({ book, onPress, onOpenOptions }: BookCardProps) {
  // Busca o progresso deste livro do IndexedDB
  const progress = useLiveQuery(
    () => db.progress.where('bookId').equals(book.id!).first(),
    [book.id],
  )

  const [coverUrl, setCoverUrl] = useState<string | null>(null)

  useEffect(() => {
    if (!book.coverBlob) {
      setCoverUrl(null)
      return
    }

    const url = URL.createObjectURL(book.coverBlob)
    setCoverUrl(url)
    return () => URL.revokeObjectURL(url)
  }, [book.coverBlob])

  const percentage = progress?.percentage ?? 0

  return (
    // div em vez de button: o HTML não permite <button> dentro de <button>,
    // e precisamos do botão de opções aninhado na capa.
    <div
      onClick={() => onPress(book)}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => e.key === 'Enter' && onPress(book)}
      className="w-full flex flex-col gap-2 text-left active:scale-95 transition-transform duration-150 cursor-pointer"
    >
      {/* Capa do livro */}
      <div className="relative w-full aspect-[2/3] rounded-md overflow-hidden" style={{ background: '#1c182b' }}>
        {coverUrl ? (
          <img
            src={coverUrl}
            alt={book.title}
            className="w-full h-full object-cover"
          />
        ) : (
          // Placeholder quando não há capa
          <div className="w-full h-full flex items-center justify-center">
            <span className="text-4xl">📖</span>
          </div>
        )}

        {/* Barra de progresso na base da capa — só aparece se tiver progresso */}
        {percentage > 0 && (
          <div className="absolute bottom-0 left-0 right-0 h-1 bg-black/40">
            <div
              className="h-full bg-[#22c55e] transition-all duration-300"
              style={{ width: `${percentage}%` }}
            />
          </div>
        )}

        {/* Botão de opções — canto superior direito da capa */}
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

      {/* Metadados */}
      <div className="min-w-0">
        <p className="text-white text-sm font-semibold truncate">{book.title}</p>
        <p className="text-[#a0a0a0] text-xs truncate">{book.author}</p>
      </div>
    </div>
  )
}
