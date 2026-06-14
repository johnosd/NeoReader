import { ElevenLabsService } from './ElevenLabsService'
import { FishAudioService } from './FishAudioService'
import { NativeTtsService } from './NativeTtsService'
import { SpeechifyService } from './SpeechifyService'
import type { AppSettings } from '../types/settings'
import type { PremiumTtsProvider, TtsProvider, TtsSpeechMark, TtsVoiceOption } from '../types/tts'

export type ApiKeyValidationCode =
  | 'empty'
  | 'valid'
  | 'invalid'
  | 'timeout'
  | 'unavailable'
  | 'no_credits'

export interface ApiKeyValidationResult {
  isValid: boolean
  code: ApiKeyValidationCode
  message: string
}

export interface PremiumTtsSynthesisOptions {
  apiKey: string
  language: string
  rate: number
  voiceId?: string | null
}

export interface PremiumTtsSynthesisResult {
  audioBlob: Blob
  speechMarks: TtsSpeechMark[]
}

export interface PremiumTtsProviderDefinition {
  provider: PremiumTtsProvider
  label: string
  description: string
  apiKeyField: keyof Pick<AppSettings, 'speechifyApiKey' | 'elevenLabsApiKey' | 'fishAudioApiKey'>
  placeholder: string
  getApiKey: () => Promise<string>
  isConfigured: () => Promise<boolean>
  validateApiKey: (apiKey: string) => Promise<ApiKeyValidationResult>
  listCompatibleVoices: (language: string, apiKey?: string) => Promise<TtsVoiceOption[]>
  synthesize: (text: string, options: PremiumTtsSynthesisOptions) => Promise<PremiumTtsSynthesisResult>
}

export const TTS_PROVIDER_ORDER: TtsProvider[] = ['speechify', 'elevenlabs', 'fishaudio', 'native']
export const PREMIUM_TTS_PROVIDER_ORDER: PremiumTtsProvider[] = ['speechify', 'elevenlabs', 'fishaudio']

export const PREMIUM_TTS_PROVIDER_DEFINITIONS: Record<PremiumTtsProvider, PremiumTtsProviderDefinition> = {
  speechify: {
    provider: 'speechify',
    label: 'Speechify',
    description: 'Vozes neurais e karaoke de palavras.',
    apiKeyField: 'speechifyApiKey',
    placeholder: 'sk-...',
    getApiKey: () => SpeechifyService.getApiKey(),
    isConfigured: () => SpeechifyService.isConfigured(),
    validateApiKey: (apiKey) => SpeechifyService.validateApiKey(apiKey),
    listCompatibleVoices: (language, apiKey) => SpeechifyService.listCompatibleVoices(language, apiKey),
    synthesize: (text, options) => SpeechifyService.synthesize(text, options),
  },
  elevenlabs: {
    provider: 'elevenlabs',
    label: 'ElevenLabs',
    description: 'Vozes premium com alinhamento temporal.',
    apiKeyField: 'elevenLabsApiKey',
    placeholder: 'sk_...',
    getApiKey: () => ElevenLabsService.getApiKey(),
    isConfigured: () => ElevenLabsService.isConfigured(),
    validateApiKey: (apiKey) => ElevenLabsService.validateApiKey(apiKey),
    listCompatibleVoices: (language, apiKey) => ElevenLabsService.listCompatibleVoices(language, apiKey),
    synthesize: (text, options) => ElevenLabsService.synthesize(text, options),
  },
  fishaudio: {
    provider: 'fishaudio',
    label: 'Fish Audio',
    description: 'Modelos Fish Audio com vozes clonadas e timestamps.',
    apiKeyField: 'fishAudioApiKey',
    placeholder: 'fish_...',
    getApiKey: () => FishAudioService.getApiKey(),
    isConfigured: () => FishAudioService.isConfigured(),
    validateApiKey: (apiKey) => FishAudioService.validateApiKey(apiKey),
    listCompatibleVoices: (language, apiKey) => FishAudioService.listCompatibleVoices(language, apiKey),
    synthesize: (text, options) => FishAudioService.synthesize(text, options),
  },
}

export function isPremiumTtsProvider(provider: TtsProvider): provider is PremiumTtsProvider {
  return provider !== 'native'
}

export function getTtsProviderLabel(provider: TtsProvider): string {
  if (provider === 'native') return 'TTS nativo'
  return PREMIUM_TTS_PROVIDER_DEFINITIONS[provider].label
}

export function getTtsProviderApiKeyFromSettings(settings: AppSettings, provider: TtsProvider): string {
  if (!isPremiumTtsProvider(provider)) return ''
  return settings[PREMIUM_TTS_PROVIDER_DEFINITIONS[provider].apiKeyField]
}

export function isTtsProviderConfigured(provider: TtsProvider, settings: AppSettings): boolean {
  if (provider === 'native') return true
  return Boolean(getTtsProviderApiKeyFromSettings(settings, provider))
}

export function getTtsProviderAvailability(settings: AppSettings): Record<TtsProvider, boolean> {
  return {
    native: true,
    speechify: Boolean(settings.speechifyApiKey),
    elevenlabs: Boolean(settings.elevenLabsApiKey),
    fishaudio: Boolean(settings.fishAudioApiKey),
  }
}

export function resolveTtsProviderFromAvailability(
  selectedProvider: TtsProvider,
  availability: Record<TtsProvider, boolean>,
): TtsProvider {
  return availability[selectedProvider] ? selectedProvider : 'native'
}

export async function resolveConfiguredTtsProvider(provider: TtsProvider): Promise<TtsProvider> {
  if (!isPremiumTtsProvider(provider)) return 'native'
  return await PREMIUM_TTS_PROVIDER_DEFINITIONS[provider].isConfigured() ? provider : 'native'
}

export async function getPremiumTtsApiKey(provider: PremiumTtsProvider): Promise<string> {
  return PREMIUM_TTS_PROVIDER_DEFINITIONS[provider].getApiKey()
}

export async function synthesizePremiumTts(
  provider: PremiumTtsProvider,
  text: string,
  options: PremiumTtsSynthesisOptions,
): Promise<PremiumTtsSynthesisResult> {
  return PREMIUM_TTS_PROVIDER_DEFINITIONS[provider].synthesize(text, options)
}

export async function listTtsProviderCompatibleVoices(
  provider: TtsProvider,
  language: string,
  settings: AppSettings,
): Promise<TtsVoiceOption[]> {
  if (provider === 'native') return NativeTtsService.listCompatibleVoices(language)

  const apiKey = getTtsProviderApiKeyFromSettings(settings, provider)
  if (!apiKey) return []
  return PREMIUM_TTS_PROVIDER_DEFINITIONS[provider].listCompatibleVoices(language, apiKey)
}
