import { useState, useEffect } from 'react'
import { App as CapApp } from '@capacitor/app'
import { Bell } from 'lucide-react'
import { HeroBanner } from '../components/HeroBanner'
import { BookRow } from '../components/BookRow'
import { BookOptionsSheet } from '../components/BookOptionsSheet'
import { BottomNav } from '../components/BottomNav'
import { useLibraryGroups } from '../hooks/useLibraryGroups'
import type { Book } from '../types/book'

interface LibraryScreenProps {
  onOpenBook: (book: Book) => void
  onOpenVocabulary: () => void
  onOpenSettings: () => void
}

export function LibraryScreen({ onOpenBook, onOpenVocabulary, onOpenSettings }: LibraryScreenProps) {
  const { isLoading, isEmpty, heroBook, inProgressBooks, recentBooks } = useLibraryGroups()
  const [optionsBook, setOptionsBook] = useState<Book | null>(null)

  // Intercepta o botão Back físico do Android: fecha sheet aberta ou minimiza o app
  useEffect(() => {
    const listenerPromise = CapApp.addListener('backButton', () => {
      if (optionsBook) { setOptionsBook(null); return }
      void CapApp.minimizeApp()
    })
    return () => { void listenerPromise.then((l) => l.remove()) }
  }, [optionsBook])

  return (
    <div className="min-h-screen pb-[70px]" style={{ background: '#0f0c18', color: '#fff' }}>
      {/* Header */}
      <header className="px-5 pt-10 pb-4 flex items-center justify-between">
        <div>
          <p className="text-sm" style={{ color: '#a5a5a5' }}>Bem-vindo,</p>
          <h1 className="text-2xl font-bold" style={{ color: '#c77dff' }}>NeoReader</h1>
        </div>
        <button
          className="p-2.5 rounded-xl"
          style={{ background: '#1c182b', border: '1px solid rgba(255,255,255,0.1)' }}
          aria-label="Notificações"
        >
          <Bell size={20} className="text-white" />
        </button>
      </header>

      <main>
        {/* Estado de carregamento */}
        {isLoading && <SkeletonCurrently />}

        {/* Biblioteca vazia */}
        {isEmpty && <EmptyState />}

        {/* Com livros */}
        {!isLoading && !isEmpty && (
          <>
            {/* Hero — full-width, sem padding lateral */}
            {heroBook && <HeroBanner book={heroBook} onPress={onOpenBook} />}

            {/* Continue lendo */}
            <BookRow
              title="Continue lendo"
              books={inProgressBooks}
              onPress={onOpenBook}
              onOpenOptions={setOptionsBook}
            />

            {/* Meus livros */}
            <BookRow
              title="Meus Livros"
              books={recentBooks}
              onPress={onOpenBook}
              onOpenOptions={setOptionsBook}
            />
          </>
        )}
      </main>

      <BottomNav
        onTabChange={(tab) => {
          if (tab === 'books') onOpenVocabulary()
          if (tab === 'profile') onOpenSettings()
        }}
      />

      <BookOptionsSheet book={optionsBook} onClose={() => setOptionsBook(null)} />
    </div>
  )
}


function EmptyState() {
  return (
    <div className="flex flex-col items-center justify-center py-24 gap-4 text-center px-8">
      <span className="text-6xl">📚</span>
      <h2 className="text-xl font-semibold text-white">Sua biblioteca está vazia</h2>
      <p className="text-sm" style={{ color: '#a5a5a5' }}>
        Toque no botão <span style={{ color: '#c77dff' }}>N</span> para adicionar seu primeiro livro EPUB
      </p>
    </div>
  )
}

// Skeleton enquanto o IndexedDB inicializa (geralmente &lt;100ms)
function SkeletonCurrently() {
  return (
    <div className="px-5 mt-2">
      <div className="h-4 w-36 rounded mb-3" style={{ background: '#1c182b' }} />
      <div className="flex gap-4 p-4 rounded-2xl" style={{ background: '#1c182b' }}>
        <div className="shrink-0 rounded-xl animate-pulse" style={{ width: 80, height: 120, background: '#2d2942' }} />
        <div className="flex flex-col gap-2 flex-1">
          <div className="h-4 w-3/4 rounded animate-pulse" style={{ background: '#2d2942' }} />
          <div className="h-3 w-1/2 rounded animate-pulse" style={{ background: '#2d2942' }} />
          <div className="h-2 w-full rounded animate-pulse mt-2" style={{ background: '#2d2942' }} />
        </div>
      </div>
    </div>
  )
}
