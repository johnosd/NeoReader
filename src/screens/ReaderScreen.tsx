import { useCallback, useEffect, useRef, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { App as CapApp } from '@capacitor/app'
import {
  EpubViewer,
  type EpubViewerHandle,
  type ParagraphBookmarkPayload,
  type ReaderRelocatePayload,
  type VisibleReadingLocation,
} from '../components/reader/EpubViewer'
import { ReaderChrome } from '../components/reader/ReaderChrome'
import { TocDrawer } from '../components/reader/TocDrawer'
import { BookmarkSheet } from '../components/reader/BookmarkSheet'
import { useReaderProgress } from '../hooks/useReaderProgress'
import { useReaderStore } from '../store/readerStore'
import type { ProgressSavePayload } from '../db/progress'
import { updateLastOpened } from '../db/books'
import { addBookmark, restoreBookmark, softDeleteBookmark, updateBookmarkColor } from '../db/bookmarks'
import { addVocabItem } from '../db/vocabulary'
import { getSettings } from '../db/settings'
import { getBookSettings, updateBookSettings } from '../db/bookSettings'
import { db } from '../db/database'
import { useTTS } from '../hooks/useTTS'
import { TtsMiniPlayer, type TtsSleepTimerOption } from '../components/reader/TtsMiniPlayer'
import { translate } from '../services/TranslationService'
import { EpubService } from '../services/EpubService'
import type { Book } from '../types/book'
import type { FontSize, ReaderLineHeight, ReaderTheme } from '../types/settings'
import type { TtsPlaybackConfig, TtsProvider } from '../types/tts'
import { areCfisEquivalent, isCfiInLocation, normalizeCfi } from '../utils/cfi'
import { getReaderThemePalette } from '../utils/readerPreferences'
import { clampTtsRate, normalizeLanguageTag } from '../utils/language'

function normalizeReaderHref(href?: string | null) {
  if (!href) return null
  const [withoutHash] = href.split('#')
  const [withoutQuery] = withoutHash.split('?')
  return withoutQuery || null
}

function isReaderCfiTarget(target?: string | null) {
  return !!target && /^epubcfi\(/i.test(target.trim())
}

function isRelocateAtStartTarget(target: string, location: ReaderRelocatePayload) {
  if (isReaderCfiTarget(target)) {
    return (
      areCfisEquivalent(location.cfi, target) ||
      isCfiInLocation(target, location.cfi) ||
      isCfiInLocation(location.cfi, target)
    )
  }

  const normalizedExpectedHref = normalizeReaderHref(target)
  const normalizedSectionHref = normalizeReaderHref(location.sectionHref)
  return !!normalizedExpectedHref && !!normalizedSectionHref && normalizedSectionHref === normalizedExpectedHref
}

const TTS_SLEEP_TIMER_OPTIONS: TtsSleepTimerOption[] = [
  { value: 'off', label: 'Sem timer' },
  { value: '60', label: '1 min' },
  { value: '300', label: '5 min' },
  { value: '900', label: '15 min' },
  { value: '1800', label: '30 min' },
  { value: '3600', label: '1 h' },
]

function formatSleepTimerRemaining(seconds: number | null): string | null {
  if (seconds == null) return null
  const safeSeconds = Math.max(0, seconds)
  const minutes = Math.floor(safeSeconds / 60)
  const remainingSeconds = safeSeconds % 60
  return `${minutes}:${String(remainingSeconds).padStart(2, '0')}`
}

function getTtsProviderLabel(provider: TtsProvider) {
  if (provider === 'speechify') return 'Speechify'
  if (provider === 'elevenlabs') return 'ElevenLabs'
  return 'TTS nativo'
}

interface ReaderScreenProps {
  book: Book
  startHref?: string   // capítulo/CFI inicial — se definido, ignora o progresso salvo
  onBack: () => void
  onOpenVocabulary: () => void
}

export function ReaderScreen({ book, startHref, onBack, onOpenVocabulary }: ReaderScreenProps) {
  const viewerRef = useRef<EpubViewerHandle>(null)
  const pendingBookmarkKeysRef = useRef(new Set<string>())
  const activeSectionIndexRef = useRef<number | null>(null)
  const sectionChangeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const pendingStartHrefRef = useRef<string | null>(startHref ?? null)
  const initialStartNavigationTriggeredRef = useRef(false)
  const ttsAdvancePendingRef = useRef(false)
  const ttsAutoAdvanceSkipCountRef = useRef(0)
  const ttsSleepTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const ttsSleepIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const ttsSleepDeadlineRef = useRef<number | null>(null)
  const currentTtsParaIdxRef = useRef(0)

  // ── Estado local ────────────────────────────────────────────────────────────
  // Começa visível: dá orientação inicial ao usuário, depois some automaticamente (auto-hide).
  const [chromeVisible, setChromeVisible] = useState(true)
  const [ttsFinished, setTtsFinished] = useState(false)
  const [ttsFallbackNotice, setTtsFallbackNotice] = useState<{ provider: TtsProvider } | null>(null)
  const [ttsProviderFallback, setTtsProviderFallback] = useState<{ provider: TtsProvider } | null>(null)
  // Controla visibilidade do mini player — true do início até o usuário apertar ⏹
  const [ttsPlayerVisible, setTtsPlayerVisible] = useState(false)
  const [ttsSleepTimerValue, setTtsSleepTimerValue] = useState('off')
  const [ttsSleepRemainingSeconds, setTtsSleepRemainingSeconds] = useState<number | null>(null)
  const [showBackToTtsLocation, setShowBackToTtsLocation] = useState(false)
  const [tocOpen, setTocOpen] = useState(false)
  const [bookmarkSheetOpen, setBookmarkSheetOpen] = useState(false)
  const [fontSize, setFontSize] = useState<FontSize>('md')
  const [lineHeight, setLineHeight] = useState<ReaderLineHeight>('comfortable')
  const [readerTheme, setReaderTheme] = useState<ReaderTheme>('dark')
  const [bookLanguage, setBookLanguage] = useState('en')
  const [translationTargetLang, setTranslationTargetLang] = useState('pt-BR')
  const [ttsConfig, setTtsConfig] = useState<TtsPlaybackConfig>({
    provider: 'native',
    language: 'en',
    rate: 1,
  })
  const [ttsEngine, setTtsEngine] = useState<TtsProvider>('native')
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [sectionChangeLabel, setSectionChangeLabel] = useState<string | null>(null)
  const [currentSectionHref, setCurrentSectionHref] = useState<string | null>(null)

  // ── Auto-hide do chrome ──────────────────────────────────────────────────────
  // useRef para o timer: persiste entre renders sem causar re-render.
  const autoHideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Reinicia o countdown. Chamado na montagem e em cada interação com o chrome.
  // useCallback com [] → função estável, pode ser usada em deps de useEffect.
  const resetAutoHide = useCallback(() => {
    if (autoHideTimerRef.current) clearTimeout(autoHideTimerRef.current)
    autoHideTimerRef.current = setTimeout(() => setChromeVisible(false), 2500)
  }, [])

  const clearTtsSleepTimerHandles = useCallback(() => {
    if (ttsSleepTimeoutRef.current) {
      clearTimeout(ttsSleepTimeoutRef.current)
      ttsSleepTimeoutRef.current = null
    }
    if (ttsSleepIntervalRef.current) {
      clearInterval(ttsSleepIntervalRef.current)
      ttsSleepIntervalRef.current = null
    }
    ttsSleepDeadlineRef.current = null
  }, [])

  const resetTtsSleepTimer = useCallback(() => {
    clearTtsSleepTimerHandles()
    setTtsSleepTimerValue('off')
    setTtsSleepRemainingSeconds(null)
  }, [clearTtsSleepTimerHandles])

  // Inicia o timer assim que o leitor monta
  useEffect(() => {
    resetAutoHide()
    return () => {
      if (autoHideTimerRef.current) clearTimeout(autoHideTimerRef.current)
      if (sectionChangeTimerRef.current) clearTimeout(sectionChangeTimerRef.current)
      clearTtsSleepTimerHandles()
    }
  }, [clearTtsSleepTimerHandles, resetAutoHide])


  // Estado global compartilhado (Zustand)
  const { cfi, percentage, toc, tocLabel, setCfi, setToc, reset } = useReaderStore()

  // Progresso do IndexedDB (async)
  const { savedCfi, savedProgress, initialLoadDone, saveProgress, flushProgress } = useReaderProgress(book.id!)
  let currentTocHref = currentSectionHref
  if (!currentTocHref && startHref && !isReaderCfiTarget(startHref)) {
    currentTocHref = startHref
  }
  if (!currentTocHref && !startHref) {
    currentTocHref = savedProgress?.sectionHref ?? null
  }
  const currentTocLabel = tocLabel || (!startHref ? savedProgress?.sectionLabel : undefined)

  // Marcadores do livro atual — useLiveQuery: reativo, atualiza automaticamente
  const bookmarks = useLiveQuery(
    () => db.bookmarks.where('bookId').equals(book.id!).sortBy('createdAt'),
    [book.id],
  ) ?? []
  const activeBookmarks = bookmarks.filter((bookmark) => !bookmark.deletedAt)

  // Limpa o store ao desmontar para não vazar estado entre livros
  useEffect(() => { return () => reset() }, [reset])

  useEffect(() => {
    activeSectionIndexRef.current = null
    setSectionChangeLabel(null)
    setCurrentSectionHref(null)
    if (sectionChangeTimerRef.current) {
      clearTimeout(sectionChangeTimerRef.current)
      sectionChangeTimerRef.current = null
    }
    resetTtsSleepTimer()
  }, [book.id, resetTtsSleepTimer])

  useEffect(() => {
    pendingStartHrefRef.current = startHref ?? null
    initialStartNavigationTriggeredRef.current = false
  }, [book.id, startHref])

  // Atualiza lastOpenedAt quando o leitor abre
  useEffect(() => {
    if (book.id !== undefined) updateLastOpened(book.id)
  }, [book.id])

  function resolveBookLanguage(candidate?: string | null): string {
    return normalizeLanguageTag(candidate, 'en')
  }

  function resolveTtsProvider(selectedProvider: TtsProvider, settings: Awaited<ReturnType<typeof getSettings>>['appSettings']): TtsProvider {
    if (selectedProvider === 'speechify') {
      return settings.speechifyApiKey ? 'speechify' : 'native'
    }
    if (selectedProvider === 'elevenlabs') {
      return settings.elevenLabsApiKey ? 'elevenlabs' : 'native'
    }
    return 'native'
  }

  // Carrega preferências: fonte por livro (override) > fonte global > padrão
  useEffect(() => {
    void Promise.all([getSettings(), getBookSettings(book.id!), EpubService.parseExtras(book.fileBlob)]).then(([s, bs, extras]) => {
      const resolvedBookLanguage = resolveBookLanguage(bs.bookLanguage ?? extras.language)
      const selectedProvider = bs.ttsProvider ?? 'speechify'

      setFontSize(bs.fontSize ?? s.readerDefaults.defaultFontSize)
      setLineHeight(bs.lineHeight ?? s.readerDefaults.lineHeight)
      setReaderTheme(bs.readerTheme ?? s.readerDefaults.readerTheme)
      setBookLanguage(resolvedBookLanguage)
      setTranslationTargetLang(bs.translationTargetLang ?? s.appSettings.translationTargetLang)
      setTtsConfig({
        provider: selectedProvider,
        language: resolvedBookLanguage,
        rate: clampTtsRate(bs.ttsRate ?? 1),
        speechifyVoiceId: bs.ttsSpeechifyVoiceId,
        elevenLabsVoiceId: bs.ttsElevenLabsVoiceId,
        nativeVoiceKey: bs.ttsNativeVoiceKey,
      })
      setTtsEngine(resolveTtsProvider(selectedProvider, s.appSettings))
    })
  }, [book.id])

  // TTS: gerencia estado e sequenciamento de audiobook
  const tts = useTTS({
    provider: ttsConfig.provider,
    language: ttsConfig.language,
    rate: ttsConfig.rate,
    speechifyVoiceId: ttsConfig.speechifyVoiceId,
    elevenLabsVoiceId: ttsConfig.elevenLabsVoiceId,
    nativeVoiceKey: ttsConfig.nativeVoiceKey,
    onWordHighlight: (paraIdx, start, end) => {
      viewerRef.current?.highlightTts(paraIdx, start, end)
    },
    // Quando muda de parágrafo: destaca + rola para centralizar na tela
    onParagraphChange: (paraIdx) => {
      currentTtsParaIdxRef.current = paraIdx
      viewerRef.current?.highlightTts(paraIdx, 0, 0)
      viewerRef.current?.scrollToParagraph(paraIdx)
    },
    onProviderFallback: ({ provider }) => {
      setTtsFallbackNotice({ provider })
      setTtsProviderFallback({ provider })
    },
    onStop: () => {
      setShowBackToTtsLocation(false)
      viewerRef.current?.clearTts()
    },
    // Fim natural da seção (último parágrafo lido) — esconde player e mostra notificação
    onFinished: () => {
      advanceTtsToNextSection()
    },
  })

  // Helpers para obter chunks e iniciar play — reutilizados por toggle, prev, next
  function handleTtsSleepTimerChange(value: string) {
    const option = TTS_SLEEP_TIMER_OPTIONS.find((item) => item.value === value)
    const seconds = option && option.value !== 'off' ? Number(option.value) : null

    clearTtsSleepTimerHandles()

    if (!seconds || !Number.isFinite(seconds)) {
      setTtsSleepTimerValue('off')
      setTtsSleepRemainingSeconds(null)
      return
    }

    setTtsSleepTimerValue(value)
    setTtsSleepRemainingSeconds(seconds)
    ttsSleepDeadlineRef.current = Date.now() + seconds * 1000

    ttsSleepIntervalRef.current = setInterval(() => {
      if (!ttsSleepDeadlineRef.current) return
      const remaining = Math.max(0, Math.ceil((ttsSleepDeadlineRef.current - Date.now()) / 1000))
      setTtsSleepRemainingSeconds(remaining)
    }, 1000)

    ttsSleepTimeoutRef.current = setTimeout(() => {
      clearTtsSleepTimerHandles()
      setTtsSleepTimerValue('off')
      setTtsSleepRemainingSeconds(null)
      ttsAdvancePendingRef.current = false
      ttsAutoAdvanceSkipCountRef.current = 0
      void tts.stop()
      tts.resetPosition()
      setTtsPlayerVisible(false)
      setShowBackToTtsLocation(false)
      setTtsFallbackNotice(null)
      setTtsProviderFallback(null)
      setTtsFinished(false)
    }, seconds * 1000)
  }

  function getTtsChunks() {
    return viewerRef.current?.getSentenceChunks() ?? []
  }

  function startPlay(chunks: ReturnType<typeof getTtsChunks>, idx: number) {
    ttsAdvancePendingRef.current = false
    ttsAutoAdvanceSkipCountRef.current = 0
    setTtsFinished(false)
    setTtsFallbackNotice(null)
    setTtsProviderFallback(null)
    setTtsPlayerVisible(true)
    setShowBackToTtsLocation(false)
    viewerRef.current?.resetTtsScroll()
    void tts.play(chunks, idx)
  }

  function finishTtsAtBookEnd() {
    ttsAdvancePendingRef.current = false
    ttsAutoAdvanceSkipCountRef.current = 0
    resetTtsSleepTimer()
    tts.resetPosition()
    setTtsPlayerVisible(false)
    setShowBackToTtsLocation(false)
    setTtsFallbackNotice(null)
    setTtsProviderFallback(null)
    setTtsFinished(true)
  }

  function advanceTtsToNextSection() {
    const moved = viewerRef.current?.goToNextTtsSection() ?? false
    if (!moved) {
      finishTtsAtBookEnd()
      return
    }

    ttsAdvancePendingRef.current = true
    ttsAutoAdvanceSkipCountRef.current = 0
    setTtsFinished(false)
    setTtsPlayerVisible(true)
  }

  function handleTtsSectionReady() {
    if (!ttsAdvancePendingRef.current) return

    const chunks = getTtsChunks()
    if (chunks.length > 0) {
      startPlay(chunks, 0)
      return
    }

    if (ttsAutoAdvanceSkipCountRef.current >= 6) {
      finishTtsAtBookEnd()
      return
    }

    ttsAutoAdvanceSkipCountRef.current += 1
    const moved = viewerRef.current?.goToNextTtsSection() ?? false
    if (!moved) finishTtsAtBookEnd()
  }

  // Botão principal: inicia do ponto parado (resume) ou do primeiro parágrafo visível
  function handleTtsToggle() {
    if (tts.isPlaying) {
      void tts.pause()
    } else if (tts.isPaused) {
      void tts.resume().then((resumed) => {
        if (resumed) return
        const chunks = getTtsChunks()
        if (chunks.length === 0) return
        const startIdx = Math.min(tts.lastChunkIdx.current, Math.max(0, chunks.length - 1))
        startPlay(chunks, startIdx)
      })
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

  function handleTtsPrevSentence() {
    const chunks = getTtsChunks()
    if (chunks.length === 0) return

    const targetIdx = Math.max(0, tts.lastChunkIdx.current - 1)
    void tts.stop().then(() => startPlay(chunks, targetIdx))
  }

  function handleTtsNextSentence() {
    const chunks = getTtsChunks()
    if (chunks.length === 0) return

    const targetIdx = tts.lastChunkIdx.current + 1
    if (targetIdx >= chunks.length) {
      void tts.stop().then(() => {
        advanceTtsToNextSection()
      })
      return
    }

    void tts.stop().then(() => startPlay(chunks, targetIdx))
  }

  // ⏭ Avança para o início do próximo parágrafo
  function handleTtsNext() {
    const chunks = getTtsChunks()
    if (chunks.length === 0) return

    const currIdx = tts.lastChunkIdx.current
    const currParaIdx = chunks[currIdx]?.paraIdx ?? 0
    const nextIdx = chunks.findIndex((c, i) => i > currIdx && c.paraIdx > currParaIdx)

    if (nextIdx < 0) {
      void tts.stop().then(() => {
        advanceTtsToNextSection()
      })
      return
    }

    void tts.stop().then(() => startPlay(chunks, nextIdx))
  }

  // ⏹ Encerra TTS, esconde player e reseta posição (próximo play começa do visível)
  function handleTtsStop() {
    ttsAdvancePendingRef.current = false
    ttsAutoAdvanceSkipCountRef.current = 0
    resetTtsSleepTimer()
    void tts.stop()
    tts.resetPosition()
    setTtsPlayerVisible(false)
    setShowBackToTtsLocation(false)
    setTtsFallbackNotice(null)
    setTtsProviderFallback(null)
  }

  function handleBackToTtsLocation() {
    setShowBackToTtsLocation(false)
    viewerRef.current?.resetTtsScroll({ preservePlaybackSection: true })
    viewerRef.current?.scrollToParagraph(currentTtsParaIdxRef.current)
  }

  // Salva par original/tradução no vocabulário — chamado pelo EpubViewer via ⭐
  function handleSaveVocab(sourceText: string, translatedText: string) {
    void addVocabItem({
      bookId: book.id!,
      bookTitle: book.title,
      sourceText,
      translatedText,
      sourceLang: bookLanguage,
      targetLang: translationTargetLang,
      createdAt: new Date(),
    })
  }

  // Recebe o texto da frase tocada do EpubViewer, injeta bloco inline e dispara a tradução
  function handleTranslate(sourceText: string) {
    viewerRef.current?.showTranslationLoading()
    translate(sourceText, bookLanguage, translationTargetLang)
      .then((result) => viewerRef.current?.injectTranslation(result))
      .catch(() => viewerRef.current?.injectTranslation('Erro ao traduzir.'))
  }

  const handleRelocate = useCallback(
    (location: ReaderRelocatePayload) => {
      const { cfi: newCfi, percentage: newPercentage, tocLabel, sectionHref, fraction, sectionIndex } = location
      const pendingStartHref = pendingStartHrefRef.current
      if (pendingStartHref) {
        if (!initialStartNavigationTriggeredRef.current) return

        if (!isRelocateAtStartTarget(pendingStartHref, location)) return

        pendingStartHrefRef.current = null
      }

      const previousSectionIndex = activeSectionIndexRef.current
      if (
        previousSectionIndex !== null &&
        previousSectionIndex !== sectionIndex &&
        tocLabel?.trim()
      ) {
        setSectionChangeLabel(tocLabel.trim())
        if (sectionChangeTimerRef.current) clearTimeout(sectionChangeTimerRef.current)
        sectionChangeTimerRef.current = setTimeout(() => {
          setSectionChangeLabel(null)
          sectionChangeTimerRef.current = null
        }, 1200)
      }
      activeSectionIndexRef.current = sectionIndex
      setCurrentSectionHref(sectionHref ?? null)
      setCfi(newCfi, newPercentage, tocLabel)
      saveProgress({
        cfi: newCfi,
        percentage: newPercentage,
        fraction,
        sectionHref,
        sectionLabel: tocLabel,
      })
    },
    [setCfi, saveProgress],
  )

  const buildProgressPayload = useCallback(
    (location?: VisibleReadingLocation | null): ProgressSavePayload | undefined => {
      const progressCfi = location?.cfi ?? cfi
      if (!progressCfi) return undefined

      return {
        cfi: progressCfi,
        percentage: location?.percentage ?? percentage,
        fraction: location?.fraction,
        sectionHref: location?.sectionHref,
        sectionLabel: location?.tocLabel,
      }
    },
    [cfi, percentage],
  )

  const flushCurrentProgress = useCallback(
    (location?: VisibleReadingLocation | null) => {
      const resolvedLocation = location ?? viewerRef.current?.getVisibleLocation()
      const payload = resolvedLocation?.cfi ? buildProgressPayload(resolvedLocation) : undefined
      return flushProgress(payload)
    },
    [buildProgressPayload, flushProgress],
  )

  // Flush imediato ao sair — garante que a posição não seja perdida
  // se o usuário voltar antes do debounce disparar
  const handleBack = useCallback(() => {
    void flushCurrentProgress()
    onBack()
  }, [flushCurrentProgress, onBack])

  // Intercepta o botão Back físico do Android (via plugin Capacitor)
  useEffect(() => {
    const listenerPromise = CapApp.addListener('backButton', () => {
      if (bookmarkSheetOpen) { setBookmarkSheetOpen(false); return }
      if (tocOpen) { setTocOpen(false); return }
      handleBack()
    })
    return () => { void listenerPromise.then((l) => l.remove()) }
  }, [tocOpen, bookmarkSheetOpen, handleBack])

  useEffect(() => {
    const appStateListenerPromise = CapApp.addListener('appStateChange', ({ isActive }) => {
      if (!isActive) void flushCurrentProgress()
    })

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'hidden') void flushCurrentProgress()
    }

    const handlePageHide = () => {
      void flushCurrentProgress()
    }

    document.addEventListener('visibilitychange', handleVisibilityChange)
    window.addEventListener('pagehide', handlePageHide)

    return () => {
      void appStateListenerPromise.then((listener) => listener.remove())
      document.removeEventListener('visibilitychange', handleVisibilityChange)
      window.removeEventListener('pagehide', handlePageHide)
      void flushCurrentProgress()
    }
  }, [flushCurrentProgress])

  function toggleBookmarkAtLocation(target: {
    cfi: string
    label?: string
    percentage?: number
    snippet?: string
  }) {
    if (book.id === undefined) return

    const bookmarkCfi = normalizeCfi(target.cfi) ?? target.cfi
    const bookmarkPercentage = target.percentage ?? percentage
    const bookmarkLabel = target.label || `${bookmarkPercentage}%`
    const bookmarkSnippet = target.snippet?.trim() || undefined
    const pendingKey = normalizeCfi(bookmarkCfi) ?? bookmarkCfi

    if (pendingBookmarkKeysRef.current.has(pendingKey)) return

    const matchesTarget = (candidateCfi: string) => areCfisEquivalent(candidateCfi, bookmarkCfi)

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

  function handleParagraphBookmark(payload: ParagraphBookmarkPayload) {
    toggleBookmarkAtLocation(payload)
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

  const readerPalette = getReaderThemePalette(readerTheme)

  return (
    <div className="fixed inset-0" style={{ backgroundColor: readerPalette.background }}>
      {isLoading && <ReaderSkeleton />}

      <div className="absolute inset-0">
        <EpubViewer
          ref={viewerRef}
          book={book}
          bookmarks={activeBookmarks}
          fontSize={fontSize}
          lineHeight={lineHeight}
          readerTheme={readerTheme}
          savedCfi={startHref ? null : savedCfi}
          onRelocate={handleRelocate}
          onTocReady={setToc}
          onSectionReady={handleTtsSectionReady}
          onLoad={() => {
            setIsLoading(false)
            // Navega para o capítulo selecionado na tela de detalhes (se houver)
            if (startHref && !initialStartNavigationTriggeredRef.current) {
              initialStartNavigationTriggeredRef.current = true
              viewerRef.current?.goTo(startHref)
            } else {
              pendingStartHrefRef.current = null
            }
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
          onTtsUserScrollAway={() => setShowBackToTtsLocation(true)}
          ttsGlobalActive={ttsPlayerVisible}
          onBookmarkTap={(id) => { void softDeleteBookmark(id) }}
          onBookmarkParagraph={handleParagraphBookmark}
        />
      </div>

      {/* Nota: o toggle do chrome é tratado pelo handler de click do próprio iframe via a prop
          chromeVisible. Quando true, qualquer toque no iframe fecha o chrome. Isso é mais
          confiável que overlays/backdrop, pois evita o problema de compositing do Android WebView. */}

      <ReaderChrome
        visible={chromeVisible}
        title={book.title}
        percentage={percentage}
        fontSize={fontSize}
        bookmarkCount={activeBookmarks.length}
        onBack={handleBack}
        onFontSizeChange={(size) => {
          resetAutoHide()
          setFontSize(size)
          void updateBookSettings(book.id!, { fontSize: size })
        }}
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

      {/* Indicador discreto de troca de seção no modo corrido. */}
      {sectionChangeLabel && !ttsPlayerVisible && (
        <div className="pointer-events-none absolute left-1/2 top-4 z-20 -translate-x-1/2 px-4">
          <div className="rounded-full border border-white/10 bg-[rgba(15,7,24,0.82)] px-4 py-2 text-[12px] font-medium text-text-primary shadow-nav backdrop-blur-xl">
            {sectionChangeLabel}
          </div>
        </div>
      )}

      {/* Mini player TTS — visível enquanto TTS está ativo (tocando ou pausado) */}
      {ttsFallbackNotice && (
        <TtsFallbackToast
          provider={ttsFallbackNotice.provider}
          onDismiss={() => setTtsFallbackNotice(null)}
        />
      )}

      {ttsPlayerVisible && (
        <TtsMiniPlayer
          isPlaying={tts.isPlaying}
          activeProvider={ttsProviderFallback ? 'native' : ttsEngine}
          fallbackFromProvider={ttsProviderFallback?.provider ?? null}
          sleepTimerValue={ttsSleepTimerValue}
          sleepTimerOptions={TTS_SLEEP_TIMER_OPTIONS}
          sleepTimerRemainingLabel={formatSleepTimerRemaining(ttsSleepRemainingSeconds)}
          showBackToTtsLocation={showBackToTtsLocation}
          onPlayPause={handleTtsToggle}
          onBackToTtsLocation={handleBackToTtsLocation}
          onPrevParagraph={handleTtsPrev}
          onPrevSentence={handleTtsPrevSentence}
          onNextSentence={handleTtsNextSentence}
          onNextParagraph={handleTtsNext}
          onSleepTimerChange={handleTtsSleepTimerChange}
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
        currentHref={currentTocHref}
        currentLabel={currentTocLabel}
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

function TtsFallbackToast({
  provider,
  onDismiss,
}: {
  provider: TtsProvider
  onDismiss: () => void
}) {
  useEffect(() => {
    const t = setTimeout(onDismiss, 6500)
    return () => clearTimeout(t)
  }, [onDismiss])

  return (
    <div className="absolute left-4 right-4 top-4 z-30 rounded-[22px] border border-warning/30 bg-[rgba(15,7,24,0.9)] px-4 py-3 shadow-card backdrop-blur-xl">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-warning">
            TTS alternado
          </p>
          <p className="mt-1 text-sm text-text-secondary">
            {getTtsProviderLabel(provider)} está com problemas. Usando TTS nativo.
          </p>
        </div>
        <button
          type="button"
          onPointerUp={onDismiss}
          className="inline-flex h-9 shrink-0 items-center rounded-pill border border-white/8 bg-bg-surface-2/80 px-3 text-xs font-semibold text-text-primary transition-all duration-150 active:scale-[0.96] active:bg-white/10"
        >
          OK
        </button>
      </div>
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

function TtsFinishedToast({ onDismiss }: { onDismiss: () => void }) {
  useEffect(() => {
    const t = setTimeout(onDismiss, 5000)
    return () => clearTimeout(t)
  }, [onDismiss])

  return (
    <div className="absolute bottom-24 left-4 right-4 z-30 rounded-[24px] border border-white/10 bg-[rgba(15,7,24,0.88)] px-4 py-3 shadow-card backdrop-blur-xl">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-purple-light/80">
            TTS concluído
          </p>
          <p className="mt-1 text-sm text-text-secondary">
            Fim do capítulo
          </p>
        </div>
        <button
          onPointerUp={onDismiss}
          className="inline-flex h-10 shrink-0 items-center rounded-pill border border-white/8 bg-bg-surface-2/80 px-4 text-sm font-medium text-indigo-primary transition-all duration-150 active:scale-[0.96] active:bg-white/10"
        >
          OK
        </button>
      </div>
    </div>
  )
}


