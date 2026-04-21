import { useState, useEffect } from 'react'
import { App as CapApp } from '@capacitor/app'
import { Bell, BookOpen } from 'lucide-react'
import { HeroBanner } from '../components/HeroBanner'
import { BookRow } from '../components/BookRow'
import { BookOptionsSheet } from '../components/BookOptionsSheet'
import { BottomNav } from '../components/BottomNav'
import { EmptyState, Skeleton } from '../components/ui'
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
    <div className="min-h-screen pb-[90px] bg-bg-base text-text-primary">
      <header className="px-5 pt-10 pb-4 flex items-center justify-between">
        <div>
          <p className="text-sm text-text-muted">Bem-vindo,</p>
          <h1 className="text-2xl font-serif font-bold text-purple-light tracking-tight">NeoReader</h1>
        </div>
        <button
          className="p-2.5 rounded-md bg-bg-surface border border-border text-text-primary active:scale-95 transition-transform"
          aria-label="Notificações"
        >
          <Bell size={20} />
        </button>
      </header>

      <main>
        {isLoading && <LibrarySkeleton />}

        {isEmpty && (
          <EmptyState
            icon={<BookOpen size={48} />}
            title="Sua biblioteca está vazia"
            description="Toque no botão + da barra inferior para adicionar seu primeiro livro EPUB."
          />
        )}

        {!isLoading && !isEmpty && (
          <>
            {heroBook && <HeroBanner book={heroBook} onPress={onOpenBook} />}
            <BookRow title="Continue lendo" books={inProgressBooks} onPress={onOpenBook} onOpenOptions={setOptionsBook} />
            <BookRow title="Meus Livros" books={recentBooks} onPress={onOpenBook} onOpenOptions={setOptionsBook} />
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

function LibrarySkeleton() {
  return (
    <div className="px-5 mt-2 space-y-3">
      <Skeleton variant="text" className="w-36" />
      <div className="flex gap-4 p-4 rounded-md bg-bg-surface">
        <Skeleton className="shrink-0 w-20 h-[120px]" />
        <div className="flex flex-col gap-2 flex-1">
          <Skeleton variant="text" className="w-3/4" />
          <Skeleton variant="text" className="w-1/2 h-3" />
          <Skeleton className="w-full h-2 mt-2" />
        </div>
      </div>
    </div>
  )
}
