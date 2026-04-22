import { useCallback, useEffect, useRef, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { App as CapApp } from '@capacitor/app'
import { EpubViewer, type EpubViewerHandle, type ParagraphBookmarkPayload } from '../components/reader/EpubViewer'
import { ReaderChrome } from '../components/reader/ReaderChrome'
import { TocDrawer } from '../components/reader/TocDrawer'
import { BookmarkSheet } from '../components/reader/BookmarkSheet'
import { useReaderProgress } from '../hooks/useReaderProgress'
import { useReaderStore } from '../store/readerStore'
import { upsertProgress } from '../db/progress'
import { updateLastOpened } from '../db/books'
import { addBookmark, restoreBookmark, softDeleteBookmark, updateBookmarkColor } from '../db/bookmarks'
import { addVocabItem } from '../db/vocabulary'
import { getSettings } from '../db/settings'
import { getBookSettings, updateBookSettings } from '../db/bookSettings'
import { db } from '../db/database'
import { useTTS } from '../hooks/useTTS'
import { TtsMiniPlayer } from '../components/reader/TtsMiniPlayer'
import { SpeechifyService } from '../services/SpeechifyService'
import { translate } from '../services/TranslationService'
import type { Book } from '../types/book'
import type { FontSize } from '../types/settings'
import { areCfisEquivalent, normalizeCfi, isCfiInLocation } from '../utils/cfi'

interface ReaderScreenProps {
  book: Book
  startHref?: string   // capítulo inicial — se definido, ignora o progresso salvo
  onBack: () => void
  onOpenVocabulary: () => void
}

export function ReaderScreen({ book, startHref, onBack, onOpenVocabulary }: ReaderScreenProps) {
  const viewerRef = useRef<EpubViewerHandle>(null)
  const pendingBookmarkKeysRef = useRef(new Set<string>())

  // ── Estado local ────────────────────────────────────────────────────────────
  // Começa visível: dá orientação inicial ao usuário, depois some automaticamente (auto-hide).
  const [chromeVisible, setChromeVisible] = useState(true)
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
  const [nextSectionLabel, setNextSectionLabel] = useState<string | null>(null)

  // ── Auto-hide do chrome ──────────────────────────────────────────────────────
  // useRef para o timer: persiste entre renders sem causar re-render.
  const autoHideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Reinicia o countdown. Chamado na montagem e em cada interação com o chrome.
  // useCallback com [] → função estável, pode ser usada em deps de useEffect.
  const resetAutoHide = useCallback(() => {
    if (autoHideTimerRef.current) clearTimeout(autoHideTimerRef.current)
    autoHideTimerRef.current = setTimeout(() => setChromeVisible(false), 2500)
  }, [])

  // Inicia o timer assim que o leitor monta
  useEffect(() => {
    resetAutoHide()
    return () => { if (autoHideTimerRef.current) clearTimeout(autoHideTimerRef.current) }
  }, [resetAutoHide])


  // Estado global compartilhado (Zustand)
  const { cfi, percentage, tocLabel, toc, setCfi, setToc, reset } = useReaderStore()

  // Progresso do IndexedDB (async)
  const { savedCfi, initialLoadDone, saveProgress } = useReaderProgress(book.id!)

  // Marcadores do livro atual — useLiveQuery: reativo, atualiza automaticamente
  const bookmarks = useLiveQuery(
    () => db.bookmarks.where('bookId').equals(book.id!).sortBy('createdAt'),
    [book.id],
  ) ?? []
  const activeBookmarks = bookmarks.filter((bookmark) => !bookmark.deletedAt)

  // O estado do botão reflete a localização atual do leitor, não a seção inteira.
  const isBookmarked = !!cfi && activeBookmarks.some((bookmark) => isCfiInLocation(bookmark.cfi, cfi))

  // Limpa o store ao desmontar para não vazar estado entre livros
  useEffect(() => { return () => reset() }, [reset])

  // Atualiza lastOpenedAt quando o leitor abre
  useEffect(() => {
    if (book.id !== undefined) updateLastOpened(book.id)
  }, [book.id])

  // Carrega preferências: fonte por livro (override) > fonte global > padrão
  useEffect(() => {
    void Promise.all([getSettings(), getBookSettings(book.id!)]).then(([s, bs]) => {
      setFontSize(bs.fontSize ?? s.defaultFontSize)
      setTargetLang(s.translationTargetLang)
      void SpeechifyService.isConfigured().then((ok) =>
        setTtsEngine(ok ? 'speechify' : 'native')
      )
    })
  }, [book.id])

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
  function handleAtBottom(atBottom: boolean, hasNext: boolean, nextLabel?: string) {
    setNextSectionLabel(hasNext ? (nextLabel?.trim() || null) : null)
    setChapterEndState(atBottom ? (hasNext ? 'atEnd' : 'noNext') : 'idle')
  }

  // Avança para o próximo capítulo — acionado pelo banner clicável.
  function handleChapterNext() {
    setNextSectionLabel(null)
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
    (newCfi: string, newPercentage: number, newTocLabel: string | undefined, _newSectionIndex: number) => {
      setCfi(newCfi, newPercentage, newTocLabel)
      saveProgress(newCfi, newPercentage)
    },
    [setCfi, saveProgress],
  )

  // Flush imediato ao sair — garante que a posição não seja perdida
  // se o usuário voltar antes do debounce de 1.5s disparar
  function handleBack() {
    const visibleLocation = viewerRef.current?.getVisibleLocation()
    const progressCfi = visibleLocation?.cfi ?? cfi
    const progressPercentage = visibleLocation?.percentage ?? percentage

    if (progressCfi && book.id !== undefined) {
      void upsertProgress(book.id, progressCfi, progressPercentage)
    }
    onBack()
  }

  function toggleBookmarkAtLocation(target: {
    cfi: string
    label?: string
    percentage?: number
    snippet?: string
    matchMode?: 'location' | 'exact'
  }) {
    if (book.id === undefined) return

    const matchMode = target.matchMode ?? 'location'
    const bookmarkCfi = matchMode === 'exact'
      ? (normalizeCfi(target.cfi) ?? target.cfi)
      : target.cfi
    const bookmarkPercentage = target.percentage ?? percentage
    const bookmarkLabel = target.label || `${bookmarkPercentage}%`
    const bookmarkSnippet = target.snippet?.trim() || undefined
    const pendingKey = normalizeCfi(bookmarkCfi) ?? bookmarkCfi

    if (pendingBookmarkKeysRef.current.has(pendingKey)) return

    const matchesTarget = (candidateCfi: string) =>
      matchMode === 'exact'
        ? areCfisEquivalent(candidateCfi, bookmarkCfi)
        : isCfiInLocation(candidateCfi, bookmarkCfi)

    const runBookmarkMutation = (task: Promise<unknown>) => {
      pendingBookmarkKeysRef.current.add(pendingKey)
      void task.finally(() => {
        pendingBookmarkKeysRef.current.delete(pendingKey)
      })
    }

    const matchingBookmarks = activeBookmarks.filter((bookmark) => matchesTarget(bookmark.cfi))
    if (matchingBookmarks.length > 0) {
      runBookmarkMutation(Promise.all(
        matchingBookmarks.map((bookmark) =>
          bookmark.id !== undefined ? softDeleteBookmark(bookmark.id) : Promise.resolve(),
        ),
      ))
      return
    }

    const exactDeletedBookmark = [...bookmarks]
      .reverse()
      .find((bookmark) => !!bookmark.deletedAt && areCfisEquivalent(bookmark.cfi, bookmarkCfi))

    if (exactDeletedBookmark?.id !== undefined) {
      runBookmarkMutation(restoreBookmark(exactDeletedBookmark.id, {
        label: bookmarkLabel,
        percentage: bookmarkPercentage,
        snippet: bookmarkSnippet || exactDeletedBookmark.snippet,
        color: exactDeletedBookmark.color ?? 'indigo',
      }))
      return
    }

    runBookmarkMutation(addBookmark(book.id, bookmarkCfi, bookmarkLabel, bookmarkPercentage, {
      snippet: bookmarkSnippet,
      color: 'indigo',
    }))
  }

  // Bookmark baseado em CFI: toggle real na localização atual.
  // O parágrafo visível é usado apenas para gerar contexto visual (snippet).
  function handleBookmarkToggle() {
    const visibleLocation = viewerRef.current?.getVisibleLocation()
    const bookmarkCfi = visibleLocation?.cfi ?? cfi
    if (!bookmarkCfi) return

    const paraIndex = viewerRef.current?.getFirstVisibleParagraphIndex() ?? 0
    const snippet = (viewerRef.current?.getParagraphs()[paraIndex] ?? '').slice(0, 150)
    toggleBookmarkAtLocation({
      cfi: bookmarkCfi,
      label: visibleLocation?.tocLabel ?? tocLabel,
      percentage: visibleLocation?.percentage ?? percentage,
      snippet,
    })
  }

  function handleParagraphBookmark(payload: ParagraphBookmarkPayload) {
    toggleBookmarkAtLocation({ ...payload, matchMode: 'exact' })
  }

  // Toggle chrome: chamado pelo EpubViewer em qualquer toque (chrome aberto fecha imediatamente)
  // ou quando tap cai fora de parágrafo (chrome fechado abre e inicia auto-hide)
  function handleCenterTap() {
    setChromeVisible((v) => {
      if (!v) resetAutoHide()  // ao abrir: inicia timer para fechar automaticamente
      return !v
    })
  }

  // Aguarda o load do IndexedDB antes de montar o EpubViewer
  if (!initialLoadDone) return <ReaderSkeleton />

  return (
    <div className="fixed inset-0 bg-bg-reader">
      {isLoading && <ReaderSkeleton />}

      <div className="absolute inset-0">
        <EpubViewer
          ref={viewerRef}
          book={book}
          bookmarks={activeBookmarks}
          fontSize={fontSize}
          savedCfi={savedCfi}
          onRelocate={handleRelocate}
          onTocReady={setToc}
          onLoad={() => {
            setIsLoading(false)
            // Navega para o capítulo selecionado na tela de detalhes (se houver)
            if (startHref) viewerRef.current?.goTo(startHref)
          }}
          onError={(err) => { setIsLoading(false); setError(err.message) }}
          onSaveVocab={handleSaveVocab}
          chromeVisible={chromeVisible}
          onCenterTap={handleCenterTap}
          onTranslate={handleTranslate}
          onSpeakOne={(text) => void tts.speakOne(text)}
          onParagraphTapForTts={(idx) => {
            const chunks = getTtsChunks()
            const chunkIdx = Math.max(0, chunks.findIndex(c => c.paraIdx >= idx))
            void tts.stop().then(() => startPlay(chunks, chunkIdx))
          }}
          ttsGlobalActive={ttsPlayerVisible}
          onAtBottom={handleAtBottom}
          onBookmarkTap={(id) => { void softDeleteBookmark(id) }}
          onBookmarkParagraph={handleParagraphBookmark}
        />
      </div>

      {/* Nota: o toggle do chrome é tratado pelo handler de click do próprio iframe via a prop
          chromeVisible. Quando true, qualquer toque no iframe fecha o chrome. Isso é mais
          confiável que overlays/backdrop, pois evita o problema de compositing do Android WebView. */}

      {/* Overlay de bookmark no canto superior direito — acesso rápido ao toggle sem abrir o chrome.
          Só renderizado quando o chrome está oculto para não conflitar com o botão da barra superior.
          z-[25]: acima do chrome (z-20), garante que o toque chegue aqui mesmo com itens sobrepostos. */}
      <ReaderChrome
        visible={chromeVisible}
        title={book.title}
        percentage={percentage}
        fontSize={fontSize}
        isBookmarked={isBookmarked}
        bookmarkCount={activeBookmarks.length}
        onBack={handleBack}
        onFontSizeChange={(size) => {
          resetAutoHide()
          setFontSize(size)
          void updateBookSettings(book.id!, { fontSize: size })
        }}
        onBookmark={handleBookmarkToggle}
        onBookmarkList={() => { resetAutoHide(); setBookmarkSheetOpen(true) }}
        onTocOpen={() => { resetAutoHide(); setTocOpen(true) }}
        onOpenVocabulary={() => { resetAutoHide(); onOpenVocabulary() }}
        ttsIsPlaying={tts.isPlaying}
        ttsEngine={ttsEngine}
        onTtsToggle={() => { resetAutoHide(); handleTtsToggle() }}
        onDismiss={() => setChromeVisible(false)}
      />

      {/* Faixa de progresso sempre visível — 2px na base da tela, fora do chrome.
          pointer-events-none: não bloqueia nenhum toque. z-[12]: abaixo do chrome (z-20). */}
      <div className="absolute bottom-0 left-0 right-0 z-[12] pointer-events-none" style={{ height: '2px' }}>
        <div
          className="h-full bg-indigo-primary/60 transition-all duration-500"
          style={{ width: `${percentage}%` }}
        />
      </div>

      {/* Banner de fim de capítulo — aparece quando usuário chega ao fundo da seção.
          Em scroll mode ele é o caminho principal para avançar de seção.
          Oculto durante TTS (que tem seu próprio controle de fim de capítulo). */}
      {chapterEndState !== 'idle' && !ttsPlayerVisible && (
        <ChapterEndBanner
          hasNext={chapterEndState === 'atEnd'}
          nextLabel={nextSectionLabel}
          onNext={chapterEndState === 'atEnd' ? handleChapterNext : undefined}
        />
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

      <TocDrawer
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
        bookmarks={activeBookmarks}
        onSelect={(bookmarkCfi) => {
          viewerRef.current?.goTo(bookmarkCfi)
          setBookmarkSheetOpen(false)
        }}
        onDelete={(id) => void softDeleteBookmark(id)}
        onColorChange={(id, color) => { void updateBookmarkColor(id, color) }}
        onClose={() => setBookmarkSheetOpen(false)}
      />

      {error && (
        <div className="absolute inset-0 z-40 bg-bg-reader flex flex-col items-center justify-center gap-4 px-8">
          <p className="text-error text-sm text-center">{error}</p>
          <button onClick={handleBack} className="text-indigo-primary text-sm underline">
            Voltar à biblioteca
          </button>
        </div>
      )}
    </div>
  )
}

function ReaderSkeleton() {
  return (
    <div className="fixed inset-0 bg-bg-reader flex items-center justify-center">
      <div className="w-8 h-8 border-2 border-indigo-primary border-t-transparent rounded-full animate-spin" />
    </div>
  )
}

// Banner fixo no fundo da tela quando o usuário chega ao final de uma seção.
// onNext definido → clicável para avançar o capítulo.
// hasNext=false → último capítulo, sem ação disponível.
function ChapterEndBanner({
  hasNext,
  nextLabel,
  onNext,
}: {
  hasNext: boolean
  nextLabel?: string | null
  onNext?: () => void
}) {
  return (
    <div
      className={`absolute bottom-0 left-0 right-0 z-20 flex flex-col items-center py-5
        ${onNext ? 'pointer-events-auto active:opacity-70' : 'pointer-events-none'}`}
      // Gradiente com CSS var: Tailwind v4 não gera utility para gradient-stop a 55% com token arbitrário
      style={{ background: 'linear-gradient(to top, var(--color-bg-reader) 55%, transparent)' }}
      onClick={onNext}
    >
      <p className="text-sm font-medium mb-1 text-text-primary">
        {hasNext ? 'Fim do capítulo' : 'Fim do livro'}
      </p>
      {hasNext && (
        <>
          {nextLabel && (
            <p className="text-[11px] uppercase tracking-[0.18em] text-text-muted/80 mb-1">
              Próxima seção
            </p>
          )}
          <p className="text-xs text-indigo-primary font-semibold">
            {nextLabel ? `Toque para continuar em ${nextLabel}` : 'Toque para o próximo capítulo'}
          </p>
        </>
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
    <div className="absolute bottom-24 left-4 right-4 z-30 flex items-center justify-between px-4 py-3 rounded-md bg-bg-elevated border border-indigo-primary/30">
      <span className="text-sm text-text-secondary">
        Fim do capítulo
      </span>
      <button
        onPointerUp={onDismiss}
        className="text-sm font-medium px-3 py-1 rounded-md text-indigo-primary active:opacity-60"
      >
        OK
      </button>
    </div>
  )
}


