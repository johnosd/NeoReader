import { useEffect, useState } from 'react'
import { getSettings } from '../db/settings'
import { getBookSettings, updateBookSettings } from '../db/bookSettings'
import { EpubService } from '../services/EpubService'
import { BookFileResolver } from '../services/BookFileResolver'
import { clampTtsRate, normalizeLanguageTag } from '../utils/language'
import type { Book } from '../types/book'
import type { FontSize, ReaderFontFamily, ReaderLineHeight, ReaderTheme } from '../types/settings'
import type { TtsPlaybackConfig, TtsProvider } from '../types/tts'
import type { ReaderStyleMode } from '../components/reader/ReaderAppearanceControls'

// Campos de aparência que podem ser persistidos por livro
export type AppearancePatch = {
  fontSize?: FontSize
  lineHeight?: ReaderLineHeight
  readerTheme?: ReaderTheme
  fontFamily?: ReaderFontFamily
  overrideBookFont?: boolean
  overrideBookColors?: boolean
}

export type TtsConfigPatch = {
  provider?: TtsProvider
  rate?: number
}

export interface UseReaderAppearanceResult {
  isReady: boolean
  fontSize: FontSize
  lineHeight: ReaderLineHeight
  readerTheme: ReaderTheme
  fontFamily: ReaderFontFamily
  overrideBookFont: boolean
  overrideBookColors: boolean
  bookLanguage: string
  translationTargetLang: string
  ttsConfig: TtsPlaybackConfig
  ttsEngine: TtsProvider
  ttsProviderAvailability: Record<TtsProvider, boolean>
  applyAppearancePatch: (patch: AppearancePatch) => void
  applyTtsConfigPatch: (patch: TtsConfigPatch) => void
  switchToNativeTts: () => void
  handleReaderStyleModeChange: (mode: ReaderStyleMode) => void
}

function resolveBookLanguage(candidate?: string | null): string {
  return normalizeLanguageTag(candidate, 'en')
}

function resolveTtsProvider(
  selectedProvider: TtsProvider,
  settings: Awaited<ReturnType<typeof getSettings>>['appSettings'],
): TtsProvider {
  if (selectedProvider === 'speechify') {
    return settings.speechifyApiKey ? 'speechify' : 'native'
  }
  if (selectedProvider === 'elevenlabs') {
    return settings.elevenLabsApiKey ? 'elevenlabs' : 'native'
  }
  return 'native'
}

function getTtsProviderAvailability(
  settings: Awaited<ReturnType<typeof getSettings>>['appSettings'],
): Record<TtsProvider, boolean> {
  return {
    native: true,
    speechify: Boolean(settings.speechifyApiKey),
    elevenlabs: Boolean(settings.elevenLabsApiKey),
  }
}

function resolveTtsProviderFromAvailability(
  selectedProvider: TtsProvider,
  availability: Record<TtsProvider, boolean>,
): TtsProvider {
  return availability[selectedProvider] ? selectedProvider : 'native'
}

export function useReaderAppearance(book: Book): UseReaderAppearanceResult {
  const [readySource, setReadySource] = useState<{ bookId: Book['id']; source: string } | null>(null)
  const [fontSize, setFontSize] = useState<FontSize>('md')
  const [lineHeight, setLineHeight] = useState<ReaderLineHeight>('comfortable')
  const [readerTheme, setReaderTheme] = useState<ReaderTheme>('dark')
  const [fontFamily, setFontFamily] = useState<ReaderFontFamily>('classic')
  const [overrideBookFont, setOverrideBookFont] = useState(true)
  const [overrideBookColors, setOverrideBookColors] = useState(true)
  const [bookLanguage, setBookLanguage] = useState('en')
  const [translationTargetLang, setTranslationTargetLang] = useState('pt-BR')
  const [ttsConfig, setTtsConfig] = useState<TtsPlaybackConfig>({
    provider: 'native',
    language: 'en',
    rate: 1,
  })
  const [ttsEngine, setTtsEngine] = useState<TtsProvider>('native')
  const [ttsProviderAvailability, setTtsProviderAvailability] = useState<Record<TtsProvider, boolean>>({
    native: true,
    speechify: false,
    elevenlabs: false,
  })

  // Carrega preferências: configuração por livro (override) > global > padrão
  useEffect(() => {
    let cancelled = false

    const source = resolveBookSourceKey(book)

    void Promise.all([
      getSettings(),
      getBookSettings(book.id!),
      BookFileResolver.resolveFile(book).then((file) => EpubService.parseExtras(file, book.id)),
    ]).then(([s, bs, extras]) => {
      if (cancelled) return

      const resolvedBookLanguage = resolveBookLanguage(bs.bookLanguage ?? extras.language)
      const selectedProvider = bs.ttsProvider ?? 'speechify'
      const resolvedFontFamily = bs.fontFamily ?? s.readerDefaults.fontFamily
      const providerAvailability = getTtsProviderAvailability(s.appSettings)

      setFontSize(bs.fontSize ?? s.readerDefaults.defaultFontSize)
      setLineHeight(bs.lineHeight ?? s.readerDefaults.lineHeight)
      setReaderTheme(bs.readerTheme ?? s.readerDefaults.readerTheme)
      setFontFamily(resolvedFontFamily)
      setOverrideBookFont(bs.overrideBookFont ?? (bs.fontFamily ? resolvedFontFamily !== 'publisher' : s.readerDefaults.overrideBookFont))
      setOverrideBookColors(bs.overrideBookColors ?? s.readerDefaults.overrideBookColors)
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
      setTtsProviderAvailability(providerAvailability)
      setTtsEngine(resolveTtsProvider(selectedProvider, s.appSettings))
      setReadySource({ bookId: book.id, source })
    }).catch(() => {
      if (cancelled) return
      setReadySource({ bookId: book.id, source })
    })

    return () => {
      cancelled = true
    }
  }, [book, book.fileBlob, book.id, book.storageMode, book.uri])

  const isReady = readySource?.bookId === book.id && readySource?.source === resolveBookSourceKey(book)

  function applyAppearancePatch(patch: AppearancePatch) {
    if (patch.fontSize) setFontSize(patch.fontSize)
    if (patch.lineHeight) setLineHeight(patch.lineHeight)
    if (patch.readerTheme) setReaderTheme(patch.readerTheme)
    if (patch.fontFamily) setFontFamily(patch.fontFamily)
    if (patch.overrideBookFont !== undefined) setOverrideBookFont(patch.overrideBookFont)
    if (patch.overrideBookColors !== undefined) setOverrideBookColors(patch.overrideBookColors)
    void updateBookSettings(book.id!, patch)
  }

  function applyTtsConfigPatch(patch: TtsConfigPatch) {
    const settingsPatch: { ttsProvider?: TtsProvider; ttsRate?: number } = {}
    let nextProvider: TtsProvider | undefined
    let nextRate: number | undefined

    if (patch.provider !== undefined && ttsProviderAvailability[patch.provider]) {
      nextProvider = patch.provider
      settingsPatch.ttsProvider = patch.provider
    }

    if (patch.rate !== undefined) {
      nextRate = clampTtsRate(patch.rate)
      settingsPatch.ttsRate = nextRate
    }

    if (nextProvider === undefined && nextRate === undefined) return

    setTtsConfig((current) => ({
      ...current,
      ...(nextProvider !== undefined ? { provider: nextProvider } : {}),
      ...(nextRate !== undefined ? { rate: nextRate } : {}),
    }))

    if (nextProvider !== undefined) {
      setTtsEngine(resolveTtsProviderFromAvailability(nextProvider, ttsProviderAvailability))
    }

    void updateBookSettings(book.id!, settingsPatch)
  }

  function switchToNativeTts() {
    setTtsConfig((current) => ({ ...current, provider: 'native' }))
    setTtsEngine('native')
    void updateBookSettings(book.id!, { ttsProvider: 'native' })
  }

  function handleReaderStyleModeChange(mode: ReaderStyleMode) {
    if (mode === 'original') {
      applyAppearancePatch({ fontFamily: 'publisher', overrideBookFont: false, overrideBookColors: false })
      return
    }
    applyAppearancePatch({
      fontFamily: fontFamily === 'publisher' ? 'classic' : fontFamily,
      overrideBookFont: true,
      overrideBookColors: true,
    })
  }

  return {
    isReady,
    fontSize,
    lineHeight,
    readerTheme,
    fontFamily,
    overrideBookFont,
    overrideBookColors,
    bookLanguage,
    translationTargetLang,
    ttsConfig,
    ttsEngine,
    ttsProviderAvailability,
    applyAppearancePatch,
    applyTtsConfigPatch,
    switchToNativeTts,
    handleReaderStyleModeChange,
  }
}

function resolveBookSourceKey(book: Book): string {
  return book.storageMode === 'external'
    ? `external:${book.uri ?? ''}`
    : `embedded:${book.fileName ?? book.id ?? ''}`
}
