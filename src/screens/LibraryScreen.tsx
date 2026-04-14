import { GraduationCap } from 'lucide-react'
import { HeroBanner } from '../components/HeroBanner'
import { BookRow } from '../components/BookRow'
import { AddBookButton } from '../components/AddBookButton'
import { useLibraryGroups } from '../hooks/useLibraryGroups'
import type { Book } from '../types/book'

interface LibraryScreenProps {
  onOpenBook: (book: Book) => void
  onOpenVocabulary: () => void
}

export function LibraryScreen({ onOpenBook, onOpenVocabulary }: LibraryScreenProps) {
  const { isLoading, isEmpty, heroBook, inProgressBooks, recentBooks } = useLibraryGroups()

  return (
    <div className="min-h-screen bg-[#0a0a0a] text-white">
      {/* Header — sobrepõe o hero banner via posicionamento absoluto */}
      <header className="relative z-10 px-4 pt-10 pb-4 flex items-center justify-between">
        <h1 className="text-2xl font-bold text-[#6366f1]">NeoReader</h1>
        <button
          onClick={onOpenVocabulary}
          className="text-[#a0a0a0] active:text-white transition-colors p-1"
          aria-label="Vocabulário"
        >
          <GraduationCap size={22} />
        </button>
      </header>

      <main className="pb-24">
        {/* Carregando: skeleton do hero */}
        {isLoading && <SkeletonHero />}

        {/* Biblioteca vazia */}
        {isEmpty && <EmptyState />}

        {/* Com livros: hero + rows */}
        {!isLoading && !isEmpty && (
          <>
            {heroBook && <HeroBanner book={heroBook} onPress={onOpenBook} />}
            <BookRow title="Continue lendo" books={inProgressBooks} onPress={onOpenBook} />
            <BookRow title="Adicionados recentemente" books={recentBooks} onPress={onOpenBook} />
          </>
        )}
      </main>

      <AddBookButton />
    </div>
  )
}

function EmptyState() {
  return (
    <div className="flex flex-col items-center justify-center py-24 gap-4 text-center">
      <span className="text-6xl">📚</span>
      <h2 className="text-xl font-semibold text-white">Sua biblioteca está vazia</h2>
      <p className="text-[#a0a0a0] text-sm max-w-56">
        Toque no botão + para adicionar seu primeiro livro EPUB
      </p>
    </div>
  )
}

// Skeleton do hero enquanto o IndexedDB inicializa (geralmente <100ms)
function SkeletonHero() {
  return (
    <div className="px-4 mt-2">
      <div className="w-full bg-[#1a1a1a] animate-pulse rounded-md" style={{ aspectRatio: '16/9' }} />
      <div className="mt-3 h-4 w-2/3 bg-[#1a1a1a] animate-pulse rounded" />
      <div className="mt-2 h-3 w-1/3 bg-[#1a1a1a] animate-pulse rounded" />
    </div>
  )
}
