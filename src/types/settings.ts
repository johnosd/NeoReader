export type FontSize = 'sm' | 'md' | 'lg' | 'xl'
export type ReaderLineHeight = 'compact' | 'comfortable' | 'relaxed'
export type ReaderTheme = 'dark' | 'black' | 'paper' | 'warm' | 'sepia' | 'sage' | 'contrast'
export type ReaderFontFamily = 'publisher' | 'classic' | 'modern' | 'readable' | 'mono'

export interface AppSettings {
  speechifyApiKey: string
  elevenLabsApiKey: string
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
}

export interface UserSettings {
  id?: number
  appSettings: AppSettings
  readerDefaults: ReaderDefaults
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
  speechifyApiKey: '',
  elevenLabsApiKey: '',
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

  return {
    ...(record?.id !== undefined ? { id: record.id } : {}),
    appSettings: {
      ...DEFAULT_APP_SETTINGS,
      speechifyApiKey: record?.appSettings?.speechifyApiKey ?? record?.speechifyApiKey ?? DEFAULT_APP_SETTINGS.speechifyApiKey,
      elevenLabsApiKey: record?.appSettings?.elevenLabsApiKey ?? DEFAULT_APP_SETTINGS.elevenLabsApiKey,
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
    },
    updatedAt: record?.updatedAt ? new Date(record.updatedAt) : new Date(),
  }
}
