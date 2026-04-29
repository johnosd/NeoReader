import { useEffect, useState } from 'react'
import { getSettings } from '../db/settings'
import { getBookSettings, updateBookSettings } from '../db/bookSettings'
import { EpubService } from '../services/EpubService'
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

export interface UseReaderAppearanceResult {
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
  applyAppearancePatch: (patch: AppearancePatch) => void
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

export function useReaderAppearance(book: Book): UseReaderAppearanceResult {
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

  // Carrega preferências: configuração por livro (override) > global > padrão
  useEffect(() => {
    void Promise.all([
      getSettings(),
      getBookSettings(book.id!),
      EpubService.parseExtras(book.fileBlob, book.id),
    ]).then(([s, bs, extras]) => {
      const resolvedBookLanguage = resolveBookLanguage(bs.bookLanguage ?? extras.language)
      const selectedProvider = bs.ttsProvider ?? 'speechify'
      const resolvedFontFamily = bs.fontFamily ?? s.readerDefaults.fontFamily

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
      setTtsEngine(resolveTtsProvider(selectedProvider, s.appSettings))
    })
  }, [book.fileBlob, book.id])

  function applyAppearancePatch(patch: AppearancePatch) {
    if (patch.fontSize) setFontSize(patch.fontSize)
    if (patch.lineHeight) setLineHeight(patch.lineHeight)
    if (patch.readerTheme) setReaderTheme(patch.readerTheme)
    if (patch.fontFamily) setFontFamily(patch.fontFamily)
    if (patch.overrideBookFont !== undefined) setOverrideBookFont(patch.overrideBookFont)
    if (patch.overrideBookColors !== undefined) setOverrideBookColors(patch.overrideBookColors)
    void updateBookSettings(book.id!, patch)
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
    applyAppearancePatch,
    handleReaderStyleModeChange,
  }
}
