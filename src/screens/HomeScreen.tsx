import { useState, useEffect, useRef } from 'react'
import { App as CapApp } from '@capacitor/app'
import { Capacitor } from '@capacitor/core'
import { BookOpen, Plus, Settings } from 'lucide-react'
import neoLogo from '../../docs/design-system/logo/neo-reader-header-logo.svg'
import { HeroBanner } from '../components/HeroBanner'
import { BookRow } from '../components/BookRow'
import { QuickBookActionsSheet } from '../components/QuickBookActionsSheet'
import { BottomNav } from '../components/BottomNav'
import { EmptyState, Skeleton, Toast } from '../components/ui'
import { useCapacitorBackButton } from '../hooks/useCapacitorAppListener'
import { useIsImportActive } from '../hooks/useImportActivity'
import { useLibraryGroups } from '../hooks/useLibraryGroups'
import { BookImportService } from '../services/BookImportService'
import { IMPORT_IN_PROGRESS_MESSAGE } from '../services/ImportCoordinator'
import { logImportDiagnostic } from '../services/ImportDiagnostics'
import { consumePendingNativeFileSelection, selectNativeEpubFile } from '../services/NativeLibraryImportService'
import type { Book } from '../types/book'

interface HomeScreenProps {
  onOpenBook: (book: Book) => void
  onOpenBiblioteca: () => void
  onOpenDiscover: () => void
  onOpenProfile: () => void
  onOpenSettings: () => void
}

export function HomeScreen({ onOpenBook, onOpenBiblioteca, onOpenDiscover, onOpenProfile, onOpenSettings }: HomeScreenProps) {
  const { isLoading, isEmpty, heroBook, inProgressBooks, recentBooks } = useLibraryGroups()
  const [optionsBook, setOptionsBook] = useState<Book | null>(null)
  const [importing, setImporting] = useState(false)
  const [importError, setImportError] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const importActive = useIsImportActive()
  const importBusy = importing || importActive

  useCapacitorBackButton(() => {
    if (optionsBook) { setOptionsBook(null); return }
    void CapApp.minimizeApp()
  })

  useEffect(() => {
    let active = true
    void consumePendingNativeFileSelection().then(async (nativeFile) => {
      if (!active || !nativeFile) return
      logImportDiagnostic('ui', 'home-pending-native-file-start', { fileName: nativeFile.name, fileSize: nativeFile.size })
      setImporting(true)
      setImportError(null)
      try {
        await BookImportService.importNativeEpub(nativeFile)
      } catch (err) {
        setImportError(err instanceof Error ? err.message : 'Erro ao importar o arquivo')
      } finally {
        if (active) setImporting(false)
        logImportDiagnostic('ui', 'home-pending-native-file-finished', { fileName: nativeFile.name })
      }
    }).catch(() => undefined)
    return () => { active = false }
  }, [])

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    if (BookImportService.isImportInProgress()) {
      setImportError(IMPORT_IN_PROGRESS_MESSAGE)
      if (fileInputRef.current) fileInputRef.current.value = ''
      return
    }
    logImportDiagnostic('ui', 'home-web-file-import-start', { fileName: file.name, fileSize: file.size })
    setImporting(true)
    setImportError(null)
    try {
      await BookImportService.importEpub(file)
    } catch (err) {
      setImportError(err instanceof Error ? err.message : 'Erro ao importar o arquivo')
    } finally {
      setImporting(false)
      logImportDiagnostic('ui', 'home-web-file-import-finished', { fileName: file.name })
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }

  async function handleAddBook() {
    if (BookImportService.isImportInProgress()) {
      setImportError(IMPORT_IN_PROGRESS_MESSAGE)
      return
    }

    if (!Capacitor.isNativePlatform()) {
      fileInputRef.current?.click()
      return
    }

    setImporting(true)
    logImportDiagnostic('ui', 'home-native-file-import-start')
    setImportError(null)
    try {
      const nativeFile = await selectNativeEpubFile()
      if (nativeFile) await BookImportService.importNativeEpub(nativeFile)
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') return
      setImportError(err instanceof Error ? err.message : 'Erro ao importar o arquivo')
    } finally {
      setImporting(false)
      logImportDiagnostic('ui', 'home-native-file-import-finished')
    }
  }

  const showFloatingHeader = !isLoading && !isEmpty && !!heroBook

  return (
    <div className="min-h-screen pb-[90px] bg-bg-base text-text-primary">
      <input ref={fileInputRef} type="file" accept=".epub" className="hidden" onChange={handleFileChange} />

      {importError && <Toast tone="error" onDismiss={() => setImportError(null)}>{importError}</Toast>}

      {/* Normal (block) header — shown when no hero */}
      {!showFloatingHeader && (
        <header className="px-4 pt-8 pb-3 flex items-center justify-between">
          <LibraryLogo />
          <SettingsButton onClick={onOpenSettings} />
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
                <header className="absolute top-0 left-0 right-0 z-20 flex items-center justify-between px-4 pt-8 pb-6">
                  <div
                    className="absolute inset-0 pointer-events-none"
                    style={{ background: 'linear-gradient(180deg, rgba(7,3,12,0.96) 0%, rgba(7,3,12,0.80) 55%, transparent 100%)' }}
                  />
                  <div className="relative"><LibraryLogo /></div>
                  <div className="relative"><SettingsButton glass onClick={onOpenSettings} /></div>
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
        onClick={handleAddBook}
        disabled={importBusy}
        aria-label="Adicionar livro"
        className="fixed right-4 z-50 w-[52px] h-[52px] rounded-full flex items-center justify-center
          active:scale-90 transition-all duration-150 disabled:opacity-60"
        style={{
          bottom: 'calc(72px + env(safe-area-inset-bottom, 0px))',
          background: 'linear-gradient(145deg, #9d4edd 0%, #7b2cbf 55%, #5a189a 100%)',
          boxShadow: '0 0 0 3px rgba(10,5,18,1), 0 0 20px rgba(123,44,191,0.55), 0 4px 16px rgba(0,0,0,0.5)',
        }}
      >
        {importBusy
          ? <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
          : <Plus size={22} strokeWidth={2.5} className="text-white" />
        }
      </button>

      <BottomNav
        activeTab="home"
        onTabChange={(tab) => {
          if (tab === 'home') return
          if (tab === 'biblioteca') onOpenBiblioteca()
          if (tab === 'discover') onOpenDiscover()
          if (tab === 'profile') onOpenProfile()
        }}
      />

      <QuickBookActionsSheet book={optionsBook} onClose={() => setOptionsBook(null)} />
    </div>
  )
}

function LibraryLogo() {
  return (
    <div className="flex items-center gap-2" aria-label="NeoReader">
      <img
        src={neoLogo}
        alt=""
        aria-hidden
        className="h-14 w-14 object-contain drop-shadow-[0_0_12px_rgba(168,85,247,0.45)]"
      />
      <h1 className="text-xl font-black tracking-[-0.02em] leading-none text-text-primary">
        Neo<span className="text-purple-primary">Reader</span>
      </h1>
    </div>
  )
}

function SettingsButton({ glass, onClick }: { glass?: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={[
        'p-2.5 rounded-md text-text-primary active:scale-95 transition-transform',
        glass
          ? 'bg-black/30 border border-white/15 text-white backdrop-blur-sm'
          : 'bg-bg-surface border border-border',
      ].join(' ')}
      aria-label="Configurações gerais"
    >
      <Settings size={20} />
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
