import { useCallback, useEffect, useRef, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { App as CapApp } from '@capacitor/app'
import { EpubViewer, type EpubViewerHandle, type FontSize } from '../components/reader/EpubViewer'
import { ReaderChrome } from '../components/reader/ReaderChrome'
import { TocSheet } from '../components/reader/TocSheet'
import { BookmarkSheet } from '../components/reader/BookmarkSheet'
import { TranslationBubble } from '../components/reader/TranslationBubble'
import { useReaderProgress } from '../hooks/useReaderProgress'
import { useReaderStore } from '../store/readerStore'
import { upsertProgress } from '../db/progress'
import { updateLastOpened } from '../db/books'
import { addBookmark, deleteBookmark } from '../db/bookmarks'
import { db } from '../db/database'
import type { Book } from '../types/book'

interface ReaderScreenProps {
  book: Book
  onBack: () => void
}

export function ReaderScreen({ book, onBack }: ReaderScreenProps) {
  const viewerRef = useRef<EpubViewerHandle>(null)

  // Estado local — não precisa ser compartilhado entre siblings
  const [chromeVisible, setChromeVisible] = useState(false)
  const [tocOpen, setTocOpen] = useState(false)
  const [bookmarkSheetOpen, setBookmarkSheetOpen] = useState(false)
  const [translationOpen, setTranslationOpen] = useState(false)
  const [tappedText, setTappedText] = useState('')
  const [tappedSiblings, setTappedSiblings] = useState<Element[]>([])
  const [fontSize, setFontSize] = useState<FontSize>('md')
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Estado global compartilhado (Zustand)
  const { cfi, percentage, tocLabel, toc, setCfi, setToc, reset } = useReaderStore()

  // Progresso do IndexedDB (async)
  const { savedCfi, initialLoadDone, saveProgress } = useReaderProgress(book.id!)

  // Marcadores do livro atual — useLiveQuery: reativo, atualiza automaticamente
  const bookmarks = useLiveQuery(
    () => db.bookmarks.where('bookId').equals(book.id!).sortBy('createdAt'),
    [book.id],
  ) ?? []

  // true se a posição atual já tem marcador salvo
  const isBookmarked = bookmarks.some((b) => b.cfi === cfi)

  // Limpa o store ao desmontar para não vazar estado entre livros
  useEffect(() => { return () => reset() }, [reset])

  // Atualiza lastOpenedAt quando o leitor abre
  useEffect(() => {
    if (book.id !== undefined) updateLastOpened(book.id)
  }, [book.id])

  // Intercepta o botão Back físico do Android (via plugin Capacitor)
  useEffect(() => {
    const listenerPromise = CapApp.addListener('backButton', () => {
      if (translationOpen) { setTranslationOpen(false); return }
      if (bookmarkSheetOpen) { setBookmarkSheetOpen(false); return }
      if (tocOpen) { setTocOpen(false); return }
      handleBack()
    })
    return () => { void listenerPromise.then((l) => l.remove()) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tocOpen, bookmarkSheetOpen, translationOpen, cfi, percentage])

  const handleParagraphTap = useCallback(
    (text: string, siblings: Element[]) => {
      setTappedText(text)
      setTappedSiblings(siblings)
      setTranslationOpen(true)
      setChromeVisible(false)
    },
    [],
  )

  const handleRelocate = useCallback(
    (newCfi: string, newPercentage: number, newTocLabel: string | undefined) => {
      setCfi(newCfi, newPercentage, newTocLabel)
      saveProgress(newCfi, newPercentage)
    },
    [setCfi, saveProgress],
  )

  // Flush imediato ao sair — garante que a posição não seja perdida
  // se o usuário voltar antes do debounce de 1.5s disparar
  function handleBack() {
    if (cfi && book.id !== undefined) {
      void upsertProgress(book.id, cfi, percentage)
    }
    onBack()
  }

  // Toggle puro: adiciona se não existe, remove se já existe na posição atual.
  // A lista de marcadores é acessada pelo botão dedicado no bottom bar.
  function handleBookmarkToggle() {
    if (!cfi || book.id === undefined) return
    const existing = bookmarks.find((b) => b.cfi === cfi)
    if (existing?.id !== undefined) {
      void deleteBookmark(existing.id)
    } else {
      void addBookmark(book.id, cfi, tocLabel || `${percentage}%`, percentage)
    }
  }

  // Zonas de toque: left 20% = prev, right 20% = next, centro = toggle chrome
  function handleTapZone(e: React.PointerEvent<HTMLDivElement>) {
    const x = e.clientX / window.innerWidth
    if (x < 0.2) viewerRef.current?.prev()
    else if (x > 0.8) viewerRef.current?.next()
    else setChromeVisible((v) => !v)
  }

  // Aguarda o load do IndexedDB antes de montar o EpubViewer
  if (!initialLoadDone) return <ReaderSkeleton />

  return (
    <div className="fixed inset-0 bg-[#0a0a0a]">
      {isLoading && <ReaderSkeleton />}

      <div className="absolute inset-0">
        <EpubViewer
          ref={viewerRef}
          book={book}
          fontSize={fontSize}
          savedCfi={savedCfi}
          onRelocate={handleRelocate}
          onTocReady={setToc}
          onLoad={() => setIsLoading(false)}
          onError={(err) => { setIsLoading(false); setError(err.message) }}
          onParagraphTap={handleParagraphTap}
        />
      </div>

      <div className="absolute inset-0 z-10" onPointerUp={handleTapZone} />

      <ReaderChrome
        visible={chromeVisible}
        title={book.title}
        percentage={percentage}
        fontSize={fontSize}
        isBookmarked={isBookmarked}
        bookmarkCount={bookmarks.length}
        onBack={handleBack}
        onFontSizeChange={setFontSize}
        onBookmark={handleBookmarkToggle}
        onBookmarkList={() => setBookmarkSheetOpen(true)}
        onTocOpen={() => setTocOpen(true)}
      />

      <TocSheet
        open={tocOpen}
        toc={toc}
        onSelect={(href) => {
          viewerRef.current?.goTo(href)
          setTocOpen(false)
        }}
        onClose={() => setTocOpen(false)}
      />

      <BookmarkSheet
        open={bookmarkSheetOpen}
        bookmarks={bookmarks}
        onSelect={(bookmarkCfi) => {
          viewerRef.current?.goTo(bookmarkCfi)
          setBookmarkSheetOpen(false)
        }}
        onDelete={deleteBookmark}
        onClose={() => setBookmarkSheetOpen(false)}
      />

      <TranslationBubble
        open={translationOpen}
        sourceText={tappedText}
        siblingElements={tappedSiblings}
        bookId={book.id!}
        bookTitle={book.title}
        onClose={() => setTranslationOpen(false)}
      />

      {error && (
        <div className="absolute inset-0 z-40 bg-[#0a0a0a] flex flex-col items-center justify-center gap-4 px-8">
          <p className="text-red-400 text-sm text-center">{error}</p>
          <button onClick={handleBack} className="text-[#6366f1] text-sm underline">
            Voltar à biblioteca
          </button>
        </div>
      )}
    </div>
  )
}

function ReaderSkeleton() {
  return (
    <div className="fixed inset-0 bg-[#0a0a0a] flex items-center justify-center">
      <div className="w-8 h-8 border-2 border-[#6366f1] border-t-transparent rounded-full animate-spin" />
    </div>
  )
}
