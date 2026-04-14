import { useMemo } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../db/database'
import type { Book } from '../types/book'

interface BookCardProps {
  book: Book
  onPress: (book: Book) => void
}

export function BookCard({ book, onPress }: BookCardProps) {
  // Busca o progresso deste livro do IndexedDB
  const progress = useLiveQuery(
    () => db.progress.where('bookId').equals(book.id!).first(),
    [book.id],
  )

  // Converte o Blob da capa em uma URL de objeto para exibir no <img>
  // useMemo evita recriar a URL a cada render
  const coverUrl = useMemo(() => {
    if (!book.coverBlob) return null
    return URL.createObjectURL(book.coverBlob)
    // Nota: em produção, revogaríamos essa URL com useEffect cleanup.
    // Para o MVP isso é aceitável — o número de livros é pequeno.
  }, [book.coverBlob])

  const percentage = progress?.percentage ?? 0

  return (
    <button
      onClick={() => onPress(book)}
      className="flex flex-col gap-2 text-left active:scale-95 transition-transform duration-150"
    >
      {/* Capa do livro */}
      <div className="relative w-full aspect-[2/3] rounded-md overflow-hidden bg-[#1a1a1a]">
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
      </div>

      {/* Metadados */}
      <div className="min-w-0">
        <p className="text-white text-sm font-semibold truncate">{book.title}</p>
        <p className="text-[#a0a0a0] text-xs truncate">{book.author}</p>
      </div>
    </button>
  )
}
