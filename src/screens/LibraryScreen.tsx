import { useState, useEffect, useRef } from 'react'
import { App as CapApp } from '@capacitor/app'
import { Bell, BookOpen, Plus } from 'lucide-react'
import neoLogo from '../../docs/design-system/logo/pacote_logos/neo_reader_icon_reduced_transparent.svg'
import { HeroBanner } from '../components/HeroBanner'
import { BookRow } from '../components/BookRow'
import { BookOptionsSheet } from '../components/BookOptionsSheet'
import { BottomNav } from '../components/BottomNav'
import { EmptyState, Skeleton, Toast } from '../components/ui'
import { useLibraryGroups } from '../hooks/useLibraryGroups'
import { BookImportService } from '../services/BookImportService'
import type { Book } from '../types/book'

interface LibraryScreenProps {
  onOpenBook: (book: Book) => void
  onOpenVocabulary: () => void
  onOpenSettings: () => void
}

export function LibraryScreen({ onOpenBook, onOpenVocabulary, onOpenSettings }: LibraryScreenProps) {
  const { isLoading, isEmpty, heroBook, inProgressBooks, recentBooks } = useLibraryGroups()
  const [optionsBook, setOptionsBook] = useState<Book | null>(null)
  const [importing, setImporting] = useState(false)
  const [importError, setImportError] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    const listenerPromise = CapApp.addListener('backButton', () => {
      if (optionsBook) { setOptionsBook(null); return }
      void CapApp.minimizeApp()
    })
    return () => { void listenerPromise.then((l) => l.remove()) }
  }, [optionsBook])

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setImporting(true)
    setImportError(null)
    try {
      await BookImportService.importEpub(file)
    } catch (err) {
      setImportError(err instanceof Error ? err.message : 'Erro ao importar o arquivo')
    } finally {
      setImporting(false)
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }

  const showFloatingHeader = !isLoading && !isEmpty && !!heroBook

  return (
    <div className="min-h-screen pb-[90px] bg-bg-base text-text-primary">
      <input ref={fileInputRef} type="file" accept=".epub" className="hidden" onChange={handleFileChange} />

      {importError && <Toast tone="error" onDismiss={() => setImportError(null)}>{importError}</Toast>}

      {/* Normal (block) header — shown when no hero */}
      {!showFloatingHeader && (
        <header className="pl-0 pr-3 pt-1 pb-3 flex items-center justify-between">
          <LibraryLogo />
          <NotificationButton />
        </header>
      )}

      <main>
        {isLoading && <LibrarySkeleton />}

        {isEmpty && (
          <EmptyState
            icon={<BookOpen size={48} />}
            title="Sua biblioteca está vazia"
            description="Toque no botão + para adicionar seu primeiro livro EPUB."
          />
        )}

        {!isLoading && !isEmpty && (
          <>
            <div className="relative">
              {showFloatingHeader && (
                <header className="absolute top-0 left-0 right-0 z-20 flex items-center justify-between px-3 pt-8 pb-6">
                  <div
                    className="absolute inset-0 pointer-events-none"
                    style={{ background: 'linear-gradient(180deg, rgba(7,3,12,0.96) 0%, rgba(7,3,12,0.80) 55%, transparent 100%)' }}
                  />
                  <div className="relative"><LibraryLogo /></div>
                  <div className="relative"><NotificationButton glass /></div>
                </header>
              )}

              {heroBook && (
                <HeroBanner
                  book={heroBook}
                  onPress={onOpenBook}
                  onOpenOptions={setOptionsBook}
                />
              )}
            </div>

            <BookRow title="Continue lendo" books={inProgressBooks} onPress={onOpenBook} onOpenOptions={setOptionsBook} variant="progress" />
            <BookRow title="Meus Livros" books={recentBooks} onPress={onOpenBook} onOpenOptions={setOptionsBook} />
          </>
        )}
      </main>

      {/* FAB de importar — flutua acima do nav bar */}
      <button
        onClick={() => fileInputRef.current?.click()}
        disabled={importing}
        aria-label="Adicionar livro"
        className="fixed right-4 z-50 w-[52px] h-[52px] rounded-full flex items-center justify-center
          active:scale-90 transition-all duration-150 disabled:opacity-60"
        style={{
          bottom: 'calc(72px + env(safe-area-inset-bottom, 0px))',
          background: 'linear-gradient(145deg, #9d4edd 0%, #7b2cbf 55%, #5a189a 100%)',
          boxShadow: '0 0 0 3px rgba(10,5,18,1), 0 0 20px rgba(123,44,191,0.55), 0 4px 16px rgba(0,0,0,0.5)',
        }}
      >
        {importing
          ? <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
          : <Plus size={22} strokeWidth={2.5} className="text-white" />
        }
      </button>

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

function LibraryLogo() {
  return (
    <div className="flex items-center gap-1">
      <img src={neoLogo} alt="" aria-hidden className="w-[132px] h-[132px] -ml-[30px]" />
      <h1 className="text-[1.35rem] font-black tracking-tight leading-none">
        <span className="text-white" style={{ textShadow: '0 0 12px rgba(255,255,255,0.55), 0 0 28px rgba(200,160,255,0.3)' }}>
          Neo
        </span>
        <span style={{ color: '#a855f7' }}>Reader</span>
      </h1>
    </div>
  )
}

function NotificationButton({ glass }: { glass?: boolean }) {
  return (
    <button
      className={[
        'p-2.5 rounded-md text-text-primary active:scale-95 transition-transform',
        glass
          ? 'bg-black/30 border border-white/15 text-white backdrop-blur-sm'
          : 'bg-bg-surface border border-border',
      ].join(' ')}
      aria-label="Notificações"
    >
      <Bell size={20} />
    </button>
  )
}

function LibrarySkeleton() {
  return (
    <div className="px-5 mt-2 space-y-6">
      <div className="rounded-[28px] overflow-hidden border border-border bg-bg-surface/80 p-4">
        <Skeleton variant="text" className="w-28 h-5" />
        <div className="mt-24">
          <Skeleton variant="text" className="w-3/4 h-8" />
          <Skeleton variant="text" className="w-full mt-3" />
          <Skeleton variant="text" className="w-5/6 mt-2" />
          <Skeleton className="w-full h-2 mt-6" />
          <div className="flex gap-3 mt-5">
            <Skeleton className="flex-1 h-11 rounded-full" />
            <Skeleton className="flex-1 h-11 rounded-full" />
          </div>
        </div>
      </div>
      <div className="space-y-3">
        <Skeleton variant="text" className="w-36" />
        <div className="flex gap-4">
          <Skeleton className="w-32 h-48 rounded-md" />
          <Skeleton className="w-32 h-48 rounded-md" />
          <Skeleton className="w-32 h-48 rounded-md" />
        </div>
      </div>
    </div>
  )
}
