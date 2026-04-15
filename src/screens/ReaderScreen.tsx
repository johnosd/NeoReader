import { useCallback, useEffect, useRef, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { App as CapApp } from '@capacitor/app'
import { EpubViewer, type EpubViewerHandle } from '../components/reader/EpubViewer'
import { ReaderChrome } from '../components/reader/ReaderChrome'
import { TocSheet } from '../components/reader/TocSheet'
import { BookmarkSheet } from '../components/reader/BookmarkSheet'
import { TranslationPanel } from '../components/reader/TranslationPanel'
import { useReaderProgress } from '../hooks/useReaderProgress'
import { useReaderStore } from '../store/readerStore'
import { upsertProgress } from '../db/progress'
import { updateLastOpened } from '../db/books'
import { addBookmark, deleteBookmark } from '../db/bookmarks'
import { addVocabItem } from '../db/vocabulary'
import { getSettings } from '../db/settings'
import { db } from '../db/database'
import { useTTS } from '../hooks/useTTS'
import { SpeechifyService } from '../services/SpeechifyService'
import { translate } from '../services/TranslationService'
import type { Book } from '../types/book'
import type { FontSize } from '../types/settings'

interface ReaderScreenProps {
  book: Book
  onBack: () => void
  onOpenVocabulary: () => void
}

export function ReaderScreen({ book, onBack, onOpenVocabulary }: ReaderScreenProps) {
  const viewerRef = useRef<EpubViewerHandle>(null)

  // Estado local — não precisa ser compartilhado entre siblings
  const [chromeVisible, setChromeVisible] = useState(false)
  const [tocOpen, setTocOpen] = useState(false)
  const [bookmarkSheetOpen, setBookmarkSheetOpen] = useState(false)
  const [fontSize, setFontSize] = useState<FontSize>('md')
  const [targetLang, setTargetLang] = useState('pt-BR')
  const [ttsEngine, setTtsEngine] = useState<'speechify' | 'native'>('native')
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Estado de tradução: null = painel fechado; source + result = painel aberto
  // result null = traduzindo ainda; result string = concluído
  const [translation, setTranslation] = useState<{ source: string; result: string | null } | null>(null)

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

  // Carrega preferências do usuário (fonte padrão, idioma de tradução, engine TTS)
  useEffect(() => {
    getSettings().then((s) => {
      setFontSize(s.defaultFontSize)
      setTargetLang(s.translationTargetLang)
      // Verifica se há key Speechify disponível (DB ou .env)
      void SpeechifyService.isConfigured().then((ok) =>
        setTtsEngine(ok ? 'speechify' : 'native')
      )
    })
  }, [])

  // Intercepta o botão Back físico do Android (via plugin Capacitor)
  useEffect(() => {
    const listenerPromise = CapApp.addListener('backButton', () => {
      if (bookmarkSheetOpen) { setBookmarkSheetOpen(false); return }
      if (tocOpen) { setTocOpen(false); return }
      handleBack()
    })
    return () => { void listenerPromise.then((l) => l.remove()) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tocOpen, bookmarkSheetOpen, cfi, percentage])

  // TTS: gerencia estado e sequenciamento de audiobook
  const tts = useTTS({
    onWordHighlight: (paraIdx, start, end) => {
      viewerRef.current?.highlightTts(paraIdx, start, end)
    },
    // Quando muda de parágrafo: destaca o parágrafo sem karaokê de palavra ainda
    onParagraphChange: (paraIdx) => {
      viewerRef.current?.highlightTts(paraIdx, 0, 0)
    },
    onStop: () => {
      viewerRef.current?.clearTts()
    },
  })

  function handleTtsToggle() {
    if (tts.isPlaying) {
      void tts.stop()
    } else {
      const paragraphs = viewerRef.current?.getParagraphs() ?? []
      void tts.play(paragraphs, 0)
    }
  }

  // Salva par original/tradução no vocabulário — chamado pelo EpubViewer via ⭐
  function handleSaveVocab(sourceText: string, translatedText: string) {
    void addVocabItem({
      bookId: book.id!,
      bookTitle: book.title,
      sourceText,
      translatedText,
      sourceLang: 'en',
      targetLang,
      createdAt: new Date(),
    })
  }

  // Recebe o texto da frase tocada do EpubViewer, abre o painel e dispara a tradução
  function handleTranslate(sourceText: string) {
    setTranslation({ source: sourceText, result: null })
    translate(sourceText, 'en', targetLang)
      .then((result) => setTranslation((prev) => prev ? { ...prev, result } : null))
      .catch(() => setTranslation((prev) => prev ? { ...prev, result: 'Erro ao traduzir.' } : null))
  }

  function handleTranslationClose() {
    setTranslation(null)
    viewerRef.current?.clearTranslation()
  }

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

  // Toggle chrome: chamado pelo EpubViewer quando o tap cai fora de um parágrafo
  function handleCenterTap() {
    setChromeVisible((v) => !v)
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
          onSaveVocab={handleSaveVocab}
          onCenterTap={handleCenterTap}
          onTranslate={handleTranslate}
          onSpeakOne={(text) => void tts.speakOne(text)}
          onParagraphTapForTts={(idx) => {
            const paragraphs = viewerRef.current?.getParagraphs() ?? []
            // Para o audiobook atual e recomeça a partir do parágrafo tocado
            void tts.stop().then(() => tts.play(paragraphs, idx))
          }}
          ttsIsPlaying={tts.isPlaying}
        />
      </div>

      {/* Bordas esquerda/direita: navegação entre páginas */}
      <div className="absolute left-0 top-0 w-[20%] h-full z-10" onPointerUp={() => viewerRef.current?.prev()} />
      <div className="absolute right-0 top-0 w-[20%] h-full z-10" onPointerUp={() => viewerRef.current?.next()} />

      {/* Faixas superior e inferior (centro 60%): toggle do chrome quando ele está fechado.
          Cobrem as margens de 48px do foliate — sempre vazias de texto. */}
      <div className="absolute top-0 left-[20%] right-[20%] h-12 z-10" onPointerUp={handleCenterTap} />
      <div className="absolute bottom-0 left-[20%] right-[20%] h-12 z-10" onPointerUp={handleCenterTap} />

      {/* Backdrop: quando o chrome está aberto, captura toque fora dos botões para fechá-lo.
          z-[15] fica acima do conteúdo/overlays (z-10) mas abaixo do chrome (z-20). */}
      {chromeVisible && (
        <div className="absolute inset-0 z-[15]" onPointerUp={() => setChromeVisible(false)} />
      )}

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
        onOpenVocabulary={onOpenVocabulary}
        ttsIsPlaying={tts.isPlaying}
        ttsEngine={ttsEngine}
        onTtsToggle={handleTtsToggle}
        onDismiss={() => setChromeVisible(false)}
      />

      {/* Painel de tradução — fora do iframe, sempre visível independente da paginação */}
      {translation && (
        <TranslationPanel
          source={translation.source}
          result={translation.result}
          onClose={handleTranslationClose}
          onSpeak={() => void tts.speakOne(translation.source)}
          onSave={() => {
            if (translation.result) handleSaveVocab(translation.source, translation.result)
          }}
        />
      )}

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
