import { useCallback, useEffect, useRef, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { App as CapApp } from '@capacitor/app'
import { EpubViewer, type EpubViewerHandle } from '../components/reader/EpubViewer'
import { ReaderChrome } from '../components/reader/ReaderChrome'
import { TocSheet } from '../components/reader/TocSheet'
import { BookmarkSheet } from '../components/reader/BookmarkSheet'
import { useReaderProgress } from '../hooks/useReaderProgress'
import { useReaderStore } from '../store/readerStore'
import { upsertProgress } from '../db/progress'
import { updateLastOpened } from '../db/books'
import { addBookmark, deleteBookmark } from '../db/bookmarks'
import { addVocabItem } from '../db/vocabulary'
import { getSettings } from '../db/settings'
import { db } from '../db/database'
import { useTTS } from '../hooks/useTTS'
import { TtsMiniPlayer } from '../components/reader/TtsMiniPlayer'
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
  const [ttsFinished, setTtsFinished] = useState(false)
  // Controla visibilidade do mini player — true do início até o usuário apertar ⏹
  const [ttsPlayerVisible, setTtsPlayerVisible] = useState(false)
  const [tocOpen, setTocOpen] = useState(false)
  const [bookmarkSheetOpen, setBookmarkSheetOpen] = useState(false)
  const [fontSize, setFontSize] = useState<FontSize>('md')
  const [targetLang, setTargetLang] = useState('pt-BR')
  const [ttsEngine, setTtsEngine] = useState<'speechify' | 'native'>('native')
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  // 'idle': sem banner | 'atEnd': fim do capítulo, há próximo | 'noNext': último capítulo
  const [chapterEndState, setChapterEndState] = useState<'idle' | 'atEnd' | 'noNext'>('idle')


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
    // Quando muda de parágrafo: destaca + rola para centralizar na tela
    onParagraphChange: (paraIdx) => {
      viewerRef.current?.highlightTts(paraIdx, 0, 0)
      viewerRef.current?.scrollToParagraph(paraIdx)
    },
    onStop: () => {
      viewerRef.current?.clearTts()
    },
    // Fim natural da seção (último parágrafo lido) — esconde player e mostra notificação
    onFinished: () => {
      setTtsPlayerVisible(false)
      setTtsFinished(true)
    },
  })

  // Helpers para obter chunks e iniciar play — reutilizados por toggle, prev, next
  function getTtsChunks() {
    return viewerRef.current?.getSentenceChunks() ?? []
  }

  function startPlay(chunks: ReturnType<typeof getTtsChunks>, idx: number) {
    setTtsFinished(false)
    setTtsPlayerVisible(true)
    viewerRef.current?.resetTtsScroll()
    void tts.play(chunks, idx)
  }

  // Botão principal: inicia do ponto parado (resume) ou do primeiro parágrafo visível
  function handleTtsToggle() {
    if (tts.isPlaying) {
      void tts.stop()  // pausa — mini player continua visível, lastChunkIdx preservado
    } else {
      const chunks = getTtsChunks()
      const lastIdx = tts.lastChunkIdx.current
      // Resume de onde parou se houver posição salva; caso contrário, primeiro visível
      const startIdx = lastIdx > 0 && lastIdx < chunks.length
        ? lastIdx
        : Math.max(0, chunks.findIndex(c => c.paraIdx >= (viewerRef.current?.getFirstVisibleParagraphIndex() ?? 0)))
      startPlay(chunks, startIdx)
    }
  }

  // ⏮ Volta ao início do parágrafo anterior (ou início do atual se já não for o primeiro chunk dele)
  function handleTtsPrev() {
    const chunks = getTtsChunks()
    const currIdx = tts.lastChunkIdx.current
    const currParaIdx = chunks[currIdx]?.paraIdx ?? 0
    const currParaStart = chunks.findIndex(c => c.paraIdx === currParaIdx)

    let targetIdx: number
    if (currIdx > currParaStart) {
      // No meio do parágrafo → volta para o início do mesmo
      targetIdx = currParaStart
    } else {
      // Já no início → vai para o início do parágrafo anterior
      targetIdx = currParaStart > 0
        ? chunks.findIndex(c => c.paraIdx === chunks[currParaStart - 1].paraIdx)
        : 0
    }
    void tts.stop().then(() => startPlay(chunks, targetIdx))
  }

  // ⏭ Avança para o início do próximo parágrafo
  function handleTtsNext() {
    const chunks = getTtsChunks()
    const currIdx = tts.lastChunkIdx.current
    const currParaIdx = chunks[currIdx]?.paraIdx ?? 0
    const nextIdx = chunks.findIndex((c, i) => i > currIdx && c.paraIdx > currParaIdx)
    void tts.stop().then(() => startPlay(chunks, nextIdx >= 0 ? nextIdx : chunks.length - 1))
  }

  // ⏹ Encerra TTS, esconde player e reseta posição (próximo play começa do visível)
  function handleTtsStop() {
    void tts.stop()
    tts.resetPosition()
    setTtsPlayerVisible(false)
  }

  // Atualiza banner de fim de capítulo conforme o usuário rola até o fundo ou sai dele
  function handleAtBottom(atBottom: boolean, hasNext: boolean) {
    setChapterEndState(atBottom ? (hasNext ? 'atEnd' : 'noNext') : 'idle')
  }

  // Segundo swipe no fundo: navega para o próximo capítulo
  function handleSwipeAtBottom() {
    if (chapterEndState !== 'atEnd') return
    setChapterEndState('idle')
    viewerRef.current?.next()
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

  // Recebe o texto da frase tocada do EpubViewer, injeta bloco inline e dispara a tradução
  function handleTranslate(sourceText: string) {
    viewerRef.current?.showTranslationLoading()
    translate(sourceText, 'en', targetLang)
      .then((result) => viewerRef.current?.injectTranslation(result))
      .catch(() => viewerRef.current?.injectTranslation('Erro ao traduzir.'))
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
            const chunks = getTtsChunks()
            const chunkIdx = Math.max(0, chunks.findIndex(c => c.paraIdx >= idx))
            void tts.stop().then(() => startPlay(chunks, chunkIdx))
          }}
          ttsIsPlaying={tts.isPlaying}
          ttsGlobalActive={ttsPlayerVisible}
          onAtBottom={handleAtBottom}
          onSwipeAtBottom={handleSwipeAtBottom}
        />
      </div>

      {/* Faixas superior e inferior: pointer-events none — apenas espaço visual das margens do foliate.
          O toggle do chrome é tratado pelo handler de click do próprio iframe (tap fora de parágrafo).
          Esses divs NÃO devem interceptar eventos: os botões do bloco de tradução ficam nessa zona
          e precisam receber os toques diretamente no iframe. */}
      <div className="absolute top-0 left-0 right-0 h-12 z-10 pointer-events-none" />
      <div className="absolute bottom-0 left-0 right-0 h-12 z-10 pointer-events-none" />

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

      {/* Banner de fim de capítulo — aparece quando usuário chega ao fundo da seção.
          Oculto durante TTS (que tem seu próprio controle de fim de capítulo). */}
      {chapterEndState !== 'idle' && !ttsPlayerVisible && (
        <ChapterEndBanner hasNext={chapterEndState === 'atEnd'} />
      )}

      {/* Mini player TTS — visível enquanto TTS está ativo (tocando ou pausado) */}
      {ttsPlayerVisible && (
        <TtsMiniPlayer
          isPlaying={tts.isPlaying}
          onPlayPause={handleTtsToggle}
          onPrev={handleTtsPrev}
          onNext={handleTtsNext}
          onStop={handleTtsStop}
        />
      )}

      {/* Notificação de fim de capítulo — aparece quando TTS termina naturalmente */}
      {ttsFinished && (
        <TtsFinishedToast onDismiss={() => setTtsFinished(false)} />
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

// Banner fixo no fundo da tela quando o usuário chega ao final de uma seção.
// hasNext=false → último capítulo, sem instrução de swipe.
// O gradiente suave evita corte abrupto do conteúdo.
function ChapterEndBanner({ hasNext }: { hasNext: boolean }) {
  return (
    <div
      className="absolute bottom-0 left-0 right-0 z-20 flex flex-col items-center py-5 pointer-events-none"
      style={{ background: 'linear-gradient(to top, #0f0f1a 55%, transparent)' }}
    >
      <p className="text-sm font-medium mb-1" style={{ color: '#e8e8e8' }}>
        {hasNext ? 'Fim do capítulo' : 'Fim do livro'}
      </p>
      {hasNext && (
        <p className="text-xs" style={{ color: '#6b6b7a' }}>
          Arraste para baixo para o próximo capítulo
        </p>
      )}
    </div>
  )
}

// Toast exibido quando o TTS termina de ler todos os parágrafos do capítulo atual.
// useEffect auto-dismiss: desaparece após 5s sem ação do usuário.
function TtsFinishedToast({ onDismiss }: { onDismiss: () => void }) {
  useEffect(() => {
    const t = setTimeout(onDismiss, 5000)
    return () => clearTimeout(t)
  }, [onDismiss])

  return (
    <div
      className="absolute bottom-24 left-4 right-4 z-30 flex items-center justify-between px-4 py-3 rounded-xl"
      style={{ background: '#1a1a2e', border: '1px solid rgba(99,102,241,0.3)' }}
    >
      <span className="text-sm" style={{ color: '#a5a5a5' }}>
        Fim do capítulo
      </span>
      <button
        onPointerUp={onDismiss}
        className="text-sm font-medium px-3 py-1 rounded-lg"
        style={{ color: '#6366f1' }}
      >
        OK
      </button>
    </div>
  )
}
