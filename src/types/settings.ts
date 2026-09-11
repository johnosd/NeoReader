import { DEFAULT_APP_LOCALE_PREFERENCE, normalizeAppLocalePreference, type AppLocalePreference } from '../i18n/locales'
import type { CefrLevel } from './wordLens'
import type { HighlightStyle } from './highlight'

export type FontSize = 'sm' | 'md' | 'lg' | 'xl'
export type ReaderLineHeight = 'compact' | 'comfortable' | 'relaxed'
export type ReaderTheme = 'dark' | 'black' | 'paper' | 'warm' | 'sepia' | 'sage' | 'contrast'
export type ReaderFontFamily = 'publisher' | 'classic' | 'modern' | 'readable' | 'mono'

export interface AppSettings {
  appLocale: AppLocalePreference
  speechifyApiKey: string
  elevenLabsApiKey: string
  fishAudioApiKey: string
  translationTargetLang: string
  youtubeApiKey: string
}

export interface ReaderDefaults {
  defaultFontSize: FontSize
  lineHeight: ReaderLineHeight
  readerTheme: ReaderTheme
  fontFamily: ReaderFontFamily
  overrideBookFont: boolean
  overrideBookColors: boolean
  wordLensEnabled: boolean
  wordLensLevel: CefrLevel
  // Cor/estilo do último highlight criado pelo usuário (qualquer livro) —
  // pré-seleciona a caixa unificada de criação (feature 016, FR-002).
  lastHighlightColor: string
  lastHighlightStyle: HighlightStyle
}

export interface UserSettings {
  id?: number
  appSettings: AppSettings
  readerDefaults: ReaderDefaults
  driveImportCount?: number
  updatedAt: Date
}

export interface LegacyUserSettings {
  id?: number
  speechifyApiKey?: string
  translationTargetLang?: string
  defaultFontSize?: FontSize
  updatedAt?: Date
}

export const DEFAULT_APP_SETTINGS: AppSettings = {
  appLocale: DEFAULT_APP_LOCALE_PREFERENCE,
  speechifyApiKey: '',
  elevenLabsApiKey: '',
  fishAudioApiKey: '',
  translationTargetLang: 'pt-BR',
  youtubeApiKey: '',
}

export const DEFAULT_READER_DEFAULTS: ReaderDefaults = {
  defaultFontSize: 'md',
  lineHeight: 'comfortable',
  readerTheme: 'dark',
  fontFamily: 'classic',
  overrideBookFont: true,
  overrideBookColors: true,
  wordLensEnabled: false,
  wordLensLevel: 'B1',
  lastHighlightColor: 'indigo',
  lastHighlightStyle: 'background',
}

export const DEFAULT_SETTINGS: Omit<UserSettings, 'id'> = {
  appSettings: DEFAULT_APP_SETTINGS,
  readerDefaults: DEFAULT_READER_DEFAULTS,
  updatedAt: new Date(),
}

type SettingsRecord = Partial<UserSettings> & LegacyUserSettings & {
  appSettings?: Partial<AppSettings>
  readerDefaults?: Partial<ReaderDefaults>
}

export function normalizeUserSettings(record?: SettingsRecord | null): UserSettings {
  const fontFamily = record?.readerDefaults?.fontFamily ?? DEFAULT_READER_DEFAULTS.fontFamily
  const wordLensLevel = record?.readerDefaults?.wordLensLevel

  return {
    ...(record?.id !== undefined ? { id: record.id } : {}),
    ...(record?.driveImportCount !== undefined ? { driveImportCount: record.driveImportCount } : {}),
    appSettings: {
      ...DEFAULT_APP_SETTINGS,
      appLocale: normalizeAppLocalePreference(record?.appSettings?.appLocale),
      speechifyApiKey: record?.appSettings?.speechifyApiKey ?? record?.speechifyApiKey ?? DEFAULT_APP_SETTINGS.speechifyApiKey,
      elevenLabsApiKey: record?.appSettings?.elevenLabsApiKey ?? DEFAULT_APP_SETTINGS.elevenLabsApiKey,
      fishAudioApiKey: record?.appSettings?.fishAudioApiKey ?? DEFAULT_APP_SETTINGS.fishAudioApiKey,
      translationTargetLang: record?.appSettings?.translationTargetLang ?? record?.translationTargetLang ?? DEFAULT_APP_SETTINGS.translationTargetLang,
      youtubeApiKey: record?.appSettings?.youtubeApiKey ?? DEFAULT_APP_SETTINGS.youtubeApiKey,
    },
    readerDefaults: {
      ...DEFAULT_READER_DEFAULTS,
      defaultFontSize: record?.readerDefaults?.defaultFontSize ?? record?.defaultFontSize ?? DEFAULT_READER_DEFAULTS.defaultFontSize,
      lineHeight: record?.readerDefaults?.lineHeight ?? DEFAULT_READER_DEFAULTS.lineHeight,
      readerTheme: record?.readerDefaults?.readerTheme ?? DEFAULT_READER_DEFAULTS.readerTheme,
      fontFamily,
      overrideBookFont: record?.readerDefaults?.overrideBookFont ?? (fontFamily !== 'publisher'),
      overrideBookColors: record?.readerDefaults?.overrideBookColors ?? DEFAULT_READER_DEFAULTS.overrideBookColors,
      wordLensEnabled: typeof record?.readerDefaults?.wordLensEnabled === 'boolean'
        ? record.readerDefaults.wordLensEnabled
        : DEFAULT_READER_DEFAULTS.wordLensEnabled,
      wordLensLevel: wordLensLevel && ['A1', 'A2', 'B1', 'B2', 'C1', 'C2'].includes(wordLensLevel)
        ? wordLensLevel
        : DEFAULT_READER_DEFAULTS.wordLensLevel,
      lastHighlightColor: record?.readerDefaults?.lastHighlightColor ?? DEFAULT_READER_DEFAULTS.lastHighlightColor,
      lastHighlightStyle: record?.readerDefaults?.lastHighlightStyle ?? DEFAULT_READER_DEFAULTS.lastHighlightStyle,
    },
    updatedAt: record?.updatedAt ? new Date(record.updatedAt) : new Date(),
  }
}
