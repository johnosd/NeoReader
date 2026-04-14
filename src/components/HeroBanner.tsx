import { useMemo } from 'react'
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
    <div className="relative w-full" style={{ aspectRatio: '16/9' }}>
      {/* Imagem de capa — ocupa o banner inteiro */}
      {coverUrl ? (
        <img src={coverUrl} alt={book.title} className="w-full h-full object-cover" />
      ) : (
        <div className="w-full h-full bg-[#1a1a1a] flex items-center justify-center">
          <span className="text-6xl">📖</span>
        </div>
      )}

      {/* Gradient: preto sólido na base, desvanece para transparente no topo.
          Garante legibilidade do texto sobre qualquer capa. */}
      <div className="absolute inset-0 bg-gradient-to-t from-[#0a0a0a] via-[#0a0a0a]/50 to-transparent" />

      {/* Título, autor e CTA — ancorados na base do banner */}
      <div className="absolute bottom-0 left-0 right-0 px-4 pb-5">
        <h2 className="text-lg font-bold text-white truncate">{book.title}</h2>
        <p className="text-[#a0a0a0] text-sm truncate mb-3">{book.author}</p>

        <div className="flex items-center gap-3">
          <button
            onClick={() => onPress(book)}
            className="flex items-center gap-2 bg-white text-black px-5 py-2 rounded-md font-semibold text-sm active:opacity-80 transition-opacity"
          >
            ▶ {book.percentage > 0 ? 'Continuar' : 'Ler'}
          </button>
          {book.percentage > 0 && (
            <span className="text-[#a0a0a0] text-sm">{book.percentage}% lido</span>
          )}
        </div>
      </div>
    </div>
  )
}
