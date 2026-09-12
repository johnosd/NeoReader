import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { Volume2 } from 'lucide-react'
import {
  EpubViewer,
  type EpubViewerHandle,
  type HighlightDraftPayload,
  type ParagraphBookmarkPayload,
  type ReaderImageOpenPayload,
  type ReaderRelocatePayload,
  type VisibleReadingLocation,
  type WordLensDefinitionTarget,
} from '../components/reader/EpubViewer'
import { ReaderChrome } from '../components/reader/ReaderChrome'
import { TocDrawer } from '../components/reader/TocDrawer'
import { BookmarkSheet } from '../components/reader/BookmarkSheet'
import { HighlightComposerSheet } from '../components/reader/HighlightComposerSheet'
import { ImageZoomModal } from '../components/reader/ImageZoomModal'
import { BottomSheet, Toast } from '../components/ui'
import { IntegrationHelpBanner } from '../components/IntegrationHelpBanner'
import { useReaderProgress } from '../hooks/useReaderProgress'
import { useReaderStore } from '../store/readerStore'
import { useReaderAppearance } from '../hooks/useReaderAppearance'
import { useCapacitorAppStateChange, useCapacitorBackButton } from '../hooks/useCapacitorAppListener'
import { useSyncRef } from '../hooks/useSyncRef'
import { useChromeAutoHide } from '../hooks/useChromeAutoHide'
import type { ProgressSavePayload } from '../db/progress'
import { deleteBook, updateLastOpened } from '../db/books'
import { getBookCover } from '../db/bookCovers'
import { addBookmark, restoreBookmark, softDeleteBookmark, updateBookmarkColor } from '../db/bookmarks'
import { addVocabItem, getVocabSourceTextsByBookId } from '../db/vocabulary'
import { addHighlight, deleteHighlight, getHighlightsByBookId, updateHighlightAppearance, updateHighlightNote } from '../db/highlights'
import { getSettings, updateReaderDefaults } from '../db/settings'
import { db } from '../db/database'
import { useTTS } from '../hooks/useTTS'
import { TtsMiniPlayer } from '../components/reader/TtsMiniPlayer'
import {
  READER_PROGRESS_FOOTER_HEIGHT_PX,
  ReaderProgressFooter,
} from '../components/reader/ReaderProgressFooter'
import { getTtsProviderLabel, isPremiumTtsProvider } from '../services/TtsProviderRegistry'
import {
  ReaderFontControl,
  ReaderFontSizeControl,
  ReaderLineHeightControl,
  ReaderModeControl,
  ReaderThemeControl,
} from '../components/reader/ReaderAppearanceControls'
import { Switch } from '../components/ui'
import { translate } from '../services/TranslationService'
import { scheduleBookmarkDriveSync } from '../services/BookmarkDriveSyncService'
import { getCachedBookmarkDriveSyncStatus } from '../services/BookmarkDriveSyncStatus'
import { createFlowId, getDiagnosticsNowMs, logError, logEvent } from '../services/DiagnosticsLogger'
import { setReaderImmersiveMode, setSelectionMenuSuppressed } from '../services/NativeSystemUiService'
import { TtsPlaybackSessionService, type TtsPlaybackControlEvent, type TtsAudioFocusEvent } from '../services/TtsPlaybackSessionService'
import type { Book } from '../types/book'
// Import explícito e obrigatório: sem ele, `Highlight` resolve silenciosamente
// para o tipo global do DOM (CSS Custom Highlight API) e o erro só aparece no
// uso dos campos.
import type { Highlight, HighlightStyle } from '../types/highlight'
import type { TtsProvider } from '../types/tts'
import { areCfisEquivalent, isCfiInLocation, normalizeCfi } from '../utils/cfi'
import { areTocHrefDocumentSuffixesEqual, findTopLevelTocLabel } from '../utils/toc'
import { getReaderThemePalette } from '../utils/readerPreferences'
import { clampTtsRate } from '../utils/language'
import { useI18n } from '../i18n'
import { loadWordLensData, loadWordLensDefinition } from '../services/WordLensDataService'
import type { WordLensData } from '../types/wordLens'

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
  return Boolean(
    normalizedExpectedHref &&
    normalizedSectionHref &&
    (
      normalizedSectionHref === normalizedExpectedHref ||
      areTocHrefDocumentSuffixesEqual(normalizedSectionHref, normalizedExpectedHref)
    ),
  )
}

function isSectionHrefAtStartTarget(target: string, sectionHref?: string | null) {
  if (isReaderCfiTarget(target)) return false

  const normalizedExpectedHref = normalizeReaderHref(target)
  const normalizedSectionHref = normalizeReaderHref(sectionHref)
  return Boolean(
    normalizedExpectedHref &&
    normalizedSectionHref &&
    (
      normalizedSectionHref === normalizedExpectedHref ||
      areTocHrefDocumentSuffixesEqual(normalizedSectionHref, normalizedExpectedHref)
    ),
  )
}

// Converte a capa (Blob) pra base64 sem prefixo data: — formato esperado
// pelo TtsPlaybackSessionService.updateMetadata (decodificado no lado nativo).
function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      const result = String(reader.result)
      resolve(result.slice(result.indexOf(',') + 1))
    }
    reader.onerror = () => reject(reader.error)
    reader.readAsDataURL(blob)
  })
}

const START_NAVIGATION_FALLBACK_MS = 4000

interface ReaderScreenProps {
  book: Book
  startHref?: string   // capítulo/CFI inicial — se definido, ignora o progresso salvo
  readerOpenFlowId?: string
  readerOpenStartedAt?: number
  onBack: () => void
  onOpenVocabulary: () => void
  onOpenSettings?: () => void
  // Chamado (em vez de tentar sincronizar) quando há bookmark pendente e o
  // Drive está com token expirado — só Configuracoes/o icone de sync podem
  // abrir a tela de login do Google (ver handleBack), então aqui só avisamos.
  onBookmarkSyncBlocked?: (message: string) => void
}

export function ReaderScreen({
  book,
  startHref,
  readerOpenFlowId,
  readerOpenStartedAt,
  onBack,
  onOpenVocabulary,
  onOpenSettings = () => undefined,
  onBookmarkSyncBlocked = () => undefined,
}: ReaderScreenProps) {
  const { t } = useI18n()
  const viewerRef = useRef<EpubViewerHandle>(null)
  const pendingBookmarkKeysRef = useRef(new Set<string>())
  // Cancela a tradução anterior quando uma nova é disparada antes da
  // resposta voltar (troca de trecho) — FR-007, sem equivalente direto em
  // Python: AbortController é a forma nativa do browser de "matar" um
  // fetch em andamento.
  const translationAbortControllerRef = useRef<AbortController | null>(null)
  const activeSectionIndexRef = useRef<number | null>(null)
  const sectionChangeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const pendingStartHrefRef = useRef<string | null>(startHref ?? null)
  const initialStartNavigationTriggeredRef = useRef(false)
  const startNavigationFallbackTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const ttsAdvancePendingRef = useRef(false)
  const ttsAutoAdvanceSkipCountRef = useRef(0)
  const currentTtsParaIdxRef = useRef(0)
  const pendingTtsConfigRestartRef = useRef<number | null>(null)
  const ttsFallbackNoticeShownRef = useRef(new Set<TtsProvider>())
  // Cache da capa em base64 pro Service nativo — busca só uma vez por livro
  // (undefined = ainda não buscou, '' = buscou e não achou capa).
  const bookCoverBase64Ref = useRef<string | undefined>(undefined)
  const lastNotifiedChapterLabelRef = useRef<string | undefined>(undefined)

  // ── Estado local ────────────────────────────────────────────────────────────
  const { chromeVisible, setChromeVisible, scheduleInitialAutoHide, handleCenterTap } = useChromeAutoHide()
  const [ttsFinished, setTtsFinished] = useState(false)
  const [ttsFallbackNotice, setTtsFallbackNotice] = useState<{ provider: TtsProvider; reason: string } | null>(null)
  const [ttsProviderFallback, setTtsProviderFallback] = useState<{ provider: TtsProvider } | null>(null)
  // Controla visibilidade do mini player — true do início até o usuário apertar ⏹
  const [ttsPlayerVisible, setTtsPlayerVisible] = useState(false)
  const [showBackToTtsLocation, setShowBackToTtsLocation] = useState(false)
  const [tocOpen, setTocOpen] = useState(false)
  const [bookmarkSheetOpen, setBookmarkSheetOpen] = useState(false)
  // Caixa unificada de cor/estilo/nota (feature 016) — null = fechada.
  // 'create': ainda sem highlight, só o draft da seleção (cor/estilo vêm do
  // último usado). 'edit': highlight já existe, pré-preenche com os valores
  // atuais. Substitui highlightNoteTarget (013)/onChangeHighlightAppearance (010).
  const [highlightComposer, setHighlightComposer] = useState<
    { type: 'create'; draft: HighlightDraftPayload } | { type: 'edit'; highlight: Highlight } | null
  >(null)
  // Último highlight criado (qualquer livro) — pré-seleciona a caixa unificada
  // na próxima criação (FR-002). Carregado uma vez ao montar (efeito abaixo).
  const [lastHighlightColor, setLastHighlightColor] = useState('indigo')
  const [lastHighlightStyle, setLastHighlightStyle] = useState<HighlightStyle>('background')
  // Highlight recem-criado aguardando o toque no toast de atalho (feature 015) —
  // null = nenhum toast visivel. Sempre SUBSTITUIDO por uma nova criacao (nunca
  // dois toasts ao mesmo tempo, FR-005); só aparece se a caixa unificada foi
  // confirmada SEM nota (feature 016, FR-006) e limpo ao abrir a caixa por
  // qualquer via.
  const [highlightAnnotateToast, setHighlightAnnotateToast] = useState<Highlight | null>(null)
  const [appearanceSheetOpen, setAppearanceSheetOpen] = useState(false)
  const [readerImagePreview, setReaderImagePreview] = useState<ReaderImageOpenPayload | null>(null)
  const [focusLineEnabled, setFocusLineEnabled] = useState(() => localStorage.getItem('neoreader:focus-line') === '1')
  const [removingMissingBook, setRemovingMissingBook] = useState(false)
  const [missingBookRemovalError, setMissingBookRemovalError] = useState<string | null>(null)
  const [detectedMissingFile, setDetectedMissingFile] = useState(false)
  const [wordLensInteractiveBookId, setWordLensInteractiveBookId] = useState<Book['id'] | null>(null)
  const [wordLensRuntime, setWordLensRuntime] = useState<{ bookId: Book['id']; data: WordLensData | null } | null>(null)
  const {
    isReady: readerAppearanceReady,
    fontSize,
    lineHeight,
    readerTheme,
    fontFamily,
    overrideBookFont,
    overrideBookColors,
    wordLensEnabled,
    wordLensLevel,
    bookLanguage,
    translationTargetLang,
    ttsConfig,
    ttsEngine,
    ttsProviderAvailability,
    translationProvider,
    applyAppearancePatch,
    applyTtsConfigPatch,
    switchToNativeTts,
    handleReaderStyleModeChange,
  } = useReaderAppearance(book)
  const loadingStateKey = `${book.id ?? 'unknown'}::${startHref ?? ''}`
  const [loadingState, setLoadingState] = useState({ key: loadingStateKey, isLoading: true })
  const isLoading = loadingState.key === loadingStateKey ? loadingState.isLoading : true
  const readerOpenFlowRef = useRef<{
    key: string
    flowId: string
    startedAt: number
    completed: boolean
  } | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [sectionNavigationState, setSectionNavigationState] = useState<{
    bookId: Book['id']
    sectionChangeLabel: string | null
    currentSectionHref: string | null
  }>({ bookId: book.id, sectionChangeLabel: null, currentSectionHref: null })
  const sectionChangeLabel = sectionNavigationState.bookId === book.id
    ? sectionNavigationState.sectionChangeLabel
    : null
  const currentSectionHref = sectionNavigationState.bookId === book.id
    ? sectionNavigationState.currentSectionHref
    : null
  const selectedPremiumTtsMissingKey = isPremiumTtsProvider(ttsConfig.provider) && !ttsProviderAvailability[ttsConfig.provider]
  const isWordLensInteractive = wordLensInteractiveBookId === book.id
  const wordLensData = wordLensRuntime && wordLensRuntime.bookId === book.id ? wordLensRuntime.data : null

  useEffect(() => {
    if (!readerAppearanceReady || !isWordLensInteractive) return
    let cancelled = false
    void loadWordLensData({
      enabled: wordLensEnabled,
      language: bookLanguage,
      userLevel: wordLensLevel,
    }).then((data) => {
      if (!cancelled) setWordLensRuntime({ bookId: book.id, data })
    })
    return () => {
      cancelled = true
    }
  }, [book.id, bookLanguage, isWordLensInteractive, readerAppearanceReady, wordLensEnabled, wordLensLevel])

  useEffect(() => {
    const flowId = readerOpenFlowId ?? createFlowId('reader-open')
    readerOpenFlowRef.current = {
      key: loadingStateKey,
      flowId,
      startedAt: readerOpenStartedAt ?? getDiagnosticsNowMs(),
      completed: false,
    }

    if (!readerOpenFlowId) {
      logEvent('reader.open.start', {
        flowId,
        screen: 'reader',
        status: 'start',
        details: {
          bookId: book.id,
          storageMode: book.storageMode,
          hasStartHref: Boolean(startHref),
          targetType: startHref?.startsWith('epubcfi(') ? 'cfi' : startHref ? 'href' : 'saved-progress',
        },
      })
    }
  }, [book.id, book.storageMode, loadingStateKey, readerOpenFlowId, readerOpenStartedAt, startHref])

  const finishReaderOpen = useCallback((status: 'success' | 'failure', openError?: Error) => {
    const flow = readerOpenFlowRef.current
    if (!flow || flow.key !== loadingStateKey || flow.completed) return

    flow.completed = true
    const fields = {
      flowId: flow.flowId,
      screen: 'reader',
      status,
      durationMs: getDiagnosticsNowMs() - flow.startedAt,
      details: {
        bookId: book.id,
        storageMode: book.storageMode,
        hasStartHref: Boolean(startHref),
        targetType: startHref?.startsWith('epubcfi(') ? 'cfi' : startHref ? 'href' : 'saved-progress',
      },
    }

    if (status === 'failure') {
      logError('reader.open.failure', openError ?? new Error('Reader open failed'), fields)
    } else {
      logEvent('reader.open.success', fields)
    }
  }, [book.id, book.storageMode, loadingStateKey, startHref])

  const setCurrentLoading = useCallback((nextIsLoading: boolean) => {
    setLoadingState({ key: loadingStateKey, isLoading: nextIsLoading })
  }, [loadingStateKey])

  const setSectionChangeLabelForCurrentBook = useCallback((label: string | null) => {
    setSectionNavigationState((previous) => ({
      bookId: book.id,
      sectionChangeLabel: label,
      currentSectionHref: previous.bookId === book.id ? previous.currentSectionHref : null,
    }))
  }, [book.id])

  const setCurrentSectionHrefForCurrentBook = useCallback((href: string | null) => {
    setSectionNavigationState((previous) => ({
      bookId: book.id,
      sectionChangeLabel: previous.bookId === book.id ? previous.sectionChangeLabel : null,
      currentSectionHref: href,
    }))
  }, [book.id])

  const clearStartNavigationFallbackTimer = useCallback(() => {
    if (startNavigationFallbackTimerRef.current) {
      clearTimeout(startNavigationFallbackTimerRef.current)
      startNavigationFallbackTimerRef.current = null
    }
  }, [])

  const releaseInitialLoading = useCallback(() => {
    clearStartNavigationFallbackTimer()
    setCurrentLoading(false)
  }, [clearStartNavigationFallbackTimer, setCurrentLoading])

  const hideInitialLoading = useCallback(() => {
    setCurrentLoading(false)
  }, [setCurrentLoading])

  const completeInitialStartNavigation = useCallback(() => {
    pendingStartHrefRef.current = null
    releaseInitialLoading()
  }, [releaseInitialLoading])

  const scheduleStartNavigationFallback = useCallback(() => {
    clearStartNavigationFallbackTimer()
    startNavigationFallbackTimerRef.current = setTimeout(() => {
      pendingStartHrefRef.current = null
      setCurrentLoading(false)
    }, START_NAVIGATION_FALLBACK_MS)
  }, [clearStartNavigationFallbackTimer, setCurrentLoading])

  // Agenda o auto-hide inicial assim que o leitor monta (some sozinho uma
  // única vez, só pra sinalizar que existe um chrome ali — reaberturas
  // manuais depois disso não reagendam hide nenhum).
  // A supressão do menu de seleção do sistema (FR-010) vive NESTE mesmo efeito
  // de propósito: o flag é global à Activity, e ligá-lo/desligá-lo junto do
  // modo imersivo é o que impede o estado de divergir e vazar para telas onde
  // o menu do sistema é legítimo, como a busca da biblioteca (R-003).
  useEffect(() => {
    scheduleInitialAutoHide()
    void setReaderImmersiveMode(true)
    void setSelectionMenuSuppressed(true)
    return () => {
      void setReaderImmersiveMode(false)
      void setSelectionMenuSuppressed(false)
      if (sectionChangeTimerRef.current) clearTimeout(sectionChangeTimerRef.current)
      clearStartNavigationFallbackTimer()
      // auto-hide e sleep timer cleanup são responsabilidade dos hooks respectivos
    }
  }, [clearStartNavigationFallbackTimer, scheduleInitialAutoHide])


  // Estado global compartilhado (Zustand)
  const { cfi, percentage, chapterPercentage, toc, tocLabel, setCfi, setToc, reset } = useReaderStore()

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
  const footerTocLabel = findTopLevelTocLabel(toc, currentTocHref, currentTocLabel) ?? currentTocLabel
  // Ref sincronizado por efeito pra callbacks do useTTS (onParagraphChange)
  // sempre lerem o capítulo atual, sem depender de closure potencialmente stale.
  const footerTocLabelRef = useRef(footerTocLabel)
  useEffect(() => {
    footerTocLabelRef.current = footerTocLabel
  }, [footerTocLabel])

  // Marcadores do livro atual — useLiveQuery: reativo, atualiza automaticamente.
  // O fallback `?? []` fica num useMemo próprio pra não criar um array novo a
  // cada render (isso quebraria a estabilidade de deps de handleBack, que usa
  // `bookmarks` pra decidir se sincroniza pendências ao fechar o livro).
  const bookmarksResult = useLiveQuery(
    () => db.bookmarks.where('bookId').equals(book.id!).sortBy('createdAt'),
    [book.id],
  )
  const bookmarks = useMemo(() => bookmarksResult ?? [], [bookmarksResult])
  const activeBookmarks = bookmarks.filter((bookmark) => !bookmark.deletedAt)

  // Vocabulário salvo: frases originais para highlight passivo no texto
  const vocabWords = useLiveQuery(
    () => book.id ? getVocabSourceTextsByBookId(book.id) : Promise.resolve([]),
    [book.id],
  ) ?? []

  // Highlights do livro atual (feature 010) — locais, sem sync no Drive
  // (diferente de bookmarks acima). useLiveQuery reage sozinho a addHighlight.
  const highlights = useLiveQuery(
    () => book.id ? getHighlightsByBookId(book.id) : Promise.resolve([]),
    [book.id],
  ) ?? []

  // Limpa o store ao desmontar para não vazar estado entre livros
  useEffect(() => { return () => reset() }, [reset])

  // Último highlight usado (feature 016, FR-002) — carregado uma vez, global
  // entre livros (não é preferência por-livro, ao contrário de fontSize/tema).
  useEffect(() => {
    let cancelled = false
    void getSettings().then((s) => {
      if (cancelled) return
      setLastHighlightColor(s.readerDefaults.lastHighlightColor)
      setLastHighlightStyle(s.readerDefaults.lastHighlightStyle)
    })
    return () => { cancelled = true }
  }, [])

  useEffect(() => {
    activeSectionIndexRef.current = null
    ttsFallbackNoticeShownRef.current.clear()
    if (sectionChangeTimerRef.current) {
      clearTimeout(sectionChangeTimerRef.current)
      sectionChangeTimerRef.current = null
    }
  }, [book.id])

  useEffect(() => {
    clearStartNavigationFallbackTimer()
    pendingStartHrefRef.current = startHref ?? null
    initialStartNavigationTriggeredRef.current = false
  }, [book.id, clearStartNavigationFallbackTimer, startHref])

  // Atualiza lastOpenedAt quando o leitor abre
  useEffect(() => {
    if (book.id !== undefined && !book.missingFile) updateLastOpened(book.id)
  }, [book.id, book.missingFile])


  // TTS: gerencia estado e sequenciamento de audiobook
  const tts = useTTS({
    bookId: book.id,
    bookTitle: book.title,
    provider: ttsConfig.provider,
    language: ttsConfig.language,
    rate: ttsConfig.rate,
    speechifyVoiceId: ttsConfig.speechifyVoiceId,
    elevenLabsVoiceId: ttsConfig.elevenLabsVoiceId,
    nativeVoiceKey: ttsConfig.nativeVoiceKey,
    voiceSelections: ttsConfig.voiceSelections,
    onWordHighlight: (paraIdx, start, end) => {
      viewerRef.current?.highlightTts(paraIdx, start, end)
    },
    // Quando muda de parágrafo: destaca + rola para centralizar na tela
    onParagraphChange: (paraIdx) => {
      currentTtsParaIdxRef.current = paraIdx
      viewerRef.current?.highlightTts(paraIdx, 0, 0)
      viewerRef.current?.scrollToParagraph(paraIdx)

      // Só atualiza a notificação quando o capítulo muda de fato — evitar
      // chamar o nativo a cada parágrafo (a maioria não muda de capítulo).
      const chapterLabel = footerTocLabelRef.current
      if (chapterLabel && chapterLabel !== lastNotifiedChapterLabelRef.current) {
        lastNotifiedChapterLabelRef.current = chapterLabel
        void syncTtsPlaybackMetadata(chapterLabel)
      }
    },
    onProviderFallback: ({ provider, reason, transient }) => {
      if (!ttsFallbackNoticeShownRef.current.has(provider)) {
        ttsFallbackNoticeShownRef.current.add(provider)
        setTtsFallbackNotice({ provider, reason })
        // Só persiste 'native' no banco em falhas permanentes (key inválida, sem créditos, etc.)
        // Erros transientes (timeout, rede) não mudam a config do livro permanentemente
        if (!transient) switchToNativeTts()
      }
      setTtsProviderFallback({ provider })
    },
    onStop: () => {
      setShowBackToTtsLocation(false)
      viewerRef.current?.clearTts()
    },
    onError: () => {
      // Não esconde o player: mantém visível para o usuário poder tentar novamente.
      // O onStop (chamado no finally do play()) já limpa o estado de highlight e backToLocation.
      setShowBackToTtsLocation(false)
    },
    // Fim natural da seção (último parágrafo lido) — esconde player e mostra notificação
    onFinished: () => {
      advanceTtsToNextSection()
    },
  })

  const getTtsChunks = useCallback(() => {
    return viewerRef.current?.getSentenceChunks() ?? []
  }, [])

  // Capa/título/capítulo pra notificação nativa (US3) — busca a capa só uma
  // vez por livro (cacheada em bookCoverBase64Ref) e reusa nas chamadas seguintes.
  const syncTtsPlaybackMetadata = useCallback(async (chapterLabel?: string) => {
    if (bookCoverBase64Ref.current === undefined) {
      bookCoverBase64Ref.current = ''
      if (book.id != null) {
        try {
          const cover = await getBookCover(book.id)
          if (cover) bookCoverBase64Ref.current = await blobToBase64(cover.blob)
        } catch {
          // Sem capa disponível — notificação segue só com título/capítulo.
        }
      }
    }

    void TtsPlaybackSessionService.updateMetadata({
      title: book.title,
      chapterLabel,
      coverBase64: bookCoverBase64Ref.current || undefined,
    })
  }, [book.id, book.title])

  const startPlay = useCallback((chunks: ReturnType<typeof getTtsChunks>, idx: number) => {
    ttsAdvancePendingRef.current = false
    ttsAutoAdvanceSkipCountRef.current = 0
    setTtsFinished(false)
    setTtsFallbackNotice(null)
    setTtsProviderFallback(null)
    setTtsPlayerVisible(true)
    setShowBackToTtsLocation(false)
    viewerRef.current?.resetTtsScroll()
    void tts.play(chunks, idx)
  }, [tts])

  // Sincroniza metadata nativa (capa/título/capítulo) sempre que a narração
  // começa a tocar — desacoplado de startPlay pra não entrar na sua lista de
  // dependências memoizadas (cover é cacheada, então chamadas repetidas são baratas).
  useEffect(() => {
    if (!tts.isPlaying) return
    lastNotifiedChapterLabelRef.current = footerTocLabelRef.current
    void syncTtsPlaybackMetadata(footerTocLabelRef.current)
  }, [tts.isPlaying, syncTtsPlaybackMetadata])

  useEffect(() => {
    const restartIdx = pendingTtsConfigRestartRef.current
    // Não reinicia enquanto pausado — handleTtsToggle consome o restart ao retomar
    if (restartIdx == null || tts.isPaused) return

    pendingTtsConfigRestartRef.current = null
    void Promise.resolve().then(() => {
      const chunks = getTtsChunks()
      if (chunks.length === 0) return
      startPlay(chunks, Math.min(restartIdx, chunks.length - 1))
    })
  }, [getTtsChunks, startPlay, ttsConfig.provider, ttsConfig.rate, tts.isPaused])

  async function scheduleTtsConfigRestartIfPlaying() {
    if (!tts.isPlaying && !tts.isPaused) return
    const idx = tts.lastChunkIdx.current
    if (tts.isPlaying) {
      await tts.stop()
    }
    pendingTtsConfigRestartRef.current = idx
  }

  async function handleTtsProviderChange(provider: TtsProvider) {
    // Compara contra o provider efetivo (o que o select exibe), não o configurado.
    // Quando há fallback ativo (ttsProviderFallback != null), activeProvider = 'native'
    // mesmo que ttsConfig.provider ainda seja o provider premium — precisamos permitir
    // que o usuário re-selecione o provider premium para tentar novamente.
    const effectiveProvider = ttsProviderFallback ? 'native' : ttsEngine
    if (provider === effectiveProvider || !ttsProviderAvailability[provider]) return

    setTtsFallbackNotice(null)
    setTtsProviderFallback(null)
    await scheduleTtsConfigRestartIfPlaying()
    applyTtsConfigPatch({ provider })
  }

  async function handleTtsRateChange(rate: number) {
    const nextRate = clampTtsRate(rate)
    if (nextRate === ttsConfig.rate) return

    await scheduleTtsConfigRestartIfPlaying()
    applyTtsConfigPatch({ rate: nextRate })
  }

  function finishTtsAtBookEnd() {
    ttsAdvancePendingRef.current = false
    ttsAutoAdvanceSkipCountRef.current = 0
    // Fim de verdade do livro (sem próxima seção) — só aqui sabemos que não
    // vai ter um play() novo em seguida, então é o ponto certo pra derrubar
    // o Service/notificação nativos (useTTS.ts não distingue "próxima seção"
    // de "livro acabou", só ReaderScreen sabe disso).
    void TtsPlaybackSessionService.stop()
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

  function handleReaderSectionReady(_sectionIndex: number, sectionHref?: string) {
    const pendingStartHref = pendingStartHrefRef.current
    if (
      pendingStartHref &&
      initialStartNavigationTriggeredRef.current &&
      isSectionHrefAtStartTarget(pendingStartHref, sectionHref)
    ) {
      completeInitialStartNavigation()
    }

    handleTtsSectionReady()
  }

  // Botão principal: inicia do ponto parado (resume) ou do primeiro parágrafo visível
  function handleTtsToggle() {
    if (tts.isPlaying) {
      void tts.pause()
    } else if (tts.isPaused) {
      const pendingRestart = pendingTtsConfigRestartRef.current
      if (pendingRestart != null) {
        // Config mudou enquanto pausado — para sessão anterior antes de reiniciar
        // (libera audioRef, object URL e listeners do audio pausado)
        pendingTtsConfigRestartRef.current = null
        const chunks = getTtsChunks()
        if (chunks.length > 0) void tts.stop().then(() => startPlay(chunks, Math.min(pendingRestart, chunks.length - 1)))
      } else {
        void tts.resume().then((resumed) => {
          if (resumed) return
          const chunks = getTtsChunks()
          if (chunks.length === 0) return
          const startIdx = Math.min(tts.lastChunkIdx.current, Math.max(0, chunks.length - 1))
          startPlay(chunks, startIdx)
        })
      }
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
    if (chunks.length === 0) return
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
    void tts.stop().then(() => startPlay(chunks, Math.max(0, targetIdx)))
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

  // Controles da notificação/tela de bloqueio (US3) — assina uma única vez;
  // useSyncRef evita closure stale nos handlers (mesmo padrão de useCapacitorAppListener).
  const playbackControlHandlerRef = useSyncRef((event: TtsPlaybackControlEvent) => {
    switch (event.action) {
      case 'play':
      case 'pause':
        handleTtsToggle()
        break
      case 'stop':
        handleTtsStop()
        break
      case 'skipNext':
        handleTtsNext()
        break
      case 'skipPrevious':
        handleTtsPrev()
        break
    }
  })

  useEffect(() => {
    return TtsPlaybackSessionService.onPlaybackControl((event) => playbackControlHandlerRef.current(event))
  }, [playbackControlHandlerRef])

  // Foco de áudio nativo (US4) — repassado pro useTTS, que só reage pro
  // provider nativo (o <audio> premium já se pausa/retoma sozinho via o
  // próprio WebView, ver comentário em useTTS.ts::handleAudioFocusChange).
  const audioFocusHandlerRef = useSyncRef((event: TtsAudioFocusEvent) => {
    tts.handleAudioFocusChange(event.type)
  })

  useEffect(() => {
    return TtsPlaybackSessionService.onAudioFocusChange((event) => audioFocusHandlerRef.current(event))
  }, [audioFocusHandlerRef])

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
    translationAbortControllerRef.current?.abort()
    const controller = new AbortController()
    translationAbortControllerRef.current = controller

    const selectionId = viewerRef.current?.showTranslationLoading()
    translate(sourceText, bookLanguage, translationTargetLang, { provider: translationProvider, signal: controller.signal })
      .then((result) => viewerRef.current?.injectTranslation(result.translatedText, selectionId, result.provider))
      .catch(() => {
        // Cancelamento explícito (nova tradução disparada antes desta
        // terminar) não mostra erro — não é uma falha real (FR-007/FR-008).
        if (controller.signal.aborted) return
        viewerRef.current?.injectTranslation(t('reader.translation.error'), selectionId)
      })
  }

  function handleWordLensDefinition(target: WordLensDefinitionTarget) {
    if (!wordLensData) return
    const startedAt = getDiagnosticsNowMs()
    viewerRef.current?.showWordLensDefinitionLoading(target)
    loadWordLensDefinition(target.lemma, wordLensData)
      .then((entry) => {
        viewerRef.current?.injectWordLensDefinition(target, entry)
        logEvent('reader.wordLens.definition', {
          screen: 'reader',
          status: entry ? 'success' : 'fallback',
          durationMs: getDiagnosticsNowMs() - startedAt,
          details: {
            level: target.level,
            result: entry ? 'found' : 'missing',
            senseCount: entry?.senses.length ?? 0,
          },
        })
      })
      .catch(() => {
        viewerRef.current?.injectWordLensDefinitionError(target)
        logEvent('reader.wordLens.definition', {
          screen: 'reader',
          status: 'failure',
          durationMs: getDiagnosticsNowMs() - startedAt,
          details: {
            level: target.level,
            result: 'asset-error',
          },
        })
      })
  }

  // Reaproveitado pelo botão de TOC do chrome e pela zona de atalho na
  // borda esquerda do leitor — mesmo destino, dois pontos de entrada.
  const handleOpenToc = useCallback(() => setTocOpen(true), [])

  const handleOpenImage = useCallback((payload: ReaderImageOpenPayload) => {
    setReaderImagePreview(payload)
  }, [])

  const handleRelocate = useCallback(
    (location: ReaderRelocatePayload) => {
      const { cfi: newCfi, percentage: newPercentage, chapterPercentage: newChapterPercentage, tocLabel, sectionHref, fraction, sectionIndex } = location
      const pendingStartHref = pendingStartHrefRef.current
      if (pendingStartHref) {
        // Aceita o relocate da navegação inicial (vinda do EpubViewer via initialTarget)
        // sem exigir que a flag esteja setada — basta o location bater com o alvo.
        if (!isRelocateAtStartTarget(pendingStartHref, location)) return

        initialStartNavigationTriggeredRef.current = true
        completeInitialStartNavigation()
      }

      const previousSectionIndex = activeSectionIndexRef.current
      if (
        previousSectionIndex !== null &&
        previousSectionIndex !== sectionIndex &&
        tocLabel?.trim()
      ) {
        setSectionChangeLabelForCurrentBook(tocLabel.trim())
        if (sectionChangeTimerRef.current) clearTimeout(sectionChangeTimerRef.current)
        sectionChangeTimerRef.current = setTimeout(() => {
          setSectionChangeLabelForCurrentBook(null)
          sectionChangeTimerRef.current = null
        }, 1200)
      }
      activeSectionIndexRef.current = sectionIndex
      setCurrentSectionHrefForCurrentBook(sectionHref ?? null)
      if (newChapterPercentage !== undefined) {
        setCfi(newCfi, newPercentage, tocLabel, newChapterPercentage)
      } else {
        setCfi(newCfi, newPercentage, tocLabel)
      }
      saveProgress({
        cfi: newCfi,
        percentage: newPercentage,
        fraction,
        sectionHref,
        sectionLabel: tocLabel,
      })
    },
    [completeInitialStartNavigation, saveProgress, setCfi, setCurrentSectionHrefForCurrentBook, setSectionChangeLabelForCurrentBook],
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
    // Bookmarks já sincronizam ao serem criados/editados (db/bookmarks.ts),
    // mas é fire-and-forget contra a API do Drive — se o usuário fecha o
    // livro logo depois de marcar, o sync pode não ter terminado ainda.
    // Dá mais uma chance aqui; scheduleBookmarkDriveSync já é seguro de
    // chamar de novo (dedupe interno, no-op se não houver nada pendente).
    if (bookmarks.some((bookmark) => !bookmark.syncedAt)) {
      // 'permission-error' faz scheduleBookmarkDriveSync descartar a chamada
      // em silêncio (token do Drive expirado não se autorrenova — mesmo
      // problema do bugfix bookmark-nao-sincroniza-ao-clicar-no). Só
      // Configuracoes/o ícone de sync podem abrir a tela de login do Google
      // pra resolver isso; fechar o leitor não é essa ação explícita do
      // usuário, então só avisamos em vez de tentar (e falhar) de novo.
      if (getCachedBookmarkDriveSyncStatus().code === 'permission-error') {
        onBookmarkSyncBlocked(t('reader.bookmarkSyncPendingNotice'))
      } else {
        void scheduleBookmarkDriveSync(book.id!)
      }
    }
    onBack()
  }, [flushCurrentProgress, bookmarks, book.id, onBack, onBookmarkSyncBlocked, t])

  // Intercepta o botão Back físico do Android (via plugin Capacitor)
  useCapacitorBackButton(() => {
    if (readerImagePreview) { setReaderImagePreview(null); return }
    if (bookmarkSheetOpen) { setBookmarkSheetOpen(false); return }
    if (appearanceSheetOpen) { setAppearanceSheetOpen(false); return }
    if (tocOpen) { setTocOpen(false); return }
    handleBack()
  })

  useCapacitorAppStateChange(({ isActive }) => {
    if (isActive) {
      void setReaderImmersiveMode(true)
      // Reaplica junto: o processo pode ter sido recriado enquanto o app
      // estava em segundo plano, e aí o flag da Activity voltou ao padrão.
      void setSelectionMenuSuppressed(true)
      return
    }

    // De propósito NÃO pausa/para o TTS aqui: o audiobook deve continuar
    // tocando com o app em segundo plano (TtsPlaybackService nativo é quem
    // mantém isso vivo). Só salva o progresso antes de sair de primeiro plano.
    void flushCurrentProgress()
  })

  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'hidden') void flushCurrentProgress()
    }

    const handlePageHide = () => {
      void flushCurrentProgress()
    }

    document.addEventListener('visibilitychange', handleVisibilityChange)
    window.addEventListener('pagehide', handlePageHide)

    return () => {
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

  // Highlights (feature 010): grava direto, sem agendar sync no Drive
  // (Invariante 7/FR-018) — useLiveQuery acima já reage à escrita sozinho.
  // US3: a pintura/despintura no texto é feita pelo próprio EpubViewer no
  // mesmo toque; aqui só persiste. O useLiveQuery devolve a lista nova e o
  // efeito de repintura do viewer cuida do resto.
  function handleDeleteHighlight(highlight: Highlight) {
    if (highlight.id === undefined) return
    void deleteHighlight(highlight.id)
  }

  // "Destacar" no menu de seleção (feature 016): NÃO cria nada ainda — só
  // abre a caixa unificada com o draft (sem cor/estilo). Ver
  // handleSaveHighlightComposer pra onde a criação de fato acontece.
  function handleRequestCreateHighlight(draft: HighlightDraftPayload) {
    setHighlightComposer({ type: 'create', draft })
  }

  // Tocar num highlight existente (feature 016): abre a MESMA caixa
  // unificada, agora em modo edição (pré-preenchida com os valores atuais).
  function handleEditHighlight(highlight: Highlight) {
    setHighlightComposer({ type: 'edit', highlight })
    // Abrir a caixa por QUALQUER via (toast ou menu) nao deve deixar um
    // toast antigo pairando por cima (feature 015).
    setHighlightAnnotateToast(null)
  }

  // Toque no toast de atalho (feature 015): abre a caixa unificada em modo
  // edição pro highlight recém-criado (mesmo caminho de handleEditHighlight).
  function handleTapAnnotateToast() {
    if (!highlightAnnotateToast) return
    setHighlightComposer({ type: 'edit', highlight: highlightAnnotateToast })
    setHighlightAnnotateToast(null)
  }

  // Único lugar que decide o que gravar da caixa unificada (feature 016) —
  // ramifica por modo. Nunca chamado a partir de onClose/Cancelar (FR-003/FR-007).
  async function handleSaveHighlightComposer(result: { color: string; style: HighlightStyle; note: string }) {
    if (!highlightComposer) return
    const note = result.note.trim()

    if (highlightComposer.type === 'create') {
      if (book.id === undefined) {
        setHighlightComposer(null)
        return
      }
      const { draft } = highlightComposer
      const newHighlight = {
        bookId: book.id,
        cfi: draft.cfi,
        paraCfi: draft.paraCfi,
        text: draft.text,
        color: result.color,
        style: result.style,
        sectionIndex: draft.sectionIndex,
        percentage: draft.percentage,
        createdAt: new Date(),
        ...(note ? { note } : {}),
      }
      const id = await addHighlight(newHighlight)
      setLastHighlightColor(result.color)
      setLastHighlightStyle(result.style)
      void updateReaderDefaults({ lastHighlightColor: result.color, lastHighlightStyle: result.style })
      // Toast só se a nota ficou vazia (FR-006) — já anotado na própria caixa
      // não precisa de um segundo convite.
      if (!note) setHighlightAnnotateToast({ ...newHighlight, id })
    } else {
      const { highlight } = highlightComposer
      if (highlight.id !== undefined) {
        await Promise.all([
          updateHighlightAppearance(highlight.id, { color: result.color, style: result.style }),
          updateHighlightNote(highlight.id, result.note),
        ])
      }
    }

    setHighlightComposer(null)
  }

  async function handleRemoveMissingBook() {
    if (book.id === undefined) return
    setRemovingMissingBook(true)
    setMissingBookRemovalError(null)
    try {
      await deleteBook(book.id)
      handleBack()
    } catch {
      setMissingBookRemovalError(t('reader.missingFile.removeError'))
      setRemovingMissingBook(false)
    }
  }

  // Aguarda IndexedDB e preferências do livro antes de montar o EpubViewer.
  if (!initialLoadDone || !readerAppearanceReady) return <ReaderSkeleton />

  const readerPalette = getReaderThemePalette(readerTheme)
  const readerStyleMode = !overrideBookFont && !overrideBookColors ? 'original' : 'comfortable'
  const effectiveMissingFile = book.missingFile || detectedMissingFile
  const missingFileMessage = effectiveMissingFile ? t('reader.missingFile.description') : null
  const visibleError = error ?? missingFileMessage

  return (
    <div className="fixed inset-0" style={{ backgroundColor: readerPalette.background }}>
      {isLoading && !effectiveMissingFile && <ReaderSkeleton />}

      <div className="absolute inset-0">
        {!effectiveMissingFile && (
          <EpubViewer
          ref={viewerRef}
          book={book}
          bookmarks={activeBookmarks}
          fontSize={fontSize}
          lineHeight={lineHeight}
          readerTheme={readerTheme}
          fontFamily={fontFamily}
          overrideBookFont={overrideBookFont}
          overrideBookColors={overrideBookColors}
          focusLineEnabled={focusLineEnabled}
          wordLensEnabled={wordLensEnabled}
          wordLensLevel={wordLensLevel}
          wordLensData={wordLensData}
          savedCfi={startHref ? null : savedCfi}
          initialTarget={startHref ?? null}
          onRelocate={handleRelocate}
          onTocReady={setToc}
          onSectionReady={handleReaderSectionReady}
          onLoad={() => {
            setWordLensInteractiveBookId(book.id)
            finishReaderOpen('success')
            if (startHref && !initialStartNavigationTriggeredRef.current) {
              // EpubViewer já navegou via initialTarget. Seta a flag para que
              // handleRelocate aceite o relocate inicial. O fallback libera o
              // loading se nenhum relocate chegar em START_NAVIGATION_FALLBACK_MS.
              initialStartNavigationTriggeredRef.current = true
              scheduleStartNavigationFallback()
              hideInitialLoading()
              return
            } else {
              pendingStartHrefRef.current = null
            }
            releaseInitialLoading()
          }}
          onError={(err) => {
            if (err.message.includes('movido') || err.message.includes('permissao de acesso')) {
              setDetectedMissingFile(true)
            }
            finishReaderOpen('failure', err)
            pendingStartHrefRef.current = null
            releaseInitialLoading()
            setError(err.message)
          }}
          onSaveVocab={handleSaveVocab}
          chromeVisible={chromeVisible}
          onCenterTap={handleCenterTap}
          onOpenToc={handleOpenToc}
          onTranslate={handleTranslate}
          onWordLensDefinition={handleWordLensDefinition}
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
          onOpenImage={handleOpenImage}
          vocabWords={vocabWords}
          highlights={highlights}
          onRequestCreateHighlight={handleRequestCreateHighlight}
          onDeleteHighlight={handleDeleteHighlight}
          onEditHighlight={handleEditHighlight}
          />
        )}
      </div>

      {/* Nota: o toggle do chrome é tratado pelo handler de click do próprio iframe via a prop
          chromeVisible. Quando true, qualquer toque no iframe fecha o chrome. Isso é mais
          confiável que overlays/backdrop, pois evita o problema de compositing do Android WebView. */}

      <ReaderChrome
        visible={chromeVisible}
        title={book.title}
        percentage={percentage}
        chapterPercentage={chapterPercentage}
        sectionLabel={currentTocLabel ?? null}
        fontSize={fontSize}
        bookmarkCount={activeBookmarks.length}
        onBack={handleBack}
        onAppearanceOpen={() => setAppearanceSheetOpen(true)}
        onBookmarkList={() => setBookmarkSheetOpen(true)}
        onTocOpen={handleOpenToc}
        onOpenVocabulary={() => onOpenVocabulary()}
        ttsIsPlaying={tts.isPlaying}
        ttsEngine={ttsEngine}
        onTtsToggle={() => handleTtsToggle()}
        onDismiss={() => setChromeVisible(false)}
      />

      <ReaderProgressFooter
        sectionLabel={footerTocLabel ?? null}
        chapterPercentage={chapterPercentage}
      />

      <ImageZoomModal
        src={readerImagePreview?.src ?? null}
        alt={readerImagePreview?.alt ?? null}
        onClose={() => setReaderImagePreview(null)}
      />

      {/* Indicador discreto de troca de seção no modo corrido. */}
      {sectionChangeLabel && !ttsPlayerVisible && (
        <div className="pointer-events-none absolute left-1/2 top-4 z-20 -translate-x-1/2 px-4">
          <div className="rounded-full border border-white/10 bg-[rgba(15,7,24,0.82)] px-4 py-2 text-[12px] font-medium text-text-primary shadow-nav backdrop-blur-xl">
            {sectionChangeLabel}
          </div>
        </div>
      )}

      {selectedPremiumTtsMissingKey && !ttsPlayerVisible && (
        <div className="absolute left-4 right-4 top-4 z-30">
          <IntegrationHelpBanner
            title={t('reader.tts.missingKey.title')}
            description={t('reader.tts.missingKey.description', { provider: getTtsProviderLabel(ttsConfig.provider) })}
            actionLabel={t('reader.tts.missingKey.action')}
            dismissId={`reader-tts-${ttsConfig.provider}`}
            icon={<Volume2 size={18} />}
            tone="warning"
            onAction={onOpenSettings}
          />
        </div>
      )}

      {/* Mini player TTS — visível enquanto TTS está ativo (tocando ou pausado) */}
      {ttsFallbackNotice && (
        <TtsFallbackToast
          provider={ttsFallbackNotice.provider}
          reason={ttsFallbackNotice.reason}
          onDismiss={() => setTtsFallbackNotice(null)}
        />
      )}

      {ttsPlayerVisible && (
        <TtsMiniPlayer
          isPlaying={tts.isPlaying}
          activeProvider={ttsProviderFallback ? 'native' : ttsEngine}
          fallbackFromProvider={ttsProviderFallback?.provider ?? null}
          providerAvailability={ttsProviderAvailability}
          ttsRate={ttsConfig.rate}
          showBackToTtsLocation={showBackToTtsLocation}
          bottomOffsetPx={READER_PROGRESS_FOOTER_HEIGHT_PX}
          onPlayPause={handleTtsToggle}
          onBackToTtsLocation={handleBackToTtsLocation}
          onPrevParagraph={handleTtsPrev}
          onPrevSentence={handleTtsPrevSentence}
          onNextSentence={handleTtsNextSentence}
          onNextParagraph={handleTtsNext}
          onProviderChange={handleTtsProviderChange}
          onRateChange={handleTtsRateChange}
          onStop={handleTtsStop}
        />
      )}

      {/* Notificação de fim de capítulo — aparece quando TTS termina naturalmente */}
      {ttsFinished && (
        <TtsFinishedToast onDismiss={() => setTtsFinished(false)} />
      )}

      {/* Atalho pra anotar logo após criar um highlight (feature 015) */}
      {highlightAnnotateToast && (
        <Toast
          tone="info"
          durationMs={5500}
          onAction={handleTapAnnotateToast}
          onDismiss={() => setHighlightAnnotateToast(null)}
        >
          {t('highlightAnnotateToast.message')}
        </Toast>
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

      <HighlightComposerSheet
        key={highlightComposer?.type === 'edit' ? highlightComposer.highlight.id : (highlightComposer?.type === 'create' ? highlightComposer.draft.cfi : 'closed')}
        open={highlightComposer !== null}
        highlight={highlightComposer?.type === 'edit' ? highlightComposer.highlight : null}
        defaultColor={lastHighlightColor}
        defaultStyle={lastHighlightStyle}
        onSave={handleSaveHighlightComposer}
        onClose={() => setHighlightComposer(null)}
      />

      <BottomSheet
        open={appearanceSheetOpen}
        onClose={() => setAppearanceSheetOpen(false)}
        title={t('reader.appearance.title')}
      >
        <div className="flex flex-col gap-5">
          <div>
            <p className="mb-2 text-[11px] font-bold uppercase tracking-wider text-text-muted">
              {t('reader.appearance.theme')}
            </p>
            <ReaderThemeControl
              value={readerTheme}
              onChange={(value) => applyAppearancePatch({ readerTheme: value, overrideBookColors: true })}
            />
          </div>

          <div>
            <p className="mb-2 text-[11px] font-bold uppercase tracking-wider text-text-muted">
              {t('reader.appearance.font')}
            </p>
            <ReaderFontControl
              value={fontFamily}
              onChange={(value) => applyAppearancePatch({
                fontFamily: value,
                overrideBookFont: value !== 'publisher',
              })}
            />
          </div>

          <div>
            <p className="mb-2 text-[11px] font-bold uppercase tracking-wider text-text-muted">
              {t('reader.appearance.size')}
            </p>
            <ReaderFontSizeControl
              value={fontSize}
              onChange={(value) => applyAppearancePatch({ fontSize: value })}
            />
          </div>

          <div>
            <p className="mb-2 text-[11px] font-bold uppercase tracking-wider text-text-muted">
              {t('reader.appearance.lineHeight')}
            </p>
            <ReaderLineHeightControl
              value={lineHeight}
              onChange={(value) => applyAppearancePatch({ lineHeight: value })}
            />
          </div>

          <div>
            <p className="mb-2 text-[11px] font-bold uppercase tracking-wider text-text-muted">
              {t('reader.appearance.mode')}
            </p>
            <ReaderModeControl
              value={readerStyleMode}
              onChange={handleReaderStyleModeChange}
            />
          </div>

          <div className="flex items-center justify-between gap-4">
            <div className="min-w-0">
              <p className="text-sm font-semibold text-text-primary">{t('reader.appearance.focusLine.label')}</p>
              <p className="mt-0.5 text-xs text-text-muted">{t('reader.appearance.focusLine.description')}</p>
            </div>
            <Switch
              checked={focusLineEnabled}
              onChange={(value) => {
                localStorage.setItem('neoreader:focus-line', value ? '1' : '0')
                setFocusLineEnabled(value)
              }}
              aria-label={t('reader.appearance.focusLine.label')}
            />
          </div>
        </div>
      </BottomSheet>

      {visibleError && (
        <div className="absolute inset-0 z-40 bg-bg-reader flex flex-col items-center justify-center gap-4 px-8">
          <div className="flex max-w-sm flex-col items-center gap-2 text-center">
            {effectiveMissingFile && (
              <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-error">
                {t('reader.missingFile.title')}
              </p>
            )}
            <p className="text-error text-sm text-center">{visibleError}</p>
            {missingBookRemovalError && (
              <p className="text-xs text-text-muted">{missingBookRemovalError}</p>
            )}
          </div>
          <div className="flex flex-col items-center gap-3">
            {effectiveMissingFile && book.id !== undefined && (
              <button
                type="button"
                onClick={() => void handleRemoveMissingBook()}
                disabled={removingMissingBook}
                className="rounded-pill bg-error/20 px-4 py-2 text-sm font-semibold text-error transition-all active:scale-[0.97] disabled:opacity-50"
              >
                {removingMissingBook ? t('reader.missingFile.removing') : t('reader.missingFile.remove')}
              </button>
            )}
            <button onClick={handleBack} className="text-indigo-primary text-sm underline">
              {t('reader.backToLibrary')}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

function TtsFallbackToast({
  provider,
  reason,
  onDismiss,
}: {
  provider: TtsProvider
  reason: string
  onDismiss: () => void
}) {
  const { t } = useI18n()

  useEffect(() => {
    const t = setTimeout(onDismiss, 6500)
    return () => clearTimeout(t)
  }, [onDismiss])

  return (
    <div className="absolute left-4 right-4 top-4 z-30 rounded-[22px] border border-warning/30 bg-[rgba(15,7,24,0.9)] px-4 py-3 shadow-card backdrop-blur-xl">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-warning">
            {t('tts.fallback.title')}
          </p>
          <p className="mt-1 text-sm text-text-secondary">
            {t('tts.fallback.message', { provider: getTtsProviderLabel(provider) })}
          </p>
          <p className="mt-1 text-xs leading-snug text-text-muted">
            {reason}
          </p>
        </div>
        <button
          type="button"
          onPointerUp={onDismiss}
          className="inline-flex h-9 shrink-0 items-center rounded-pill border border-white/8 bg-bg-surface-2/80 px-3 text-xs font-semibold text-text-primary transition-all duration-150 active:scale-[0.96] active:bg-white/10"
        >
          {t('common.ok')}
        </button>
      </div>
    </div>
  )
}

function ReaderSkeleton() {
  return (
    <div data-testid="reader-loading" className="fixed inset-0 z-50 bg-bg-reader flex items-center justify-center">
      <div className="w-8 h-8 border-2 border-indigo-primary border-t-transparent rounded-full animate-spin" />
    </div>
  )
}

function TtsFinishedToast({ onDismiss }: { onDismiss: () => void }) {
  const { t } = useI18n()

  useEffect(() => {
    const t = setTimeout(onDismiss, 5000)
    return () => clearTimeout(t)
  }, [onDismiss])

  return (
    <div className="absolute bottom-24 left-4 right-4 z-30 rounded-[24px] border border-white/10 bg-[rgba(15,7,24,0.88)] px-4 py-3 shadow-card backdrop-blur-xl">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-purple-light/80">
            {t('tts.finished.title')}
          </p>
          <p className="mt-1 text-sm text-text-secondary">
            {t('tts.finished.chapterEnd')}
          </p>
        </div>
        <button
          onPointerUp={onDismiss}
          className="inline-flex h-10 shrink-0 items-center rounded-pill border border-white/8 bg-bg-surface-2/80 px-4 text-sm font-medium text-indigo-primary transition-all duration-150 active:scale-[0.96] active:bg-white/10"
        >
          {t('common.ok')}
        </button>
      </div>
    </div>
  )
}


