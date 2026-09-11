import { Capacitor } from '@capacitor/core'
import { DeepLService } from './DeepLService'
import type { AppSettings } from '../types/settings'
import type {
  PremiumTranslationProvider,
  TranslationApiKeyValidationResult,
  TranslationFailureCode,
  TranslationProvider,
  TranslationResult,
} from '../types/translation'

// Erro tipado que qualquer *Service.ts de provider premium lança quando a
// chamada de tradução falha — `code` reusa as mesmas 7 categorias da
// validação de chave; `retryable` é a única informação nova, específica de
// runtime (FR-007): alguns provedores distinguem "rate limit transitório"
// (retryable) de "quota/billing esgotado" (não retryable) mesmo quando os
// dois retornam HTTP 429 (ver research.md R2/R5).
export class TranslationProviderError extends Error {
  readonly code: TranslationFailureCode
  readonly retryable: boolean

  constructor(code: TranslationFailureCode, message: string, retryable = false) {
    super(message)
    this.name = 'TranslationProviderError'
    this.code = code
    this.retryable = retryable
  }
}

export interface TranslationOptions {
  apiKey: string
  sourceLang: string
  targetLang: string
  signal?: AbortSignal
}

export interface TranslationProviderDefinition {
  provider: PremiumTranslationProvider
  label: string
  description: string
  apiKeyField: keyof Pick<AppSettings, 'deeplApiKey' | 'openaiTranslationApiKey' | 'googleTranslateApiKey'>
  placeholder: string
  // DeepL e OpenAI bloqueiam CORS de propósito — só funcionam no app Android
  // empacotado (via CapacitorHttp, ver capacitor.config.ts), nunca no
  // browser (Web) nem no `npm run dev`. Google Cloud Translation não tem
  // essa restrição. Ver plan.md R-006.
  requiresNativePlatform: boolean
  getApiKey: () => Promise<string>
  isConfigured: () => Promise<boolean>
  validateApiKey: (apiKey: string) => Promise<TranslationApiKeyValidationResult>
  translate: (text: string, options: TranslationOptions) => Promise<TranslationResult>
}

// Ordem de exibição (MyMemory primeiro = padrão gratuito, igual ao "native"
// em TTS). Cada provider premium só entra aqui quando seu *Service.ts
// correspondente existir — ver PREMIUM_TRANSLATION_PROVIDER_DEFINITIONS
// abaixo, que é Partial de propósito (fases 3-5 do tasks.md preenchem uma
// entrada por vez, nunca todas de uma vez).
export const TRANSLATION_PROVIDER_ORDER: TranslationProvider[] = ['mymemory', 'deepl']
export const PREMIUM_TRANSLATION_PROVIDER_ORDER: PremiumTranslationProvider[] = ['deepl']

export const PREMIUM_TRANSLATION_PROVIDER_DEFINITIONS: Partial<Record<PremiumTranslationProvider, TranslationProviderDefinition>> = {
  deepl: {
    provider: 'deepl',
    label: 'DeepL',
    description: 'Tradução literária de alta precisão, com melhor tom e fluência.',
    apiKeyField: 'deeplApiKey',
    placeholder: 'xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx:fx',
    requiresNativePlatform: true,
    getApiKey: () => DeepLService.getApiKey(),
    isConfigured: () => DeepLService.isConfigured(),
    validateApiKey: (apiKey) => DeepLService.validateApiKey(apiKey),
    translate: (text, options) => DeepLService.translate(text, options),
  },
}

export function isPremiumTranslationProvider(provider: TranslationProvider): provider is PremiumTranslationProvider {
  return provider !== 'mymemory'
}

export function getTranslationProviderLabel(provider: TranslationProvider): string {
  if (provider === 'mymemory') return 'MyMemory'
  return PREMIUM_TRANSLATION_PROVIDER_DEFINITIONS[provider]?.label ?? provider
}

export function getTranslationProviderApiKeyFromSettings(settings: AppSettings, provider: TranslationProvider): string {
  if (!isPremiumTranslationProvider(provider)) return ''
  const definition = PREMIUM_TRANSLATION_PROVIDER_DEFINITIONS[provider]
  if (!definition) return ''
  return settings[definition.apiKeyField]
}

// Distingue "sem chave" de "plataforma não suportada" (R-006) — usado pela UI
// pra mostrar a mensagem certa em vez de "chave pendente" quando o problema
// na verdade é CORS bloqueando DeepL/OpenAI fora do app Android.
export function isTranslationProviderPlatformRestricted(provider: TranslationProvider): boolean {
  if (!isPremiumTranslationProvider(provider)) return false
  const definition = PREMIUM_TRANSLATION_PROVIDER_DEFINITIONS[provider]
  return Boolean(definition?.requiresNativePlatform) && !Capacitor.isNativePlatform()
}

export function isTranslationProviderConfigured(provider: TranslationProvider, settings: AppSettings): boolean {
  if (provider === 'mymemory') return true
  if (isTranslationProviderPlatformRestricted(provider)) return false
  return Boolean(getTranslationProviderApiKeyFromSettings(settings, provider))
}

export function getTranslationProviderAvailability(settings: AppSettings): Record<TranslationProvider, boolean> {
  return {
    mymemory: true,
    deepl: isTranslationProviderConfigured('deepl', settings),
    openai: isTranslationProviderConfigured('openai', settings),
    google: isTranslationProviderConfigured('google', settings),
  }
}

export function resolveTranslationProviderFromAvailability(
  selectedProvider: TranslationProvider,
  availability: Record<TranslationProvider, boolean>,
): TranslationProvider {
  return availability[selectedProvider] ? selectedProvider : 'mymemory'
}

export async function resolveConfiguredTranslationProvider(provider: TranslationProvider): Promise<TranslationProvider> {
  if (!isPremiumTranslationProvider(provider)) return 'mymemory'
  const definition = PREMIUM_TRANSLATION_PROVIDER_DEFINITIONS[provider]
  if (!definition || isTranslationProviderPlatformRestricted(provider)) return 'mymemory'
  return await definition.isConfigured() ? provider : 'mymemory'
}

export async function getPremiumTranslationApiKey(provider: PremiumTranslationProvider): Promise<string> {
  return PREMIUM_TRANSLATION_PROVIDER_DEFINITIONS[provider]?.getApiKey() ?? Promise.resolve('')
}

export async function translateWithPremiumProvider(
  provider: PremiumTranslationProvider,
  text: string,
  options: TranslationOptions,
): Promise<TranslationResult> {
  const definition = PREMIUM_TRANSLATION_PROVIDER_DEFINITIONS[provider]
  if (!definition) throw new Error(`Translation provider not registered: ${provider}`)
  return definition.translate(text, options)
}
