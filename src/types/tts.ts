export type TtsProvider = 'speechify' | 'elevenlabs' | 'native'

export interface TtsVoiceOption {
  id: string
  label: string
  locale: string
  provider: TtsProvider
  previewUrl?: string | null
  avatarUrl?: string | null
  meta?: string
}

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
}

export interface TtsSpeechMark {
  start_time: number
  end_time: number
  start: number
  end: number
  value: string
}
