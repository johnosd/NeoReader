import { useEffect, useState, type ReactNode } from 'react'
import { ArrowLeft, Star, ChevronRight, Globe, Calendar, HardDrive, Sparkles, BookOpen, Bookmark, X, Check, Volume2, Mic2, Gauge } from 'lucide-react'
import { useLiveQuery } from 'dexie-react-hooks'
import { App as CapApp } from '@capacitor/app'
import { Badge, BottomSheet, Button, EmptyState, ListItem, Spinner } from '../components/ui'
import { db } from '../db/database'
import { toggleFavorite } from '../db/books'
import { softDeleteBookmark } from '../db/bookmarks'
import { updateBookSettings } from '../db/bookSettings'
import { getSettings } from '../db/settings'
import { useBookCoverUrl } from '../hooks/useBookCoverUrl'
import { EpubService, type EpubExtras } from '../services/EpubService'
import { ElevenLabsService } from '../services/ElevenLabsService'
import { NativeTtsService } from '../services/NativeTtsService'
import { SpeechifyService } from '../services/SpeechifyService'
import type { Book } from '../types/book'
import type { AppSettings, FontSize, ReaderLineHeight, ReaderTheme } from '../types/settings'
import type { TtsProvider, TtsVoiceOption } from '../types/tts'
import { clampTtsRate, normalizeLanguageTag } from '../utils/language'
import { BOOK_LANGUAGE_OPTIONS, getLanguageLabel, TRANSLATION_LANGUAGE_OPTIONS } from '../utils/languageOptions'
import { resolveReadingState } from '../utils/readingState'
import {
  READER_LINE_HEIGHT_OPTIONS,
  READER_THEME_OPTIONS,
  getReaderLineHeightValue,
  getReaderThemePreviewStyle,
} from '../utils/readerPreferences'

interface BookDetailsScreenProps {
  book: Book
  onBack: () => void
  onRead: (book: Book, startHref?: string) => void
  onOpenSettings: () => void
}

type Tab = 'chapters' | 'bookmarks' | 'settings' | 'details'

const TABS: { id: Tab; label: string }[] = [
  { id: 'chapters', label: 'Capitulos' },
  { id: 'bookmarks', label: 'Marcacoes' },
  { id: 'settings', label: 'Configuracoes' },
  { id: 'details', label: 'Detalhes' },
]

const FONT_SIZES: { value: FontSize; label: string; className: string }[] = [
  { value: 'sm', label: 'A', className: 'text-sm' },
  { value: 'md', label: 'A', className: 'text-base' },
  { value: 'lg', label: 'A', className: 'text-lg' },
  { value: 'xl', label: 'A', className: 'text-xl' },
]

const FONT_PREVIEW_PX: Record<FontSize, number> = { sm: 14, md: 16, lg: 18, xl: 20 }

const TTS_PROVIDERS: Array<{ value: TtsProvider; label: string }> = [
  { value: 'speechify', label: 'Speechify' },
  { value: 'elevenlabs', label: 'ElevenLabs' },
  { value: 'native', label: 'Nativo' },
]

const TTS_RATE_OPTIONS = [0.8, 0.9, 1, 1.1, 1.2]
const INITIAL_TTS_VOICE_COUNT = 12

function isTtsProviderConfigured(provider: TtsProvider, settings: AppSettings) {
  if (provider === 'speechify') return Boolean(settings.speechifyApiKey)
  if (provider === 'elevenlabs') return Boolean(settings.elevenLabsApiKey)
  return true
}

function resolveEffectiveTtsProvider(provider: TtsProvider, settings: AppSettings): TtsProvider {
  return isTtsProviderConfigured(provider, settings) ? provider : 'native'
}

export function BookDetailsScreen({ book, onBack, onRead, onOpenSettings }: BookDetailsScreenProps) {
  const [activeTab, setActiveTab] = useState<Tab>('chapters')
  const [descExpanded, setDescExpanded] = useState(false)
  const [extras, setExtras] = useState<EpubExtras | null>(null)
  const [extrasLoading, setExtrasLoading] = useState(true)
  const [defaultFontSize, setDefaultFontSize] = useState<FontSize>('md')
  const [defaultLineHeight, setDefaultLineHeight] = useState<ReaderLineHeight>('comfortable')
  const [defaultReaderTheme, setDefaultReaderTheme] = useState<ReaderTheme>('dark')
  const [appSettings, setAppSettings] = useState<AppSettings>({
    speechifyApiKey: '',
    elevenLabsApiKey: '',
    translationTargetLang: 'pt-BR',
  })
  const [bookLanguageSheetOpen, setBookLanguageSheetOpen] = useState(false)
  const [translationTargetLangSheetOpen, setTranslationTargetLangSheetOpen] = useState(false)
  const [ttsProviderSheetOpen, setTtsProviderSheetOpen] = useState(false)
  const [ttsVoiceSheetOpen, setTtsVoiceSheetOpen] = useState(false)
  const [ttsSpeedSheetOpen, setTtsSpeedSheetOpen] = useState(false)
  const [ttsVoiceOptions, setTtsVoiceOptions] = useState<TtsVoiceOption[]>([])
  const [showAllTtsVoices, setShowAllTtsVoices] = useState(false)
  const [ttsVoiceLoading, setTtsVoiceLoading] = useState(false)
  const [ttsVoiceError, setTtsVoiceError] = useState<string | null>(null)

  const liveBook = useLiveQuery(() => db.books.get(book.id!), [book.id]) ?? book
  const progress = useLiveQuery(() => db.progress.where('bookId').equals(book.id!).first(), [book.id])
  const bookmarks = useLiveQuery(
    () => db.bookmarks.where('bookId').equals(book.id!).and((bookmark) => !bookmark.deletedAt).sortBy('createdAt'),
    [book.id],
  ) ?? []
  const vocabCount = useLiveQuery(() => db.vocabulary.where('bookId').equals(book.id!).count(), [book.id]) ?? 0
  const bookSettingsRow = useLiveQuery(() => db.bookSettings.where('bookId').equals(book.id!).first(), [book.id])

  const fontSize: FontSize = bookSettingsRow?.fontSize ?? defaultFontSize
  const lineHeight: ReaderLineHeight = bookSettingsRow?.lineHeight ?? defaultLineHeight
  const readerTheme: ReaderTheme = bookSettingsRow?.readerTheme ?? defaultReaderTheme
  const selectedTtsProvider: TtsProvider = bookSettingsRow?.ttsProvider ?? 'speechify'
  const effectiveTtsProvider = resolveEffectiveTtsProvider(selectedTtsProvider, appSettings)
  const ttsRate = clampTtsRate(bookSettingsRow?.ttsRate ?? 1)

  useEffect(() => {
    getSettings().then((settings) => {
      setDefaultFontSize(settings.readerDefaults.defaultFontSize)
      setDefaultLineHeight(settings.readerDefaults.lineHeight)
      setDefaultReaderTheme(settings.readerDefaults.readerTheme)
      setAppSettings(settings.appSettings)
    })
  }, [])

  useEffect(() => {
    setExtrasLoading(true)
    EpubService.parseExtras(liveBook.fileBlob).then((result) => {
      setExtras(result)
      setExtrasLoading(false)
    })
  }, [liveBook.fileBlob])

  useEffect(() => {
    const listener = CapApp.addListener('backButton', onBack)
    return () => { void listener.then((value) => value.remove()) }
  }, [onBack])

  const coverUrl = useBookCoverUrl(liveBook.id)
  const { percentage: pct, readingStatus } = resolveReadingState(liveBook, progress)
  const detectedBookLanguage = extras?.language ? normalizeLanguageTag(extras.language, 'en') : null
  const effectiveBookLanguage = normalizeLanguageTag(bookSettingsRow?.bookLanguage ?? detectedBookLanguage ?? 'en', 'en')
  const langLabel = getLanguageLabel(effectiveBookLanguage)
  const languageSettingMeta = bookSettingsRow?.bookLanguage
    ? `${getLanguageLabel(bookSettingsRow.bookLanguage) ?? bookSettingsRow.bookLanguage} - manual`
    : detectedBookLanguage
      ? `${getLanguageLabel(detectedBookLanguage) ?? detectedBookLanguage} - automatico`
      : 'Automatico'
  const translationTargetLangMeta = bookSettingsRow?.translationTargetLang
    ? `${getLanguageLabel(bookSettingsRow.translationTargetLang) ?? bookSettingsRow.translationTargetLang} - neste livro`
    : `${getLanguageLabel(appSettings.translationTargetLang) ?? appSettings.translationTargetLang} - padrao do app`
  void languageSettingMeta
  void translationTargetLangMeta
  const previewStyle = getReaderThemePreviewStyle(readerTheme)
  const providerConfigured = isTtsProviderConfigured(selectedTtsProvider, appSettings)
  const selectedProviderLabel = TTS_PROVIDERS.find((option) => option.value === selectedTtsProvider)?.label ?? selectedTtsProvider
  const effectiveProviderLabel = TTS_PROVIDERS.find((option) => option.value === effectiveTtsProvider)?.label ?? effectiveTtsProvider
  const providerInFallback = effectiveTtsProvider !== selectedTtsProvider
  const selectedVoiceLabel = !providerConfigured
    ? `${selectedProviderLabel} indisponivel`
    : effectiveTtsProvider === 'speechify'
      ? (bookSettingsRow?.ttsSpeechifyVoiceLabel ?? 'Voz padrao do provider')
      : effectiveTtsProvider === 'elevenlabs'
        ? (bookSettingsRow?.ttsElevenLabsVoiceLabel ?? 'Voz padrao do provider')
        : (bookSettingsRow?.ttsNativeVoiceLabel ?? 'Voz padrao do dispositivo')
  const selectedVoiceAvatarUrl = providerConfigured && effectiveTtsProvider === 'speechify'
    ? (bookSettingsRow?.ttsSpeechifyVoiceAvatarUrl ?? null)
    : null
  const selectedVoiceMeta = providerConfigured
    ? `${selectedVoiceLabel} - ${getLanguageLabel(effectiveBookLanguage) ?? effectiveBookLanguage}`
    : 'Abra as Configuracoes gerais para configurar a API key'

  const visibleTtsVoiceOptions = showAllTtsVoices
    ? ttsVoiceOptions
    : ttsVoiceOptions.slice(0, INITIAL_TTS_VOICE_COUNT)

  async function loadVoiceOptions(provider: TtsProvider) {
    setTtsVoiceLoading(true)
    setTtsVoiceError(null)
    try {
      if (provider === 'speechify') {
        if (!appSettings.speechifyApiKey) {
          setTtsVoiceOptions([])
          setTtsVoiceError('Configure a API key da Speechify nas Configuracoes gerais.')
          return
        }
        setTtsVoiceOptions(await SpeechifyService.listCompatibleVoices(effectiveBookLanguage, appSettings.speechifyApiKey))
        return
      }

      if (provider === 'elevenlabs') {
        if (!appSettings.elevenLabsApiKey) {
          setTtsVoiceOptions([])
          setTtsVoiceError('Configure a API key da ElevenLabs nas Configuracoes gerais.')
          return
        }
        setTtsVoiceOptions(await ElevenLabsService.listCompatibleVoices(effectiveBookLanguage, appSettings.elevenLabsApiKey))
        return
      }

      setTtsVoiceOptions(await NativeTtsService.listCompatibleVoices(effectiveBookLanguage))
    } catch {
      setTtsVoiceOptions([])
      setTtsVoiceError('Nao foi possivel carregar as vozes compativeis.')
    } finally {
      setTtsVoiceLoading(false)
    }
  }

  useEffect(() => {
    if (!ttsVoiceSheetOpen) return
    setShowAllTtsVoices(false)
    void loadVoiceOptions(selectedTtsProvider)
  }, [ttsVoiceSheetOpen, selectedTtsProvider, effectiveBookLanguage, appSettings.speechifyApiKey, appSettings.elevenLabsApiKey])

  function updateProvider(provider: TtsProvider) {
    if (!isTtsProviderConfigured(provider, appSettings)) {
      setTtsProviderSheetOpen(false)
      onOpenSettings()
      return
    }

    void updateBookSettings(book.id!, { ttsProvider: provider })
    setTtsProviderSheetOpen(false)
  }

  function updateVoice(option: TtsVoiceOption | null) {
    if (selectedTtsProvider === 'speechify') {
      void updateBookSettings(book.id!, {
        ttsSpeechifyVoiceId: option?.id ?? null,
        ttsSpeechifyVoiceLabel: option?.label ?? null,
        ttsSpeechifyVoiceAvatarUrl: option?.avatarUrl ?? null,
      })
    } else if (selectedTtsProvider === 'elevenlabs') {
      void updateBookSettings(book.id!, {
        ttsElevenLabsVoiceId: option?.id ?? null,
        ttsElevenLabsVoiceLabel: option?.label ?? null,
      })
    } else {
      void updateBookSettings(book.id!, {
        ttsNativeVoiceKey: option?.id ?? null,
        ttsNativeVoiceLabel: option?.label ?? null,
      })
    }
    setTtsVoiceSheetOpen(false)
  }

  function openVoiceSettings() {
    if (!providerConfigured) {
      onOpenSettings()
      return
    }
    setTtsVoiceSheetOpen(true)
  }

  return (
    <div className="min-h-screen bg-bg-base text-text-primary pb-16">
      <header className="px-4 pt-10 pb-4 flex items-center justify-between gap-3">
        <button
          onClick={onBack}
          className="p-2 -ml-1 rounded-md text-text-secondary active:scale-90 transition-transform"
          aria-label="Voltar"
        >
          <ArrowLeft size={20} />
        </button>
        <p className="flex-1 text-sm text-text-muted truncate text-center">{liveBook.title}</p>
        <button
          onClick={() => book.id !== undefined && void toggleFavorite(book.id)}
          className="p-2 -mr-1 rounded-md active:scale-90 transition-transform"
          aria-label={liveBook.isFavorite ? 'Remover dos favoritos' : 'Favoritar'}
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
              ? <img src={coverUrl} alt={liveBook.title} className="w-full h-full object-cover" />
              : <BookOpen size={40} className="text-text-muted" />
            }
          </div>
          <div className="text-center">
            <h1 className="text-2xl font-serif font-bold text-text-primary leading-snug">
              {liveBook.title}
            </h1>
            {liveBook.author && (
              <p className="text-sm text-text-muted mt-1">{liveBook.author}</p>
            )}
          </div>
        </div>

        <div className="px-4 flex flex-col gap-3">
          <Button variant="primary" tone="purple" fullWidth onClick={() => onRead(liveBook)}>
            {readingStatus === 'finished'
              ? 'Ler novamente'
              : readingStatus === 'reading'
                ? `Continuar leitura - ${pct}%`
                : 'Comecar a ler'}
          </Button>
          <Button
            variant="outline" tone="purple" fullWidth disabled
            leftIcon={<Sparkles size={16} />}
            rightIcon={<Badge tone="neutral">em breve</Badge>}
          >
            Falar com o livro
          </Button>
        </div>

        <div className="px-4">
          <Section title="Sobre o livro">
            {extras?.description && (
              <div className="mb-4">
                <p className={`text-sm text-text-secondary leading-relaxed ${descExpanded ? '' : 'line-clamp-3'}`}>
                  {extras.description}
                </p>
                <button
                  onClick={() => setDescExpanded((value) => !value)}
                  className="text-xs text-purple-light mt-1 active:opacity-60"
                >
                  {descExpanded ? 'Mostrar menos' : 'Leia mais'}
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
                {readingStatus === 'finished' ? 'Concluido' : `${pct}%`}
              </span>
            </div>
            <div className="flex gap-4 mt-3">
              <Stat value={bookmarks.length} label="marcadores" />
              <Stat value={vocabCount} label="vocabulario" />
            </div>
          </Section>
        </div>

        <div>
          <div className="overflow-x-auto px-4 border-b border-border" style={{ scrollbarWidth: 'none' }}>
            <div className="flex gap-1 min-w-max">
              {TABS.map((tab) => {
                const active = activeTab === tab.id
                const count = tab.id === 'bookmarks' && bookmarks.length > 0 ? bookmarks.length : null
                return (
                  <button
                    key={tab.id}
                    onClick={() => setActiveTab(tab.id)}
                    className={`relative flex items-center gap-1.5 px-4 py-3 text-sm font-semibold whitespace-nowrap transition-colors duration-150 ${
                      active ? 'text-purple-light' : 'text-text-muted active:text-text-secondary'
                    }`}
                  >
                    {tab.label}
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
            {activeTab === 'chapters' && (() => {
              const topChapters = extras?.toc ?? []
              return extrasLoading ? (
                <div className="flex justify-center py-8">
                  <Spinner size={20} tone="purple" label="Carregando capitulos" />
                </div>
              ) : topChapters.length > 0 ? (
                <div className="rounded-md bg-bg-surface border border-border overflow-hidden">
                  {topChapters.map((chapter, index) => (
                    <ListItem
                      key={`${chapter.href}-${index}`}
                      title={chapter.label}
                      trailing={<ChevronRight size={16} />}
                      onClick={() => onRead(liveBook, chapter.href)}
                      divider={index < topChapters.length - 1}
                    />
                  ))}
                </div>
              ) : (
                <EmptyState
                  icon={<BookOpen size={32} />}
                  title="Indice nao disponivel"
                  description="Este EPUB nao contem um indice de capitulos."
                />
              )
            })()}

            {activeTab === 'bookmarks' && (
              bookmarks.length > 0 ? (
                <div className="rounded-md bg-bg-surface border border-border overflow-hidden">
                  {bookmarks.map((bookmark, index) => (
                    <ListItem
                      key={bookmark.id}
                      leading={<Bookmark size={16} className="text-purple-light" />}
                      title={bookmark.label}
                      meta={`${bookmark.percentage}%`}
                      onClick={() => onRead(liveBook, bookmark.cfi)}
                      divider={index < bookmarks.length - 1}
                      trailing={(
                        <button
                          onClick={(event) => {
                            event.stopPropagation()
                            if (bookmark.id !== undefined) void softDeleteBookmark(bookmark.id)
                          }}
                          className="p-2 -m-2 text-text-muted active:text-error transition-colors"
                          aria-label="Remover marcacao"
                        >
                          <X size={15} />
                        </button>
                      )}
                    />
                  ))}
                </div>
              ) : (
                <EmptyState
                  icon={<Bookmark size={32} />}
                  title="Nenhuma marcacao"
                  description="Selecione um paragrafo durante a leitura e use Marcar para salvar posicoes."
                />
              )
            )}

            {activeTab === 'settings' && (
              <div className="rounded-md p-4 bg-bg-surface border border-border flex flex-col gap-4">
                <div>
                  <p className="text-[11px] font-bold uppercase tracking-wider text-text-muted mb-3">
                    Tamanho de fonte
                  </p>
                  <div className="flex gap-2">
                    {FONT_SIZES.map(({ value, label, className }) => {
                      const active = fontSize === value
                      return (
                        <button
                          key={value}
                          onClick={() => void updateBookSettings(book.id!, { fontSize: value })}
                          className={`flex-1 py-3 rounded-md font-semibold transition-all duration-150 active:scale-95 border ${className} ${
                            active
                              ? 'bg-purple-primary/15 border-purple-primary/50 text-purple-light'
                              : 'bg-bg-base border-border text-text-muted'
                          }`}
                          aria-pressed={active}
                        >
                          {label}
                        </button>
                      )
                    })}
                  </div>
                  <p
                    className="mt-4 text-center leading-relaxed text-text-secondary"
                    style={{ fontSize: FONT_PREVIEW_PX[fontSize] }}
                  >
                    The quick brown fox jumps over the lazy dog.
                  </p>
                </div>

                <div>
                  <p className="text-[11px] font-bold uppercase tracking-wider text-text-muted mb-3">
                    Espacamento
                  </p>
                  <div className="grid grid-cols-3 gap-2">
                    {READER_LINE_HEIGHT_OPTIONS.map(({ value, label }) => {
                      const active = lineHeight === value
                      return (
                        <button
                          key={value}
                          onClick={() => void updateBookSettings(book.id!, { lineHeight: value })}
                          className={`rounded-md px-3 py-3 text-sm font-semibold transition-all duration-150 active:scale-95 border ${
                            active
                              ? 'bg-purple-primary/15 border-purple-primary/50 text-purple-light'
                              : 'bg-bg-base border-border text-text-muted'
                          }`}
                          aria-pressed={active}
                        >
                          {label}
                        </button>
                      )
                    })}
                  </div>
                </div>

                <div>
                  <p className="text-[11px] font-bold uppercase tracking-wider text-text-muted mb-3">
                    Tema do leitor
                  </p>
                  <div className="grid grid-cols-3 gap-2">
                    {READER_THEME_OPTIONS.map(({ value, label }) => {
                      const active = readerTheme === value
                      return (
                        <button
                          key={value}
                          onClick={() => void updateBookSettings(book.id!, { readerTheme: value })}
                          className={`rounded-md px-3 py-3 text-sm font-semibold transition-all duration-150 active:scale-95 border ${
                            active
                              ? 'bg-purple-primary/15 border-purple-primary/50 text-purple-light'
                              : 'bg-bg-base border-border text-text-muted'
                          }`}
                          aria-pressed={active}
                        >
                          {label}
                        </button>
                      )
                    })}
                  </div>

                  <div className="mt-4 rounded-xl border px-4 py-4" style={previewStyle}>
                    <p
                      className="font-serif"
                      style={{
                        fontSize: FONT_PREVIEW_PX[fontSize],
                        lineHeight: getReaderLineHeightValue(lineHeight),
                        color: previewStyle.color,
                      }}
                    >
                      The quick brown fox jumps over the lazy dog.
                    </p>
                  </div>
                </div>

                <div>
                  <p className="text-[11px] font-bold uppercase tracking-wider text-text-muted mb-3">
                    Idioma do livro
                  </p>
                  <div className="-mx-4">
                    <ListItem
                      leading={<Globe size={18} />}
                      title="Idioma original do livro"
                      meta={(
                        <div className="flex flex-wrap items-center gap-1.5 pt-1">
                          <PrimeVideoBadge tone="exclusive">
                            {getLanguageLabel(bookSettingsRow?.bookLanguage ?? detectedBookLanguage ?? effectiveBookLanguage) ?? effectiveBookLanguage}
                          </PrimeVideoBadge>
                          <PrimeVideoBadge tone={bookSettingsRow?.bookLanguage ? 'prime' : 'neutral'}>
                            {bookSettingsRow?.bookLanguage ? 'Manual' : 'Auto'}
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
                    Traducao
                  </p>
                  <div className="-mx-4">
                    <ListItem
                      leading={<Globe size={18} />}
                      title="Idioma de destino da traducao"
                      meta={(
                        <div className="flex flex-wrap items-center gap-1.5 pt-1">
                          <PrimeVideoBadge tone="exclusive">
                            {getLanguageLabel(bookSettingsRow?.translationTargetLang ?? appSettings.translationTargetLang) ?? (bookSettingsRow?.translationTargetLang ?? appSettings.translationTargetLang)}
                          </PrimeVideoBadge>
                          <PrimeVideoBadge tone={bookSettingsRow?.translationTargetLang ? 'prime' : 'neutral'}>
                            {bookSettingsRow?.translationTargetLang ? 'Neste livro' : 'Padrao do app'}
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
                  <div className="-mx-4 rounded-md border border-border overflow-hidden">
                    <ListItem
                      leading={<Volume2 size={18} />}
                      title="Provider"
                      meta={(
                        <div className="flex flex-wrap items-center gap-1.5 pt-1">
                          <PrimeVideoBadge tone="exclusive">
                            Salvo - {selectedProviderLabel}
                          </PrimeVideoBadge>
                          {providerInFallback ? (
                            <>
                              <PrimeVideoBadge tone="neutral">
                                Em uso - {effectiveProviderLabel}
                              </PrimeVideoBadge>
                              <PrimeVideoBadge tone="warning">
                                Key pendente
                              </PrimeVideoBadge>
                            </>
                          ) : (
                            <PrimeVideoBadge tone="prime">
                              Ativo
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
                        Voz e velocidade
                      </p>
                      <div className="overflow-hidden rounded-2xl border border-white/6 bg-[#1f1f1f]">
                        <TtsControlRow
                          icon={<Mic2 size={18} />}
                          label="Voz"
                          value={selectedVoiceLabel}
                          detail={selectedVoiceMeta}
                          avatarUrl={selectedVoiceAvatarUrl}
                          onClick={openVoiceSettings}
                        />
                        <div className="mx-4 h-px bg-white/6" />
                        <TtsControlRow
                          icon={<Gauge size={18} />}
                          label="Velocidade"
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
              <div className="rounded-md bg-bg-surface border border-border overflow-hidden">
                {langLabel && (
                  <ListItem leading={<Globe size={18} />} title="Idioma" meta={langLabel} divider />
                )}
                <ListItem
                  leading={<Calendar size={18} />}
                  title="Adicionado"
                  meta={formatDate(liveBook.addedAt)}
                  divider={!!liveBook.lastOpenedAt}
                />
                {liveBook.lastOpenedAt && (
                  <ListItem
                    leading={<Calendar size={18} />}
                    title="Ultimo acesso"
                    meta={formatDate(liveBook.lastOpenedAt)}
                    divider
                  />
                )}
                <ListItem
                  leading={<HardDrive size={18} />}
                  title="Tamanho"
                  meta={formatFileSize(liveBook.fileBlob.size)}
                  divider={false}
                />
              </div>
            )}
          </div>
        </div>
      </main>

      <BottomSheet
        open={bookLanguageSheetOpen}
        onClose={() => setBookLanguageSheetOpen(false)}
        title="Idioma do livro"
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
                  void updateBookSettings(book.id!, { bookLanguage: option.code })
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
        title="Idioma da traducao"
      >
        <div className="-mx-4">
          <ListItem
            title="Usar padrao do app"
            meta={getLanguageLabel(appSettings.translationTargetLang) ?? appSettings.translationTargetLang}
            trailing={!bookSettingsRow?.translationTargetLang ? <Check size={18} className="text-purple-light" /> : undefined}
            onClick={() => {
              void updateBookSettings(book.id!, { translationTargetLang: null })
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
                  void updateBookSettings(book.id!, { translationTargetLang: option.code })
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
        title="Provider de TTS"
      >
        <div className="-mx-4">
          {TTS_PROVIDERS.map((option) => {
            const active = selectedTtsProvider === option.value
            const meta = option.value === 'speechify'
              ? (appSettings.speechifyApiKey ? 'Configurado' : 'API key pendente')
              : option.value === 'elevenlabs'
                ? (appSettings.elevenLabsApiKey ? 'Configurado' : 'API key pendente')
                : 'Disponivel no dispositivo'
            return (
              <ListItem
                key={option.value}
                title={option.label}
                meta={meta}
                trailing={active ? <Check size={18} className="text-purple-light" /> : undefined}
                onClick={() => updateProvider(option.value)}
                divider={option.value !== TTS_PROVIDERS[TTS_PROVIDERS.length - 1].value}
              />
            )
          })}
        </div>
      </BottomSheet>

      <BottomSheet
        open={ttsVoiceSheetOpen}
        onClose={() => setTtsVoiceSheetOpen(false)}
        title="Voz do livro"
      >
        {ttsVoiceLoading ? (
          <div className="flex justify-center py-8">
            <Spinner size={20} tone="purple" label="Carregando vozes" />
          </div>
        ) : ttsVoiceError ? (
          <EmptyState
            icon={<Volume2 size={28} />}
            title="Vozes indisponiveis"
            description={ttsVoiceError}
          />
        ) : (
          <div className="-mx-4">
            <ListItem
              title="Usar voz padrao"
              meta={selectedTtsProvider === 'native' ? 'Voz padrao do dispositivo' : 'Definida automaticamente pelo provider'}
              trailing={
                ((selectedTtsProvider === 'speechify' && !bookSettingsRow?.ttsSpeechifyVoiceId) ||
                (selectedTtsProvider === 'elevenlabs' && !bookSettingsRow?.ttsElevenLabsVoiceId) ||
                (selectedTtsProvider === 'native' && !bookSettingsRow?.ttsNativeVoiceKey))
                  ? <Check size={18} className="text-purple-light" />
                  : undefined
              }
              onClick={() => updateVoice(null)}
              divider={visibleTtsVoiceOptions.length > 0}
            />
            {visibleTtsVoiceOptions.map((voice, index) => {
              const active = selectedTtsProvider === 'speechify'
                ? bookSettingsRow?.ttsSpeechifyVoiceId === voice.id
                : selectedTtsProvider === 'elevenlabs'
                  ? bookSettingsRow?.ttsElevenLabsVoiceId === voice.id
                  : bookSettingsRow?.ttsNativeVoiceKey === voice.id
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
                  meta={[voice.locale, voice.meta].filter(Boolean).join(' - ')}
                  trailing={active ? <Check size={18} className="text-purple-light" /> : undefined}
                  onClick={() => updateVoice(voice)}
                  divider={index < visibleTtsVoiceOptions.length - 1 || ttsVoiceOptions.length > visibleTtsVoiceOptions.length}
                />
              )
            })}
            {ttsVoiceOptions.length > visibleTtsVoiceOptions.length && (
              <button
                onClick={() => setShowAllTtsVoices(true)}
                className="w-full border-t border-white/5 px-4 py-3 text-sm font-semibold text-purple-light transition-colors duration-150 active:bg-white/5"
              >
                Mostrar mais vozes ({ttsVoiceOptions.length - visibleTtsVoiceOptions.length})
              </button>
            )}
          </div>
        )}
      </BottomSheet>

      <BottomSheet
        open={ttsSpeedSheetOpen}
        onClose={() => setTtsSpeedSheetOpen(false)}
        title="Velocidade do TTS"
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
                  void updateBookSettings(book.id!, { ttsRate: value })
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

function Stat({ value, label }: { value: number; label: string }) {
  return (
    <div className="flex items-baseline gap-1">
      <span className="text-sm font-bold text-text-primary tabular-nums">{value}</span>
      <span className="text-xs text-text-muted">{label}</span>
    </div>
  )
}

function formatDate(date: Date): string {
  return new Intl.DateTimeFormat('pt-BR', {
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
  onClick,
}: {
  icon: ReactNode
  label: string
  value: string
  detail?: string
  avatarUrl?: string | null
  onClick: () => void
}) {
  const isVoiceRow = label === 'Voz'

  return (
    <button
      onClick={onClick}
      className="flex w-full items-center gap-3 px-4 py-3 text-left transition-colors duration-150 active:bg-white/5"
    >
      {label === 'Voz' && avatarUrl ? (
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
