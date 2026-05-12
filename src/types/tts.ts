export type TtsProvider = 'speechify' | 'elevenlabs' | 'fishaudio' | 'native'
export type PremiumTtsProvider = Exclude<TtsProvider, 'native'>

export interface TtsVoiceOption {
  id: string
  label: string
  locale: string
  provider: TtsProvider
  previewUrl?: string | null
  avatarUrl?: string | null
  meta?: string
  modelId?: string
}

export interface TtsVoiceSelection {
  id?: string | null
  label?: string | null
  avatarUrl?: string | null
  modelId?: string | null
}

export type TtsVoiceSelections = Partial<Record<TtsProvider, TtsVoiceSelection>>

export interface TtsVoiceCacheRecord {
  id?: number
  cacheKey: number
  provider: TtsProvider
  language: string
  voices: TtsVoiceOption[]
  updatedAt: Date
}

export interface TtsPlaybackConfig {
  provider: TtsProvider
  language: string
  rate: number
  speechifyVoiceId?: string | null
  elevenLabsVoiceId?: string | null
  nativeVoiceKey?: string | null
  voiceSelections?: TtsVoiceSelections
}

export interface TtsSpeechMark {
  start_time: number
  end_time: number
  start: number
  end: number
  value: string
}
