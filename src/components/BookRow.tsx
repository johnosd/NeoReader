import { BookCard } from './BookCard'
import type { BookWithProgress } from '../hooks/useLibraryGroups'
import type { Book } from '../types/book'

interface BookRowProps {
  title: string
  books: BookWithProgress[]
  onPress: (book: Book) => void
}

export function BookRow({ title, books, onPress }: BookRowProps) {
  // Row vazia não renderiza nada (ex: "Continue lendo" sem livros em progresso)
  if (books.length === 0) return null

  return (
    <section className="mt-6">
      <h2 className="text-white font-semibold text-base px-4 mb-3">{title}</h2>

      {/* overflow-x-auto: scroll horizontal nativo com momentum no Android.
          scrollbar-hide: esconde a barra de scroll visual (definido no index.css). */}
      <div className="overflow-x-auto scrollbar-hide">
        <div className="flex gap-3 px-4 pb-1">
          {books.map(book => (
            // w-32 (128px) shrink-0: cada card tem largura fixa,
            // não encolhe — mantém ~2.5 capas visíveis por tela
            <div key={book.id} className="w-32 shrink-0">
              <BookCard book={book} onPress={onPress} />
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}
