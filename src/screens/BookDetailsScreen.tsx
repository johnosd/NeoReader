import { useEffect, useRef, useState, type ReactNode } from 'react'
import { useCallback } from 'react'
import { ArrowLeft, Star, ChevronRight, Globe, Calendar, HardDrive, Sparkles, BookOpen, Bookmark, X, Check, Volume2, Mic2, Gauge, Search, Play, Loader2, Cloud, CloudOff } from 'lucide-react'
import { useLiveQuery } from 'dexie-react-hooks'
import { Badge, BottomSheet, Button, EmptyState, ListItem, Spinner } from '../components/ui'
import { AuthorTab } from '../components/AuthorTab'
import { IntegrationHelpBanner } from '../components/IntegrationHelpBanner'
import { QuotaUsageHint } from '../components/QuotaUsageHint'
import { db } from '../db/database'
import { toggleFavorite } from '../db/books'
import { softDeleteBookmark } from '../db/bookmarks'
import { getBookSettings, updateBookSettings } from '../db/bookSettings'
import { getSettings } from '../db/settings'
import { useEntitlements } from '../hooks/useEntitlements'
import { useBookDetailsTtsVoices } from '../hooks/useBookDetailsTtsVoices'
import { useBookCoverUrl } from '../hooks/useBookCoverUrl'
import { useCapacitorBackButton } from '../hooks/useCapacitorAppListener'
import { useBookInfo } from '../hooks/useBookInfo'
import { BookFileResolver } from '../services/BookFileResolver'
import { EpubService, type EpubExtras } from '../services/EpubService'
import { NativeTtsService } from '../services/NativeTtsService'
import {
  TTS_PROVIDER_ORDER,
  getTtsProviderApiKeyFromSettings,
  getTtsProviderLabel,
  isPremiumTtsProvider,
  isTtsProviderConfigured,
  resolveTtsProviderFromAvailability,
  getTtsProviderAvailability,
  synthesizePremiumTts,
} from '../services/TtsProviderRegistry'
import {
  ReaderFontControl,
  ReaderFontSizeControl,
  ReaderLineHeightControl,
  ReaderModeControl,
  ReaderPreviewPanel,
  ReaderThemeControl,
  type ReaderStyleMode,
} from '../components/reader/ReaderAppearanceControls'
import { TocNavigator } from '../components/reader/TocDrawer'
import type { Book, BookSettings } from '../types/book'
import type {
  BookInfoConfidence,
  BookInfoProviderAttemptDiagnostic,
  BookInfoSource,
  BookReview,
  StoredBookInfo,
} from '../types/bookInfo'
import type { AppSettings, FontSize, ReaderFontFamily, ReaderLineHeight, ReaderTheme } from '../types/settings'
import type { TtsProvider, TtsVoiceOption } from '../types/tts'
import { clampTtsRate, normalizeLanguageTag } from '../utils/language'
import { BOOK_LANGUAGE_OPTIONS, getLanguageLabel, TRANSLATION_LANGUAGE_OPTIONS } from '../utils/languageOptions'
import { resolveReadingState } from '../utils/readingState'
import {
  buildBookTtsVoiceSelectionPatch,
  getBookTtsVoiceSelection,
} from '../utils/ttsVoiceSelection'
import { useI18n, type MessageKey } from '../i18n'
import type { FeatureQuotaSnapshot } from '../services/FeatureQuotaService'

interface BookDetailsScreenProps {
  book: Book
  onBack: () => void
  onRead: (book: Book, startHref?: string) => void
  onOpenSettings: () => void
  onOpenPaywall?: () => void
}

type Tab = 'chapters' | 'bookmarks' | 'settings' | 'details' | 'reviews' | 'autor'

const TABS: { id: Tab; labelKey: MessageKey }[] = [
  { id: 'chapters', labelKey: 'bookDetails.tab.chapters' },
  { id: 'bookmarks', labelKey: 'bookDetails.tab.bookmarks' },
  { id: 'reviews', labelKey: 'bookDetails.tab.reviews' },
  { id: 'autor', labelKey: 'bookDetails.tab.author' },
  { id: 'settings', labelKey: 'bookDetails.tab.settings' },
  { id: 'details', labelKey: 'bookDetails.tab.details' },
]

const EXTRAS_LOAD_TIMEOUT_MS = 10_000
const TTS_RATE_OPTIONS = [0.8, 0.9, 1, 1.1, 1.2]

function resolveEffectiveTtsProvider(provider: TtsProvider, settings: AppSettings): TtsProvider {
  return resolveTtsProviderFromAvailability(provider, getTtsProviderAvailability(settings))
}

function getTtsVoicePreviewText(language: string) {
  const baseLanguage = normalizeLanguageTag(language).split('-')[0]
  if (baseLanguage === 'pt') return 'Este e um teste curto da voz no NeoReader.'
  if (baseLanguage === 'es') return 'Esta es una prueba breve de la voz en NeoReader.'
  return 'This is a short voice preview in NeoReader.'
}

export function BookDetailsScreen({ book, onBack, onRead, onOpenSettings, onOpenPaywall }: BookDetailsScreenProps) {
  const { locale, t } = useI18n()
  const { isPro } = useEntitlements()
  const [activeTab, setActiveTab] = useState<Tab>('chapters')
  const [descExpanded, setDescExpanded] = useState(false)
  const [extras, setExtras] = useState<EpubExtras | null>(null)
  const [extrasLoading, setExtrasLoading] = useState(true)
  const [bookInfoRefreshToken, setBookInfoRefreshToken] = useState(0)
  const [optimisticBookSettings, setOptimisticBookSettings] = useState<BookSettings | null>(null)
  const [defaultFontSize, setDefaultFontSize] = useState<FontSize>('md')
  const [defaultLineHeight, setDefaultLineHeight] = useState<ReaderLineHeight>('comfortable')
  const [defaultReaderTheme, setDefaultReaderTheme] = useState<ReaderTheme>('dark')
  const [defaultFontFamily, setDefaultFontFamily] = useState<ReaderFontFamily>('classic')
  const [defaultOverrideBookFont, setDefaultOverrideBookFont] = useState(true)
  const [defaultOverrideBookColors, setDefaultOverrideBookColors] = useState(true)
  const [appSettings, setAppSettings] = useState<AppSettings>({
    appLocale: 'auto',
    speechifyApiKey: '',
    elevenLabsApiKey: '',
    fishAudioApiKey: '',
    translationTargetLang: 'pt-BR',
    youtubeApiKey: '',
  })
  const [settingsLoaded, setSettingsLoaded] = useState(false)
  const [bookLanguageSheetOpen, setBookLanguageSheetOpen] = useState(false)
  const [translationTargetLangSheetOpen, setTranslationTargetLangSheetOpen] = useState(false)
  const [ttsProviderSheetOpen, setTtsProviderSheetOpen] = useState(false)
  const [ttsVoiceSheetOpen, setTtsVoiceSheetOpen] = useState(false)
  const [ttsSpeedSheetOpen, setTtsSpeedSheetOpen] = useState(false)
  const [ttsVoicePreviewingId, setTtsVoicePreviewingId] = useState<string | null>(null)
  const [ttsVoicePreviewError, setTtsVoicePreviewError] = useState<string | null>(null)
  const ttsVoicePreviewAudioRef = useRef<HTMLAudioElement | null>(null)
  const ttsVoicePreviewModeRef = useRef<'audio' | 'native' | null>(null)
  const ttsVoicePreviewSessionRef = useRef(0)
  const pendingBookSettingsSaveRef = useRef<Promise<void>>(Promise.resolve())
  const ttsProviders: Array<{ value: TtsProvider; label: string }> = TTS_PROVIDER_ORDER.map((provider) => ({
    value: provider,
    label: provider === 'native' ? t('bookDetails.tts.native') : getTtsProviderLabel(provider),
  }))

  const liveBook = useLiveQuery(() => db.books.get(book.id!), [book.id]) ?? book
  const progress = useLiveQuery(() => db.progress.where('bookId').equals(book.id!).first(), [book.id])
  const bookmarks = useLiveQuery(
    () => db.bookmarks.where('bookId').equals(book.id!).and((bookmark) => !bookmark.deletedAt).sortBy('createdAt'),
    [book.id],
  ) ?? []
  const vocabCount = useLiveQuery(() => db.vocabulary.where('bookId').equals(book.id!).count(), [book.id]) ?? 0
  const storedBookSettingsRow = useLiveQuery(() => getBookSettings(book.id!), [book.id])
  const bookSettingsRow = optimisticBookSettings ?? storedBookSettingsRow

  const fontSize: FontSize = bookSettingsRow?.fontSize ?? defaultFontSize
  const lineHeight: ReaderLineHeight = bookSettingsRow?.lineHeight ?? defaultLineHeight
  const readerTheme: ReaderTheme = bookSettingsRow?.readerTheme ?? defaultReaderTheme
  const fontFamily: ReaderFontFamily = bookSettingsRow?.fontFamily ?? defaultFontFamily
  const overrideBookFont = bookSettingsRow?.overrideBookFont ?? (bookSettingsRow?.fontFamily ? fontFamily !== 'publisher' : defaultOverrideBookFont)
  const overrideBookColors = bookSettingsRow?.overrideBookColors ?? defaultOverrideBookColors
  const readerStyleMode = !overrideBookFont && !overrideBookColors ? 'original' : 'comfortable'
  const tocItems = extras?.toc ?? []
  const selectedTtsProvider: TtsProvider = bookSettingsRow?.ttsProvider ?? 'speechify'
  const effectiveTtsProvider = resolveEffectiveTtsProvider(selectedTtsProvider, appSettings)
  const ttsRate = clampTtsRate(bookSettingsRow?.ttsRate ?? 1)
  const {
    info: bookInfo,
    loading: bookInfoLoading,
    diagnostics: bookInfoDiagnostics,
    quota: bookInfoQuota,
  } = useBookInfo({
    book: liveBook,
    enabled: settingsLoaded,
    youtubeApiKey: appSettings.youtubeApiKey,
    refreshToken: bookInfoRefreshToken,
  })

  useEffect(() => {
    getSettings().then((settings) => {
      setDefaultFontSize(settings.readerDefaults.defaultFontSize)
      setDefaultLineHeight(settings.readerDefaults.lineHeight)
      setDefaultReaderTheme(settings.readerDefaults.readerTheme)
      setDefaultFontFamily(settings.readerDefaults.fontFamily)
      setDefaultOverrideBookFont(settings.readerDefaults.overrideBookFont)
      setDefaultOverrideBookColors(settings.readerDefaults.overrideBookColors)
      setAppSettings(settings.appSettings)
      setSettingsLoaded(true)
    })
  }, [])

  useEffect(() => {
    setOptimisticBookSettings(null)
  }, [book.id, storedBookSettingsRow?.updatedAt])

  useEffect(() => {
    let cancelled = false
    let timeoutId: ReturnType<typeof setTimeout> | null = null
    setExtrasLoading(true)
    const extrasTask = BookFileResolver.resolveFile(liveBook).then((file) => EpubService.parseExtras(file, liveBook.id))
    const timeoutMessage = t('bookDetails.extrasTimeout')
    const timeoutTask = new Promise<EpubExtras>((_, reject) => {
      timeoutId = setTimeout(() => {
        reject(new Error(timeoutMessage))
      }, EXTRAS_LOAD_TIMEOUT_MS)
    })

    Promise.race([extrasTask, timeoutTask]).then((result) => {
      if (cancelled) return
      setExtras(result)
      setExtrasLoading(false)
    }).catch((error) => {
      if (cancelled) return
      if (error instanceof Error && error.message === timeoutMessage && liveBook.id !== undefined) {
        EpubService.invalidateExtrasCache(liveBook.id)
      }
      setExtras(null)
      setExtrasLoading(false)
    }).finally(() => {
      if (timeoutId) clearTimeout(timeoutId)
    })
    return () => {
      cancelled = true
      if (timeoutId) clearTimeout(timeoutId)
    }
  }, [liveBook, liveBook.fileBlob, liveBook.id, liveBook.storageMode, liveBook.uri, t])

  useCapacitorBackButton(onBack)

  const coverUrl = useBookCoverUrl(liveBook.id)
  const { percentage: pct, readingStatus } = resolveReadingState(liveBook, progress)
  const detectedBookLanguage = extras?.language ? normalizeLanguageTag(extras.language, 'en') : null
  const effectiveBookLanguage = normalizeLanguageTag(bookSettingsRow?.bookLanguage ?? detectedBookLanguage ?? 'en', 'en')
  const langLabel = getLanguageLabel(effectiveBookLanguage)
  const readerPreviewText = extras?.previewText ?? 'The quick brown fox jumps over the lazy dog.'
  const styleDiagnostics = extras?.styleDiagnostics ?? []
  const visibleStyleDiagnostics = styleDiagnostics.slice(0, 3)
  const providerConfigured = isTtsProviderConfigured(selectedTtsProvider, appSettings)
  const selectedProviderLabel = ttsProviders.find((option) => option.value === selectedTtsProvider)?.label ?? selectedTtsProvider
  const effectiveProviderLabel = ttsProviders.find((option) => option.value === effectiveTtsProvider)?.label ?? effectiveTtsProvider
  const providerInFallback = effectiveTtsProvider !== selectedTtsProvider
  const selectedVoice = getBookTtsVoiceSelection(bookSettingsRow, effectiveTtsProvider)
  const selectedVoiceLabel = !providerConfigured
    ? t('bookDetails.tts.providerUnavailable', { provider: selectedProviderLabel })
    : (selectedVoice?.label ?? (effectiveTtsProvider === 'native' ? t('bookDetails.setting.defaultVoiceDevice') : t('bookDetails.tts.providerDefaultVoice')))
  const selectedVoiceAvatarUrl = providerConfigured ? (selectedVoice?.avatarUrl ?? null) : null
  const selectedVoiceMeta = providerConfigured
    ? `${selectedVoiceLabel} - ${getLanguageLabel(effectiveBookLanguage) ?? effectiveBookLanguage}`
    : t('bookDetails.configureApiKey')
  const publishedYear = formatPublishedYear(bookInfo?.publishedDate?.value)
  const headerRating = bookInfo?.rating
    ? formatBookRating(bookInfo.rating.value.average, bookInfo.rating.value.count)
    : null
  const headerRatingLabel = headerRating
    ? t('bookDetails.rating.value', { rating: headerRating })
    : bookInfoLoading
      ? t('bookDetails.rating.loading')
      : t('bookDetails.rating.unavailable')
  const aboutDescription = extras?.description ?? bookInfo?.synopsis?.value ?? null
  const youtubeReviews = bookInfo?.reviews?.value.filter((review) => review.provider === 'youtube') ?? []
  const {
    visibleOptions: visibleTtsVoiceOptions,
    hiddenCount: hiddenTtsVoiceCount,
    loading: ttsVoiceLoading,
    error: ttsVoiceError,
    search: ttsVoiceSearch,
    setSearch: setTtsVoiceSearch,
    setShowAll: setShowAllTtsVoices,
    loadOptions: loadVoiceOptions,
  } = useBookDetailsTtsVoices({
    appSettings,
    effectiveBookLanguage,
  })

  function applyBookSettingsPatch(patch: Partial<Omit<BookSettings, 'id' | 'bookId'>>) {
    setOptimisticBookSettings((previous) => ({
      ...(storedBookSettingsRow ?? { bookId: book.id! }),
      ...previous,
      ...patch,
      bookId: book.id!,
      updatedAt: new Date(),
    }))

    const save = pendingBookSettingsSaveRef.current
      .catch(() => {})
      .then(() => updateBookSettings(book.id!, patch))
    pendingBookSettingsSaveRef.current = save
    void save
  }

  function openReader(startHref?: string) {
    void pendingBookSettingsSaveRef.current
      .catch(() => {})
      .then(() => onRead(liveBook, startHref))
  }

  function applyComfortableReadingMode() {
    applyBookSettingsPatch({
      fontFamily: fontFamily === 'publisher' ? 'classic' : fontFamily,
      overrideBookFont: true,
      overrideBookColors: true,
    })
  }

  function handleReaderStyleModeChange(mode: ReaderStyleMode) {
    if (mode === 'original') {
      applyBookSettingsPatch({
        fontFamily: 'publisher',
        overrideBookFont: false,
        overrideBookColors: false,
      })
      return
    }

    applyComfortableReadingMode()
  }

  const stopTtsVoicePreviewPlayback = useCallback(() => {
    const audio = ttsVoicePreviewAudioRef.current
    if (audio) {
      audio.pause()
      ttsVoicePreviewAudioRef.current = null
    }
    if (ttsVoicePreviewModeRef.current === 'native') {
      void NativeTtsService.stop()
    }
    ttsVoicePreviewModeRef.current = null
  }, [])

  const cancelTtsVoicePreview = useCallback(() => {
    ttsVoicePreviewSessionRef.current += 1
    stopTtsVoicePreviewPlayback()
    setTtsVoicePreviewingId(null)
  }, [stopTtsVoicePreviewPlayback])

  useEffect(() => {
    return () => {
      ttsVoicePreviewSessionRef.current += 1
      stopTtsVoicePreviewPlayback()
    }
  }, [stopTtsVoicePreviewPlayback])

  useEffect(() => {
    if (!ttsVoiceSheetOpen) return
    setShowAllTtsVoices(false)
    setTtsVoiceSearch('')
    setTtsVoicePreviewError(null)
    cancelTtsVoicePreview()
    void loadVoiceOptions(selectedTtsProvider)
  }, [
    cancelTtsVoicePreview,
    loadVoiceOptions,
    selectedTtsProvider,
    setShowAllTtsVoices,
    setTtsVoiceSearch,
    ttsVoiceSheetOpen,
  ])

  function closeTtsVoiceSheet() {
    setTtsVoiceSheetOpen(false)
    setTtsVoiceSearch('')
    setTtsVoicePreviewError(null)
    cancelTtsVoicePreview()
  }

  async function playAudioPreview(audio: HTMLAudioElement, session: number) {
    await new Promise<void>((resolve, reject) => {
      let settled = false

      const cleanup = () => {
        if (settled) return
        settled = true
        audio.removeEventListener('ended', finish)
        audio.removeEventListener('pause', finish)
        audio.removeEventListener('error', fail)
        if (ttsVoicePreviewAudioRef.current === audio) {
          ttsVoicePreviewAudioRef.current = null
          ttsVoicePreviewModeRef.current = null
        }
      }

      const finish = () => {
        cleanup()
        resolve()
      }

      const fail = () => {
        cleanup()
        reject(new Error('Voice preview audio failed'))
      }

      ttsVoicePreviewAudioRef.current = audio
      ttsVoicePreviewModeRef.current = 'audio'
      audio.addEventListener('ended', finish)
      audio.addEventListener('pause', finish)
      audio.addEventListener('error', fail)
      void audio.play().catch(fail)
    })

    if (ttsVoicePreviewSessionRef.current !== session) throw new Error('Voice preview cancelled')
  }

  async function playGeneratedVoicePreview(audioBlob: Blob, session: number) {
    const url = URL.createObjectURL(audioBlob)
    try {
      await playAudioPreview(new Audio(url), session)
    } finally {
      URL.revokeObjectURL(url)
    }
  }

  async function playTtsVoicePreview(voice: TtsVoiceOption) {
    if (ttsVoicePreviewingId === voice.id) {
      cancelTtsVoicePreview()
      return
    }

    const session = ttsVoicePreviewSessionRef.current + 1
    ttsVoicePreviewSessionRef.current = session
    stopTtsVoicePreviewPlayback()
    setTtsVoicePreviewError(null)
    setTtsVoicePreviewingId(voice.id)

    const previewText = getTtsVoicePreviewText(effectiveBookLanguage)

    try {
      if (voice.previewUrl) {
        await playAudioPreview(new Audio(voice.previewUrl), session)
      } else if (isPremiumTtsProvider(selectedTtsProvider)) {
        const apiKey = getTtsProviderApiKeyFromSettings(appSettings, selectedTtsProvider)
        if (!apiKey) throw new Error(`${getTtsProviderLabel(selectedTtsProvider)} API key missing`)
        const result = await synthesizePremiumTts(selectedTtsProvider, previewText, {
          apiKey,
          language: effectiveBookLanguage,
          rate: 1,
          voiceId: voice.id,
        })
        await playGeneratedVoicePreview(result.audioBlob, session)
      } else {
        ttsVoicePreviewModeRef.current = 'native'
        await NativeTtsService.speakPreview(previewText, {
          language: effectiveBookLanguage,
          voiceKey: voice.id,
          rate: 1,
        })
      }
    } catch (error) {
      if (ttsVoicePreviewSessionRef.current === session) {
        console.warn('Voice preview failed.', error)
        setTtsVoicePreviewError(t('bookDetails.tts.voicePreviewError'))
      }
    } finally {
      if (ttsVoicePreviewSessionRef.current === session) {
        setTtsVoicePreviewingId(null)
        ttsVoicePreviewModeRef.current = null
      }
    }
  }

  function updateProvider(provider: TtsProvider) {
    if (!isTtsProviderConfigured(provider, appSettings)) {
      setTtsProviderSheetOpen(false)
      onOpenSettings()
      return
    }

    applyBookSettingsPatch({ ttsProvider: provider })
    setTtsProviderSheetOpen(false)
  }

  function updateVoice(option: TtsVoiceOption | null) {
    applyBookSettingsPatch(buildBookTtsVoiceSelectionPatch(bookSettingsRow, selectedTtsProvider, option))
    closeTtsVoiceSheet()
  }

  function openVoiceSettings() {
    if (!providerConfigured) {
      onOpenSettings()
      return
    }
    setTtsVoiceSearch('')
    setTtsVoiceSheetOpen(true)
  }

  return (
    <div className="min-h-screen bg-bg-base text-text-primary pb-16">
      <header className="px-4 pt-10 pb-4 flex items-center justify-between gap-3">
        <button
          onClick={onBack}
          className="p-2 -ml-1 rounded-md text-text-secondary active:scale-90 transition-transform"
          aria-label={t('common.back')}
        >
          <ArrowLeft size={20} />
        </button>
        <p className="flex-1 text-sm text-text-muted truncate text-center">{liveBook.title}</p>
        <button
          onClick={() => book.id !== undefined && void toggleFavorite(book.id)}
          className="p-2 -mr-1 rounded-md active:scale-90 transition-transform"
          aria-label={liveBook.isFavorite ? t('library.removeFavorite') : t('library.favorite')}
        >
          <Star
            size={20}
            className={liveBook.isFavorite ? 'text-purple-light fill-purple-light' : 'text-text-secondary'}
          />
        </button>
      </header>

      <main className="flex flex-col gap-6">
        <div className="px-4 flex flex-col items-center gap-4 pt-2">
          <div className="w-40 aspect-[2/3] rounded-md shadow-card overflow-hidden bg-bg-surface flex items-center justify-center shrink-0">
            {coverUrl
              ? <img src={coverUrl} alt={liveBook.title} className="w-full h-full object-cover" onContextMenu={(e) => e.preventDefault()} />
              : <BookOpen size={40} className="text-text-muted" />
            }
          </div>
          <div className="text-center">
            <h1 className="text-2xl font-serif font-bold text-text-primary leading-snug">
              {liveBook.title}
            </h1>
            {(liveBook.author || publishedYear) && (
              <div className="mt-1 flex flex-wrap items-center justify-center gap-2 text-sm">
                {liveBook.author && (
                  <button
                    onClick={() => setActiveTab('autor')}
                    className="text-purple-light active:opacity-70 transition-opacity"
                  >
                    {liveBook.author}
                  </button>
                )}
                {publishedYear && (
                  <span className="text-text-muted">
                    {publishedYear}
                  </span>
                )}
              </div>
            )}
            <div className="mt-2 flex items-center justify-center gap-1.5 text-sm font-semibold text-text-secondary">
              {bookInfoLoading && !headerRating
                ? <Loader2 size={15} className="animate-spin text-text-muted" />
                : <Star size={15} className={headerRating ? 'text-purple-light fill-purple-light' : 'text-text-muted'} />
              }
              <span>{headerRatingLabel}</span>
            </div>
          </div>
        </div>

        <div className="px-4 flex flex-col gap-3">
          <Button variant="primary" tone="purple" fullWidth onClick={() => openReader()}>
            {readingStatus === 'finished'
              ? t('bookDetails.action.readAgain')
              : readingStatus === 'reading'
                ? t('bookDetails.action.continue', { percent: pct })
                : t('bookDetails.action.start')}
          </Button>
          <Button
            variant="outline" tone="purple" fullWidth disabled
            leftIcon={<Sparkles size={16} />}
            rightIcon={<Badge tone="neutral">{t('bookDetails.comingSoon')}</Badge>}
          >
            {t('bookDetails.talkToBook')}
          </Button>
        </div>

        <div className="px-4">
          <Section title={t('bookDetails.about')}>
            {aboutDescription && (
              <div className="mb-4">
                <p className={`text-sm text-text-secondary leading-relaxed ${descExpanded ? '' : 'line-clamp-3'}`}>
                  {aboutDescription}
                </p>
                <button
                  onClick={() => setDescExpanded((value) => !value)}
                  className="text-xs text-purple-light mt-1 active:opacity-60"
                >
                  {descExpanded ? t('bookDetails.readLess') : t('bookDetails.readMore')}
                </button>
              </div>
            )}
            <div className="flex items-center gap-3">
              <div className="flex-1 h-1.5 bg-bg-base rounded-full overflow-hidden">
                <div
                  className="h-full bg-success rounded-full transition-all duration-500"
                  style={{ width: `${pct}%` }}
                />
              </div>
              <span className="text-xs text-text-muted tabular-nums shrink-0">
                {readingStatus === 'finished' ? t('bookDetails.finished') : `${pct}%`}
              </span>
            </div>
            <div className="flex gap-4 mt-3">
              <Stat value={bookmarks.length} label={t('bookDetails.stat.bookmarks')} />
              <Stat value={vocabCount} label={t('bookDetails.stat.vocabulary')} />
            </div>
          </Section>
        </div>

        <div>
          <div className="overflow-x-auto px-4 border-b border-border" style={{ scrollbarWidth: 'none' }}>
            <div className="flex gap-1 min-w-max">
              {TABS.map((tab) => {
                const active = activeTab === tab.id
                const count = tab.id === 'bookmarks' && bookmarks.length > 0
                  ? bookmarks.length
                  : tab.id === 'reviews' && youtubeReviews.length > 0
                    ? youtubeReviews.length
                    : null
                return (
                  <button
                    key={tab.id}
                    onClick={() => setActiveTab(tab.id)}
                    className={`relative flex items-center gap-1.5 px-4 py-3 text-sm font-semibold whitespace-nowrap transition-colors duration-150 ${
                      active ? 'text-purple-light' : 'text-text-muted active:text-text-secondary'
                    }`}
                  >
                    {t(tab.labelKey)}
                    {count !== null && (
                      <span className={`text-[10px] font-bold tabular-nums px-1.5 py-0.5 rounded-pill ${
                        active ? 'bg-purple-primary/20 text-purple-light' : 'bg-bg-surface text-text-muted'
                      }`}>
                        {count}
                      </span>
                    )}
                    {active && (
                      <span className="absolute bottom-0 left-4 right-4 h-0.5 rounded-full bg-purple-light" />
                    )}
                  </button>
                )
              })}
            </div>
          </div>

          <div className="px-4 pt-4">
            {activeTab === 'chapters' && (
              extrasLoading ? (
                <div className="flex justify-center py-8">
                  <Spinner size={20} tone="purple" label={t('bookDetails.chaptersLoading')} />
                </div>
              ) : (
                <TocNavigator
                  toc={tocItems}
                  currentHref={progress?.sectionHref}
                  currentLabel={progress?.sectionLabel}
                  onSelect={(href) => openReader(href)}
                  className="pb-4"
                  defaultExpanded={false}
                />
              )
            )}

            {activeTab === 'bookmarks' && (
              bookmarks.length > 0 ? (
                <div className="rounded-md bg-bg-surface border border-border overflow-hidden">
                  {bookmarks.map((bookmark, index) => (
                    <ListItem
                      key={bookmark.id}
                      leading={<Bookmark size={16} className="text-purple-light" />}
                      title={bookmark.label}
                      meta={`${bookmark.percentage}%`}
                      onClick={() => openReader(bookmark.cfi)}
                      divider={index < bookmarks.length - 1}
                      trailing={(
                        <div className="flex items-center gap-1">
                          {isPro === true && (
                            bookmark.syncError
                              ? <CloudOff size={13} className="text-error" />
                              : bookmark.syncedAt
                                ? <Cloud size={13} className="text-success" />
                                : <Cloud size={13} className="text-text-muted" />
                          )}
                          <button
                            onClick={(event) => {
                              event.stopPropagation()
                              if (bookmark.id !== undefined) void softDeleteBookmark(bookmark.id)
                            }}
                            className="p-2 -m-2 text-text-muted active:text-error transition-colors"
                            aria-label={t('bookDetails.removeBookmark')}
                          >
                            <X size={15} />
                          </button>
                        </div>
                      )}
                    />
                  ))}
                </div>
              ) : (
                <EmptyState
                  icon={<Bookmark size={32} />}
                  title={t('bookDetails.noBookmarks.title')}
                  description={t('bookDetails.noBookmarks.description')}
                />
              )
            )}

            {activeTab === 'settings' && (
              <div className="rounded-md p-4 bg-bg-surface border border-border flex flex-col gap-4">
                <div>
                  <p className="text-[11px] font-bold uppercase tracking-wider text-text-muted mb-3">
                    {t('bookDetails.setting.preview')}
                  </p>
                  <ReaderPreviewPanel
                    theme={readerTheme}
                    fontFamily={fontFamily}
                    fontSize={fontSize}
                    lineHeight={lineHeight}
                  >
                    {readerPreviewText}
                  </ReaderPreviewPanel>
                </div>

                {styleDiagnostics.length > 0 && (
                  <div className="border-l-2 border-[#1bcc64] pl-3 py-1">
                    <div className="flex items-start gap-2">
                      <Sparkles size={16} className="mt-0.5 shrink-0 text-[#1bcc64]" />
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-semibold text-text-primary">
                          {t('bookDetails.setting.strongStylesTitle')}
                        </p>
                        <p className="mt-1 text-xs leading-relaxed text-text-muted">
                          {t('bookDetails.setting.strongStylesDescription')}
                        </p>
                        <div className="mt-2 flex flex-wrap gap-1.5">
                          {visibleStyleDiagnostics.map((diagnostic) => (
                            <PrimeVideoBadge key={diagnostic.issue} tone="warning">
                              {diagnostic.label}
                            </PrimeVideoBadge>
                          ))}
                        </div>
                        <button
                          type="button"
                          onClick={applyComfortableReadingMode}
                          className="mt-3 text-xs font-bold text-purple-light transition-colors hover:text-white"
                        >
                          {t('bookDetails.setting.applyComfortable')}
                        </button>
                      </div>
                    </div>
                  </div>
                )}

                <div>
                  <p className="text-[11px] font-bold uppercase tracking-wider text-text-muted mb-3">
                    {t('bookDetails.setting.themeReader')}
                  </p>
                  <ReaderThemeControl
                    value={readerTheme}
                    onChange={(value) => applyBookSettingsPatch({ readerTheme: value, overrideBookColors: true })}
                    surface="base"
                  />
                </div>

                <div>
                  <p className="text-[11px] font-bold uppercase tracking-wider text-text-muted mb-3">
                    {t('bookDetails.setting.fontBook')}
                  </p>
                  <ReaderFontControl
                    value={fontFamily}
                    onChange={(value) => applyBookSettingsPatch({
                      fontFamily: value,
                      overrideBookFont: value !== 'publisher',
                    })}
                    surface="base"
                  />
                  <div className="mt-3 flex flex-wrap gap-1.5">
                    <PrimeVideoBadge tone={overrideBookFont ? 'prime' : 'neutral'}>
                      {overrideBookFont ? t('bookDetails.setting.fontNeoReader') : t('bookDetails.setting.fontOriginal')}
                    </PrimeVideoBadge>
                    <PrimeVideoBadge tone={overrideBookColors ? 'prime' : 'neutral'}>
                      {overrideBookColors ? t('bookDetails.setting.themeColors') : t('bookDetails.setting.bookColors')}
                    </PrimeVideoBadge>
                  </div>
                </div>

                <div>
                  <p className="text-[11px] font-bold uppercase tracking-wider text-text-muted mb-3">
                    {t('settings.appearance.fontSize.label')}
                  </p>
                  <ReaderFontSizeControl
                    value={fontSize}
                    onChange={(value) => applyBookSettingsPatch({ fontSize: value })}
                    surface="base"
                  />
                </div>

                <div>
                  <p className="text-[11px] font-bold uppercase tracking-wider text-text-muted mb-3">
                    {t('bookDetails.setting.lineHeight')}
                  </p>
                  <ReaderLineHeightControl
                    value={lineHeight}
                    onChange={(value) => applyBookSettingsPatch({ lineHeight: value })}
                    surface="base"
                  />
                </div>

                <div>
                  <p className="text-[11px] font-bold uppercase tracking-wider text-text-muted mb-3">
                    {t('bookDetails.setting.readingMode')}
                  </p>
                  <ReaderModeControl
                    value={readerStyleMode}
                    onChange={handleReaderStyleModeChange}
                    surface="base"
                  />
                </div>

                <div>
                  <p className="text-[11px] font-bold uppercase tracking-wider text-text-muted mb-3">
                    {t('bookDetails.setting.bookLanguage')}
                  </p>
                  <div className="-mx-4">
                    <ListItem
                      leading={<Globe size={18} />}
                      title={t('bookDetails.setting.bookOriginalLanguage')}
                      meta={(
                        <div className="flex flex-wrap items-center gap-1.5 pt-1">
                          <PrimeVideoBadge tone="exclusive">
                            {getLanguageLabel(bookSettingsRow?.bookLanguage ?? detectedBookLanguage ?? effectiveBookLanguage) ?? effectiveBookLanguage}
                          </PrimeVideoBadge>
                          <PrimeVideoBadge tone={bookSettingsRow?.bookLanguage ? 'prime' : 'neutral'}>
                            {bookSettingsRow?.bookLanguage ? t('bookDetails.manual') : t('bookDetails.auto')}
                          </PrimeVideoBadge>
                        </div>
                      )}
                      trailing={<ChevronRight size={18} />}
                      onClick={() => setBookLanguageSheetOpen(true)}
                      divider={false}
                    />
                  </div>
                </div>

                <div>
                  <p className="text-[11px] font-bold uppercase tracking-wider text-text-muted mb-3">
                    {t('bookDetails.setting.translation')}
                  </p>
                  <div className="-mx-4">
                    <ListItem
                      leading={<Globe size={18} />}
                      title={t('bookDetails.setting.translationTarget')}
                      meta={(
                        <div className="flex flex-wrap items-center gap-1.5 pt-1">
                          <PrimeVideoBadge tone="exclusive">
                            {getLanguageLabel(bookSettingsRow?.translationTargetLang ?? appSettings.translationTargetLang) ?? (bookSettingsRow?.translationTargetLang ?? appSettings.translationTargetLang)}
                          </PrimeVideoBadge>
                          <PrimeVideoBadge tone={bookSettingsRow?.translationTargetLang ? 'prime' : 'neutral'}>
                            {bookSettingsRow?.translationTargetLang ? t('bookDetails.thisBook') : t('bookDetails.defaultApp')}
                          </PrimeVideoBadge>
                        </div>
                      )}
                      trailing={<ChevronRight size={18} />}
                      onClick={() => setTranslationTargetLangSheetOpen(true)}
                      divider={false}
                    />
                  </div>
                </div>

                <div>
                  <p className="text-[11px] font-bold uppercase tracking-wider text-text-muted mb-3">
                    TTS
                  </p>
                  {providerInFallback && (
                    <div className="mb-3">
                      <IntegrationHelpBanner
                        title={t('bookDetails.tts.missingKey.title')}
                        description={t('bookDetails.tts.missingKey.description', { provider: selectedProviderLabel })}
                        actionLabel={t('bookDetails.tts.missingKey.action')}
                        dismissId={`book-details-tts-${selectedTtsProvider}`}
                        icon={<Volume2 size={18} />}
                        tone="warning"
                        onAction={onOpenSettings}
                      />
                    </div>
                  )}
                  <div className="-mx-4 rounded-md border border-border overflow-hidden">
                    <ListItem
                      leading={<Volume2 size={18} />}
                      title={t('bookDetails.setting.provider')}
                      meta={(
                        <div className="flex flex-wrap items-center gap-1.5 pt-1">
                          <PrimeVideoBadge tone="exclusive">
                            {t('bookDetails.provider.saved', { provider: selectedProviderLabel })}
                          </PrimeVideoBadge>
                          {providerInFallback ? (
                            <>
                              <PrimeVideoBadge tone="neutral">
                                {t('bookDetails.provider.inUse', { provider: effectiveProviderLabel })}
                              </PrimeVideoBadge>
                              <PrimeVideoBadge tone="warning">
                                {t('bookDetails.apiKeyPending')}
                              </PrimeVideoBadge>
                            </>
                          ) : (
                            <PrimeVideoBadge tone="prime">
                              {t('bookDetails.provider.active')}
                            </PrimeVideoBadge>
                          )}
                        </div>
                      )}
                      trailing={<ChevronRight size={18} />}
                      onClick={() => setTtsProviderSheetOpen(true)}
                      divider={false}
                    />
                    <div className="border-t border-border px-3 py-3">
                      <p className="px-1 pb-2 text-[11px] font-bold uppercase tracking-wider text-text-muted">
                         {t('bookDetails.setting.voiceAndSpeed')}
                      </p>
                      <div className="overflow-hidden rounded-2xl border border-white/6 bg-[#1f1f1f]">
                        <TtsControlRow
                          icon={<Mic2 size={18} />}
                          label={t('bookDetails.setting.voice')}
                          value={selectedVoiceLabel}
                          detail={selectedVoiceMeta}
                          avatarUrl={selectedVoiceAvatarUrl}
                          isVoiceRow
                          onClick={openVoiceSettings}
                        />
                        <div className="mx-4 h-px bg-white/6" />
                        <TtsControlRow
                          icon={<Gauge size={18} />}
                          label={t('bookDetails.setting.ttsSpeed')}
                          value={formatTtsRate(ttsRate)}
                          detail={formatTtsWordsPerMinute(ttsRate)}
                          onClick={() => setTtsSpeedSheetOpen(true)}
                        />
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {activeTab === 'details' && (
              <div className="space-y-4">
                <BookInfoDetails
                  info={bookInfo}
                  loading={bookInfoLoading}
                  onRefresh={() => setBookInfoRefreshToken((value) => value + 1)}
                />
                <BookInfoDiagnosticsSection
                  diagnostics={bookInfoDiagnostics}
                  loading={bookInfoLoading}
                  onRefresh={() => setBookInfoRefreshToken((value) => value + 1)}
                />

                <div className="rounded-md bg-bg-surface border border-border overflow-hidden">
                  {langLabel && (
                    <ListItem leading={<Globe size={18} />} title={t('bookDetails.details.language')} meta={langLabel} divider />
                  )}
                  <ListItem
                    leading={<Calendar size={18} />}
                    title={t('bookDetails.added')}
                    meta={formatDate(liveBook.addedAt, locale)}
                    divider={!!liveBook.lastOpenedAt}
                  />
                  {liveBook.lastOpenedAt && (
                    <ListItem
                      leading={<Calendar size={18} />}
                      title={t('bookDetails.lastAccess')}
                      meta={formatDate(liveBook.lastOpenedAt, locale)}
                      divider
                    />
                  )}
                  <ListItem
                    leading={<HardDrive size={18} />}
                    title={t('bookDetails.size')}
                    meta={formatFileSize(liveBook.fileSize ?? liveBook.fileBlob?.size ?? 0)}
                    divider={false}
                  />
                </div>
              </div>
            )}

            {activeTab === 'reviews' && (
              <BookReviewsTab
                reviews={youtubeReviews}
                loading={bookInfoLoading}
                quota={bookInfoQuota}
                youtubeApiKey={appSettings.youtubeApiKey}
                onOpenSettings={onOpenSettings}
                onOpenPaywall={onOpenPaywall}
              />
            )}

            {activeTab === 'autor' && (
              <AuthorTab
                book={liveBook}
                youtubeApiKey={appSettings.youtubeApiKey}
                onOpenSettings={onOpenSettings}
                onOpenPaywall={onOpenPaywall}
              />
            )}
          </div>
        </div>
      </main>

      <BottomSheet
        open={bookLanguageSheetOpen}
        onClose={() => setBookLanguageSheetOpen(false)}
        title={t('bookDetails.setting.bookLanguage')}
      >
        <div className="-mx-4">
          {BOOK_LANGUAGE_OPTIONS.map((option) => {
            const active = (bookSettingsRow?.bookLanguage ?? null) === option.code
            return (
              <ListItem
                key={option.code ?? 'auto'}
                title={option.label}
                trailing={active ? <Check size={18} className="text-purple-light" /> : undefined}
                onClick={() => {
                  applyBookSettingsPatch({ bookLanguage: option.code })
                  setBookLanguageSheetOpen(false)
                }}
                divider={option.code !== BOOK_LANGUAGE_OPTIONS[BOOK_LANGUAGE_OPTIONS.length - 1].code}
              />
            )
          })}
        </div>
      </BottomSheet>

      <BottomSheet
        open={translationTargetLangSheetOpen}
        onClose={() => setTranslationTargetLangSheetOpen(false)}
        title={t('bookDetails.setting.translationLanguage')}
      >
        <div className="-mx-4">
          <ListItem
            title={t('bookDetails.defaultApp')}
            meta={getLanguageLabel(appSettings.translationTargetLang) ?? appSettings.translationTargetLang}
            trailing={!bookSettingsRow?.translationTargetLang ? <Check size={18} className="text-purple-light" /> : undefined}
            onClick={() => {
              applyBookSettingsPatch({ translationTargetLang: null })
              setTranslationTargetLangSheetOpen(false)
            }}
            divider
          />
          {TRANSLATION_LANGUAGE_OPTIONS.map((option) => {
            const active = bookSettingsRow?.translationTargetLang === option.code
            return (
              <ListItem
                key={option.code}
                title={option.label}
                trailing={active ? <Check size={18} className="text-purple-light" /> : undefined}
                onClick={() => {
                  applyBookSettingsPatch({ translationTargetLang: option.code })
                  setTranslationTargetLangSheetOpen(false)
                }}
                divider={option.code !== TRANSLATION_LANGUAGE_OPTIONS[TRANSLATION_LANGUAGE_OPTIONS.length - 1].code}
              />
            )
          })}
        </div>
      </BottomSheet>

      <BottomSheet
        open={ttsProviderSheetOpen}
        onClose={() => setTtsProviderSheetOpen(false)}
        title={t('bookDetails.setting.providerSheet')}
      >
        <div className="-mx-4">
          {ttsProviders.map((option) => {
            const active = selectedTtsProvider === option.value
            const meta = option.value === 'native'
              ? t('bookDetails.provider.deviceAvailable')
              : (isTtsProviderConfigured(option.value, appSettings) ? t('bookDetails.configured') : t('bookDetails.apiKeyPending'))
            return (
              <ListItem
                key={option.value}
                title={option.label}
                meta={meta}
                trailing={active ? <Check size={18} className="text-purple-light" /> : undefined}
                onClick={() => updateProvider(option.value)}
                divider={option.value !== ttsProviders[ttsProviders.length - 1].value}
              />
            )
          })}
        </div>
      </BottomSheet>

      <BottomSheet
        open={ttsVoiceSheetOpen}
        onClose={closeTtsVoiceSheet}
        title={t('bookDetails.setting.bookVoice')}
      >
        <>
          <IntegrationHelpBanner
            title={t('bookDetails.tts.voiceEducation.title')}
            description={selectedTtsProvider === 'native'
              ? t('bookDetails.tts.voiceEducation.nativeDescription')
              : t('bookDetails.tts.voiceEducation.premiumDescription')}
            dismissId="book-details-voice-education"
            icon={<Mic2 size={18} />}
          />
          <div className="mt-3">
            {ttsVoiceLoading ? (
              <div className="flex justify-center py-8">
                <Spinner size={20} tone="purple" label={t('bookDetails.setting.voiceLoading')} />
              </div>
            ) : ttsVoiceError ? (
              <EmptyState
                icon={<Volume2 size={28} />}
                title={t('bookDetails.setting.voicesUnavailable')}
                description={ttsVoiceError}
              />
            ) : (
              <div className="space-y-3">
            <div className="relative">
              <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" />
              <input
                type="search"
                value={ttsVoiceSearch}
                onChange={(event) => setTtsVoiceSearch(event.target.value)}
                placeholder={t('bookDetails.setting.searchVoice')}
                className="h-11 w-full rounded-md border border-border bg-bg-base pl-9 pr-10 text-sm text-text-primary outline-none transition-colors placeholder:text-text-muted focus:border-purple-primary/60"
              />
              {ttsVoiceSearch && (
                <button
                  type="button"
                  onClick={() => setTtsVoiceSearch('')}
                  className="absolute right-2 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-md text-text-muted transition-colors active:bg-white/10"
                  aria-label={t('common.clearSearch')}
                >
                  <X size={15} />
                </button>
              )}
            </div>

            {ttsVoicePreviewError && (
              <div className="rounded-md border border-error/30 bg-error/10 px-3 py-2 text-xs font-semibold text-error">
                {ttsVoicePreviewError}
              </div>
            )}

            <div className="-mx-4">
              <ListItem
                title={t('bookDetails.setting.defaultVoice')}
                meta={selectedTtsProvider === 'native' ? t('bookDetails.setting.defaultVoiceDevice') : t('bookDetails.setting.defaultVoiceProvider')}
                trailing={
                  !getBookTtsVoiceSelection(bookSettingsRow, selectedTtsProvider)?.id
                    ? <Check size={18} className="text-purple-light" />
                    : undefined
                }
                onClick={() => updateVoice(null)}
                divider={visibleTtsVoiceOptions.length > 0}
              />
              {visibleTtsVoiceOptions.map((voice, index) => {
                const active = getBookTtsVoiceSelection(bookSettingsRow, selectedTtsProvider)?.id === voice.id
                const previewing = ttsVoicePreviewingId === voice.id
                return (
                  <ListItem
                    key={voice.id}
                    leading={voice.avatarUrl ? (
                      <img
                        src={voice.avatarUrl}
                        alt=""
                        className="h-9 w-9 rounded-full object-cover"
                      />
                    ) : (
                      <div className="flex h-9 w-9 items-center justify-center rounded-full bg-white/6 text-text-secondary">
                        <Mic2 size={16} />
                      </div>
                    )}
                    title={voice.label}
                    meta={(
                      <span className="flex items-center gap-1.5 flex-wrap">
                        {voice.modelId && <VoiceModelBadge modelId={voice.modelId} />}
                        <span>{[voice.locale, voice.meta].filter(Boolean).join(' · ')}</span>
                      </span>
                    )}
                    trailing={(
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={(event) => {
                            event.stopPropagation()
                            void playTtsVoicePreview(voice)
                          }}
                          className={`flex h-9 w-9 items-center justify-center rounded-md border transition-colors active:scale-95 ${
                            previewing
                              ? 'border-purple-primary/60 bg-purple-primary/15 text-purple-light'
                              : 'border-white/10 bg-white/5 text-text-secondary active:bg-white/10'
                          }`}
                          aria-label={previewing ? t('bookDetails.tts.voicePreviewStop', { voice: voice.label }) : t('bookDetails.tts.voicePreviewListen', { voice: voice.label })}
                        >
                          {previewing ? <Loader2 size={16} className="animate-spin" /> : <Play size={15} />}
                        </button>
                        {active ? <Check size={18} className="text-purple-light" /> : null}
                      </div>
                    )}
                    onClick={() => updateVoice(voice)}
                    divider={index < visibleTtsVoiceOptions.length - 1 || hiddenTtsVoiceCount > 0}
                  />
                )
              })}
              {visibleTtsVoiceOptions.length === 0 && (
                <div className="px-4 py-6 text-center text-sm text-text-muted">
                  {t('bookDetails.setting.noVoiceFound')}
                </div>
              )}
              {hiddenTtsVoiceCount > 0 && (
                <button
                  onClick={() => setShowAllTtsVoices(true)}
                  className="w-full border-t border-white/5 px-4 py-3 text-sm font-semibold text-purple-light transition-colors duration-150 active:bg-white/5"
                >
                  {t('bookDetails.setting.showMoreVoices', { count: hiddenTtsVoiceCount })}
                </button>
              )}
            </div>
              </div>
            )}
          </div>
        </>
      </BottomSheet>

      <BottomSheet
        open={ttsSpeedSheetOpen}
        onClose={() => setTtsSpeedSheetOpen(false)}
        title={t('bookDetails.setting.ttsSpeed')}
      >
        <div className="-mx-4">
          {TTS_RATE_OPTIONS.map((value, index) => {
            const active = ttsRate === value
            return (
              <ListItem
                key={value}
                title={formatTtsRate(value)}
                meta={formatTtsWordsPerMinute(value)}
                trailing={active ? <Check size={18} className="text-purple-light" /> : undefined}
                onClick={() => {
                  applyBookSettingsPatch({ ttsRate: value })
                  setTtsSpeedSheetOpen(false)
                }}
                divider={index < TTS_RATE_OPTIONS.length - 1}
              />
            )
          })}
        </div>
      </BottomSheet>
    </div>
  )
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section>
      <h2 className="text-[11px] font-bold uppercase tracking-wider text-text-muted mb-3">
        {title}
      </h2>
      <div className="rounded-md p-4 bg-bg-surface border border-border">
        {children}
      </div>
    </section>
  )
}

function BookInfoDiagnosticsSection({
  diagnostics,
  loading,
  onRefresh,
}: {
  diagnostics: BookInfoProviderAttemptDiagnostic[]
  loading: boolean
  onRefresh: () => void
}) {
  const { t } = useI18n()

  return (
    <section>
      <h2 className="text-[11px] font-bold uppercase tracking-wider text-text-muted mb-3">
        {t('bookDetails.bookInfo.diagnostics')}
      </h2>
      <div className="rounded-md border border-border bg-bg-surface px-4 py-3">
        <button
          type="button"
          onClick={onRefresh}
          disabled={loading}
          className="w-full rounded-md border border-white/10 bg-white/5 px-3 py-2 text-sm font-semibold text-purple-light transition-colors active:bg-white/10 disabled:opacity-50"
        >
          {loading ? t('bookDetails.bookInfo.refreshing') : t('bookDetails.bookInfo.refresh')}
        </button>

        {import.meta.env.DEV && diagnostics.length > 0 && (
          <div className="mt-4 space-y-3 border-t border-white/8 pt-3">
            <div className="text-[11px] font-bold uppercase tracking-wider text-amber-200">
              {t('bookDetails.bookInfo.sources')}
            </div>
            {diagnostics.map((attempt, index) => (
              <div key={`${attempt.source}-${index}`} className="text-xs leading-relaxed text-text-muted">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-semibold text-text-primary">
                    {formatBookInfoSource(attempt.source)}
                  </span>
                  <span className={formatDiagnosticStatusClass(attempt.status)}>
                    {formatDiagnosticStatus(attempt.status)}
                  </span>
                  {attempt.fields.length > 0 && (
                    <span>{attempt.fields.join(', ')}</span>
                  )}
                </div>
                {attempt.message && (
                  <div className="mt-1 break-words">
                    {attempt.message}
                  </div>
                )}
                {attempt.details && attempt.details.length > 0 && (
                  <ul className="mt-1 space-y-1">
                    {attempt.details.map((detail) => (
                      <li key={detail} className="break-words">
                        {detail}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </section>
  )
}

function BookReviewsTab({
  reviews,
  loading,
  quota,
  youtubeApiKey,
  onOpenSettings,
  onOpenPaywall,
}: {
  reviews: BookReview[]
  loading: boolean
  quota: FeatureQuotaSnapshot | null
  youtubeApiKey: string
  onOpenSettings: () => void
  onOpenPaywall?: () => void
}) {
  const { t } = useI18n()
  const quotaBlocked = quota?.blockedReason === 'quota-exhausted'

  if (loading && reviews.length === 0) {
    return (
      <div className="flex flex-col gap-6 pb-4">
        <VideoReviewsSkeleton />
      </div>
    )
  }

  if (quotaBlocked && reviews.length === 0) {
    return (
      <EmptyState
        icon={<Sparkles size={32} />}
        title={t('bookDetails.review.quotaTitle')}
        description={t('bookDetails.review.quotaDescription')}
        action={(
          <div className="flex flex-col items-center gap-3">
            <QuotaUsageHint quota={quota} labelKey="quota.remaining.bookIntelligence" />
            {onOpenPaywall && (
              <Button size="sm" fullWidth={false} onClick={onOpenPaywall}>
                {t('bookDetails.quota.action')}
              </Button>
            )}
          </div>
        )}
      />
    )
  }

  return (
    <div className="flex flex-col gap-6 pb-4">
      <QuotaUsageHint quota={quota} labelKey="quota.remaining.bookIntelligence" className="-mb-2 px-1" />
      {reviews.length > 0 ? (
        <VideoReviewsCarousel reviews={reviews} />
      ) : (
        <EmptyState
          icon={<Play size={32} />}
          title={t('bookDetails.review.emptyTitle')}
          description={t('bookDetails.review.emptyDescription')}
        />
      )}
      {!youtubeApiKey && <ReviewsYoutubePrompt onOpenSettings={onOpenSettings} />}
    </div>
  )
}

function VideoReviewsCarousel({ reviews }: { reviews: BookReview[] }) {
  const { t } = useI18n()

  return (
    <div>
      <h3 className="mb-3 text-[11px] font-bold uppercase tracking-wider text-text-muted">
        {t('author.videos')}
      </h3>
      <div className="flex gap-3 overflow-x-auto pb-1" style={{ scrollbarWidth: 'none' }}>
        {reviews.slice(0, 8).map((review) => {
          const videoId = getYouTubeVideoId(review.url)
          const thumbnailUrl = videoId ? `https://img.youtube.com/vi/${videoId}/hqdefault.jpg` : null
          return (
            <button
              key={review.url ?? review.title}
              type="button"
              onClick={() => review.url && window.open(review.url, '_blank', 'noopener,noreferrer')}
              disabled={!review.url}
              className="flex-shrink-0 w-48 text-left transition-opacity active:opacity-70 disabled:opacity-60"
            >
              <div className="relative w-full overflow-hidden rounded-md bg-white/5" style={{ aspectRatio: '16/9' }}>
                {thumbnailUrl ? (
                  <img
                    src={thumbnailUrl}
                    alt={review.title}
                    className="h-full w-full object-cover"
                  />
                ) : (
                  <div className="flex h-full w-full items-center justify-center text-text-muted">
                    <Play size={24} />
                  </div>
                )}
                <div className="absolute inset-0 flex items-center justify-center bg-black/10">
                  <div className="flex h-9 w-9 items-center justify-center rounded-full bg-black/65 text-white">
                    <Play size={17} className="ml-0.5 fill-white" />
                  </div>
                </div>
              </div>
              <p className="mt-1.5 text-xs font-semibold text-text-primary line-clamp-2 leading-tight">
                {review.title}
              </p>
              {review.channelTitle && (
                <p className="mt-0.5 truncate text-[10px] text-text-muted">
                  {review.channelTitle}
                </p>
              )}
            </button>
          )
        })}
      </div>
    </div>
  )
}

function ReviewsYoutubePrompt({ onOpenSettings }: { onOpenSettings: () => void }) {
  const { t } = useI18n()

  return (
    <IntegrationHelpBanner
      title={t('bookDetails.review.promptTitle')}
      description={t('bookDetails.review.promptDescription')}
      actionLabel={t('bookDetails.review.promptAction')}
      dismissId="book-reviews-youtube-key"
      icon={<Play size={18} />}
      onAction={onOpenSettings}
    />
  )
}

function VideoReviewsSkeleton() {
  return (
    <div>
      <div className="mb-3 h-3 w-16 rounded-sm bg-white/8" />
      <div className="flex gap-3">
        {[0, 1, 2].map((index) => (
          <div key={index} className="w-48 flex-shrink-0">
            <div className="aspect-video w-full rounded-md bg-white/8" />
            <div className="mt-2 h-3 w-full rounded-sm bg-white/8" />
            <div className="mt-1 h-2.5 w-2/3 rounded-sm bg-white/8" />
          </div>
        ))}
      </div>
    </div>
  )
}

function BookInfoDetails({
  info,
  loading,
  onRefresh,
}: {
  info: StoredBookInfo | null
  loading: boolean
  onRefresh: () => void
}) {
  const { t } = useI18n()

  if (loading && !info) {
    return (
      <div className="rounded-md border border-border bg-bg-surface px-4 py-3 text-sm text-text-muted">
        {t('bookDetails.bookInfo.refreshingTitle')}...
      </div>
    )
  }

  if (!info) {
    return <BookInfoEmptyState loading={loading} onRefresh={onRefresh} />
  }

  const rows: BookInfoDetailRow[] = []
  if (info.subtitle) {
    rows.push({
      title: t('bookDetails.bookInfo.subtitle'),
      meta: info.subtitle.value,
      source: info.subtitle,
    })
  }
  if (info.category) {
    rows.push({
      title: t('bookDetails.bookInfo.category'),
      meta: info.category.value.map((item) => item.label).join(', '),
      source: info.category,
    })
  }
  if (info.publisher) {
    rows.push({
      title: t('bookDetails.bookInfo.publisher'),
      meta: info.publisher.value,
      source: info.publisher,
    })
  }
  if (info.publishedDate) {
    rows.push({
      title: t('bookDetails.bookInfo.publishedDate'),
      meta: info.publishedDate.value,
      source: info.publishedDate,
    })
  }
  if (info.language) {
    rows.push({
      title: t('bookDetails.bookInfo.language'),
      meta: info.language.value,
      source: info.language,
    })
  }
  if (info.pageCount) {
    rows.push({
      title: t('bookDetails.bookInfo.pages'),
      meta: String(info.pageCount.value),
      source: info.pageCount,
    })
  }
  if (info.isbn10) {
    rows.push({
      title: 'ISBN-10',
      meta: info.isbn10.value.value,
      source: info.isbn10,
    })
  }
  if (info.isbn13) {
    rows.push({
      title: 'ISBN-13',
      meta: info.isbn13.value.value,
      source: info.isbn13,
    })
  }
  if (info.series) {
    rows.push({
      title: t('bookDetails.bookInfo.series'),
      meta: info.series.value,
      source: info.series,
    })
  }
  if (info.edition) {
    rows.push({
      title: t('bookDetails.bookInfo.edition'),
      meta: info.edition.value,
      source: info.edition,
    })
  }
  if (info.rating) {
    rows.push({
      title: t('bookDetails.bookInfo.rating'),
      meta: formatBookRating(info.rating.value.average, info.rating.value.count),
      source: info.rating,
    })
  }
  if (info.universalIdentifier && shouldShowUniversalIdentifier(info)) {
    rows.push({
      title: t('bookDetails.bookInfo.identifier'),
      meta: `${info.universalIdentifier.value.kind}: ${info.universalIdentifier.value.value}`,
      source: info.universalIdentifier,
    })
  }

  if (rows.length === 0) {
    return <BookInfoEmptyState loading={loading} onRefresh={onRefresh} />
  }

  return (
    <div className="space-y-4">
      {rows.length > 0 && (
        <section>
          <h2 className="text-[11px] font-bold uppercase tracking-wider text-text-muted mb-3">
            {t('bookDetails.bookInfo.editorial')}
          </h2>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          {rows.map((row) => (
            <div
              key={row.title}
              className="rounded-md border border-border bg-bg-surface px-4 py-3"
            >
              <div className="flex items-start gap-3">
                <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-white/6 text-text-secondary">
                  <BookOpen size={16} />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="text-[11px] font-bold uppercase tracking-wider text-text-muted">
                    {row.title}
                  </div>
                  <div className="mt-1 break-words text-sm font-semibold text-text-primary">
                    {row.meta}
                  </div>
                  <BookInfoSourceLine value={row.source} compact />
                </div>
              </div>
            </div>
          ))}
          </div>
        </section>
      )}

    </div>
  )
}

function shouldShowUniversalIdentifier(info: StoredBookInfo): boolean {
  const identifier = info.universalIdentifier?.value
  if (!identifier) return false
  if (identifier.kind !== 'ISBN_10' && identifier.kind !== 'ISBN_13') return true

  const matchingIsbn = identifier.kind === 'ISBN_10' ? info.isbn10 : info.isbn13
  return matchingIsbn?.value.value !== identifier.value
}

function BookInfoEmptyState({
  loading,
}: {
  loading: boolean
  onRefresh: () => void
}) {
  const { t } = useI18n()

  return (
    <div className="rounded-md border border-border bg-bg-surface px-4 py-5">
      <div className="flex items-start gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-white/6 text-text-secondary">
          {loading ? <Loader2 size={18} className="animate-spin" /> : <BookOpen size={18} />}
        </div>
        <div className="min-w-0 flex-1">
          <div className="text-sm font-semibold text-text-primary">
            {loading ? t('bookDetails.bookInfo.refreshingTitle') : t('bookDetails.bookInfo.emptyTitle')}
          </div>
          <p className="mt-1 text-sm leading-relaxed text-text-muted">
            {loading
              ? t('bookDetails.bookInfo.refreshingDescription')
              : t('bookDetails.bookInfo.emptyDescription')}
          </p>
        </div>
      </div>
    </div>
  )
}

function getYouTubeVideoId(url?: string): string | null {
  if (!url) return null
  try {
    const parsedUrl = new URL(url)
    if (parsedUrl.hostname.includes('youtu.be')) {
      return parsedUrl.pathname.split('/').filter(Boolean)[0] ?? null
    }
    return parsedUrl.searchParams.get('v')
  } catch {
    return null
  }
}

function BookInfoSourceLine({
  value,
  compact = false,
}: {
  value: BookInfoSourceMeta
  compact?: boolean
}) {
  return (
    <div className={`${compact ? 'text-[10px]' : 'mt-3 text-[11px]'} font-semibold uppercase tracking-wider text-text-muted`}>
      {formatBookInfoSource(value.source)} - {formatBookInfoConfidence(value.confidence)}
    </div>
  )
}

function formatBookRating(average: number, count?: number): string {
  const rating = `${average.toFixed(1)}/5`
  return count ? `${rating} (${count})` : rating
}

function formatPublishedYear(value?: string | null): string | null {
  const match = value?.match(/\b(\d{4})\b/)
  return match?.[1] ?? null
}

interface BookInfoSourceMeta {
  source: BookInfoSource
  confidence: BookInfoConfidence
}

interface BookInfoDetailRow {
  title: string
  meta: string
  source: BookInfoSourceMeta
}

function formatBookInfoSource(source: BookInfoSource): string {
  const labels: Record<BookInfoSource, string> = {
    'epub-metadata': 'EPUB',
    'google-books': 'Google Books',
    'open-library': 'Open Library',
    youtube: 'YouTube',
    manual: 'Manual',
    derived: 'Estimado',
  }
  return labels[source]
}

function formatBookInfoConfidence(confidence: BookInfoConfidence): string {
  const labels: Record<BookInfoConfidence, string> = {
    high: 'alta confianca',
    medium: 'media confianca',
    low: 'baixa confianca',
  }
  return labels[confidence]
}

function formatDiagnosticStatus(status: BookInfoProviderAttemptDiagnostic['status']): string {
  const labels: Record<BookInfoProviderAttemptDiagnostic['status'], string> = {
    success: 'com dados',
    empty: 'sem dados',
    failed: 'falhou',
  }
  return labels[status]
}

function formatDiagnosticStatusClass(status: BookInfoProviderAttemptDiagnostic['status']): string {
  const base = 'rounded-sm px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider'
  if (status === 'success') return `${base} bg-emerald-400/10 text-emerald-200`
  if (status === 'failed') return `${base} bg-red-400/10 text-red-200`
  return `${base} bg-white/6 text-text-muted`
}

function Stat({ value, label }: { value: number; label: string }) {
  return (
    <div className="flex items-baseline gap-1">
      <span className="text-sm font-bold text-text-primary tabular-nums">{value}</span>
      <span className="text-xs text-text-muted">{label}</span>
    </div>
  )
}

function formatDate(date: Date, locale: string): string {
  return new Intl.DateTimeFormat(locale, {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  }).format(new Date(date))
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function formatTtsRate(rate: number): string {
  return `${rate.toFixed(1)}x`
}

function formatTtsWordsPerMinute(rate: number): string {
  return `${Math.round(rate * 200)} wpm`
}

function getModelBadgeLabel(modelId: string): string {
  const match = modelId.match(/_v(\d+)(?:_(\d+))?/)
  if (!match) return modelId
  const version = match[2] ? `v${match[1]}.${match[2]}` : `v${match[1]}`
  if (modelId.includes('turbo')) return `turbo ${version}`
  if (modelId.includes('flash')) return `flash ${version}`
  return version
}

function VoiceModelBadge({ modelId }: { modelId: string }) {
  const label = getModelBadgeLabel(modelId)
  // v3+ fica verde, v2.x fica índigo, resto cinza
  const match = modelId.match(/_v(\d+)(?:_(\d+))?/)
  const version = match ? parseInt(match[1], 10) + (match[2] ? parseInt(match[2], 10) / 10 : 0) : 0
  const colorClass = version >= 3
    ? 'bg-emerald-500/20 text-emerald-400'
    : version >= 2
      ? 'bg-indigo-500/20 text-indigo-400'
      : 'bg-white/10 text-text-muted'

  return (
    <span className={`inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide ${colorClass}`}>
      {label}
    </span>
  )
}

function PrimeVideoBadge({
  tone,
  children,
}: {
  tone: 'prime' | 'exclusive' | 'neutral' | 'warning'
  children: ReactNode
}) {
  const toneClass = tone === 'prime'
    ? 'bg-[#00a8e1] text-white'
    : tone === 'exclusive'
      ? 'bg-gradient-to-br from-[#7b2cbf] to-[#9d4edd] text-white'
      : tone === 'warning'
        ? 'bg-[#1bcc64] text-white'
        : 'border border-[#555] bg-transparent text-[#aaa]'

  return (
    <span
      className={`inline-flex items-center gap-1 rounded-[2px] px-2 py-[3px] text-[10px] font-extrabold uppercase tracking-[0.08em] ${toneClass}`}
    >
      {children}
    </span>
  )
}

function TtsControlRow({
  icon,
  label,
  value,
  detail,
  avatarUrl,
  isVoiceRow = false,
  onClick,
}: {
  icon: ReactNode
  label: string
  value: string
  detail?: string
  avatarUrl?: string | null
  isVoiceRow?: boolean
  onClick: () => void
}) {
  return (
    <button
      onClick={onClick}
      className="flex w-full items-center gap-3 px-4 py-3 text-left transition-colors duration-150 active:bg-white/5"
    >
      {isVoiceRow && avatarUrl ? (
        <img
          src={avatarUrl}
          alt=""
          className="h-10 w-10 rounded-full object-cover"
        />
      ) : (
        <div className="flex h-10 w-10 items-center justify-center rounded-full bg-white/6 text-text-secondary">
          {icon}
        </div>
      )}
      <div className="min-w-0 flex-1">
        <div className="text-sm font-semibold text-text-primary">{label}</div>
      </div>
      <div className="flex min-w-0 items-center gap-3">
        <div className="min-w-0 text-right">
          <div className={isVoiceRow
            ? 'line-clamp-2 text-sm font-semibold leading-tight text-white'
            : 'truncate text-base font-semibold text-white'}
          >
            {value}
          </div>
          {detail && (
            <div className={isVoiceRow
              ? 'line-clamp-2 text-[11px] leading-tight text-text-muted'
              : 'truncate text-xs text-text-muted'}
            >
              {detail}
            </div>
          )}
        </div>
        <ChevronRight size={18} className="shrink-0 text-text-muted" />
      </div>
    </button>
  )
}
