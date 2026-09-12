import { describe, it, expect, beforeEach, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ isNativePlatform: vi.fn(() => false) }))

vi.mock('@capacitor/core', () => ({
  Capacitor: { isNativePlatform: mocks.isNativePlatform },
}))

import {
  TRANSLATION_PROVIDER_ORDER,
  getTranslationProviderApiKeyFromSettings,
  getTranslationProviderAvailability,
  getTranslationProviderLabel,
  isPremiumTranslationProvider,
  isTranslationProviderConfigured,
  isTranslationProviderPlatformRestricted,
  resolveTranslationProviderFromAvailability,
  TranslationProviderError,
} from '@/services/TranslationProviderRegistry'
import { DEFAULT_APP_SETTINGS } from '@/types/settings'

beforeEach(() => {
  mocks.isNativePlatform.mockReturnValue(false)
})

describe('isPremiumTranslationProvider', () => {
  it('mymemory não é premium', () => {
    expect(isPremiumTranslationProvider('mymemory')).toBe(false)
  })

  it('deepl/openai/google são premium', () => {
    expect(isPremiumTranslationProvider('deepl')).toBe(true)
    expect(isPremiumTranslationProvider('openai')).toBe(true)
    expect(isPremiumTranslationProvider('google')).toBe(true)
  })
})

describe('getTranslationProviderApiKeyFromSettings', () => {
  it('mymemory não tem apiKeyField — retorna string vazia', () => {
    expect(getTranslationProviderApiKeyFromSettings(DEFAULT_APP_SETTINGS, 'mymemory')).toBe('')
  })

  it('google (registrado na US3) retorna a chave configurada', () => {
    expect(getTranslationProviderApiKeyFromSettings({ ...DEFAULT_APP_SETTINGS, googleTranslateApiKey: 'x' }, 'google')).toBe('x')
  })

  it('deepl (registrado na US1) retorna a chave configurada', () => {
    expect(getTranslationProviderApiKeyFromSettings({ ...DEFAULT_APP_SETTINGS, deeplApiKey: 'x' }, 'deepl')).toBe('x')
  })

  it('openai (registrado na US2) retorna a chave configurada', () => {
    expect(getTranslationProviderApiKeyFromSettings({ ...DEFAULT_APP_SETTINGS, openaiTranslationApiKey: 'x' }, 'openai')).toBe('x')
  })
})

describe('isTranslationProviderConfigured', () => {
  it('mymemory é sempre configurado (gratuito, sem chave)', () => {
    expect(isTranslationProviderConfigured('mymemory', DEFAULT_APP_SETTINGS)).toBe(true)
  })

  it('google com chave configurada é "configurado" mesmo fora do Android (não tem CORS, R-006)', () => {
    expect(isTranslationProviderConfigured('google', { ...DEFAULT_APP_SETTINGS, googleTranslateApiKey: 'x' })).toBe(true)
  })

  it('deepl com chave configurada, mas fora do Android (R-006/CORS), NÃO é "configurado"', () => {
    expect(isTranslationProviderConfigured('deepl', { ...DEFAULT_APP_SETTINGS, deeplApiKey: 'x' })).toBe(false)
  })

  it('deepl com chave configurada E no Android é "configurado"', () => {
    mocks.isNativePlatform.mockReturnValue(true)
    expect(isTranslationProviderConfigured('deepl', { ...DEFAULT_APP_SETTINGS, deeplApiKey: 'x' })).toBe(true)
  })
})

describe('isTranslationProviderPlatformRestricted (R-006 — DeepL/OpenAI bloqueiam CORS fora do Android)', () => {
  it('mymemory nunca é restrito por plataforma', () => {
    expect(isTranslationProviderPlatformRestricted('mymemory')).toBe(false)
  })

  it('deepl é restrito fora do Android', () => {
    mocks.isNativePlatform.mockReturnValue(false)
    expect(isTranslationProviderPlatformRestricted('deepl')).toBe(true)
  })

  it('deepl não é restrito no Android', () => {
    mocks.isNativePlatform.mockReturnValue(true)
    expect(isTranslationProviderPlatformRestricted('deepl')).toBe(false)
  })

  it('google nunca é restrito por plataforma (Basic v2 não bloqueia CORS)', () => {
    mocks.isNativePlatform.mockReturnValue(false)
    expect(isTranslationProviderPlatformRestricted('google')).toBe(false)
  })
})

describe('getTranslationProviderAvailability', () => {
  it('mymemory sempre true; premium sem chave ficam false', () => {
    const availability = getTranslationProviderAvailability(DEFAULT_APP_SETTINGS)
    expect(availability).toEqual({ mymemory: true, deepl: false, openai: false, google: false })
  })

  it('deepl com chave configurada só aparece disponível no Android (R-006)', () => {
    expect(getTranslationProviderAvailability({ ...DEFAULT_APP_SETTINGS, deeplApiKey: 'x' }))
      .toEqual({ mymemory: true, deepl: false, openai: false, google: false })

    mocks.isNativePlatform.mockReturnValue(true)
    expect(getTranslationProviderAvailability({ ...DEFAULT_APP_SETTINGS, deeplApiKey: 'x' }))
      .toEqual({ mymemory: true, deepl: true, openai: false, google: false })
  })
})

describe('resolveTranslationProviderFromAvailability', () => {
  it('mantém o provider selecionado se disponível', () => {
    const availability = { mymemory: true, deepl: true, openai: false, google: false }
    expect(resolveTranslationProviderFromAvailability('deepl', availability)).toBe('deepl')
  })

  it('cai pro mymemory se o selecionado não estiver disponível', () => {
    const availability = { mymemory: true, deepl: false, openai: false, google: false }
    expect(resolveTranslationProviderFromAvailability('deepl', availability)).toBe('mymemory')
  })
})

describe('getTranslationProviderLabel', () => {
  it('mymemory retorna "MyMemory"', () => {
    expect(getTranslationProviderLabel('mymemory')).toBe('MyMemory')
  })

  it('deepl (registrado na US1) retorna "DeepL"', () => {
    expect(getTranslationProviderLabel('deepl')).toBe('DeepL')
  })

  it('openai (registrado na US2) retorna "OpenAI"', () => {
    expect(getTranslationProviderLabel('openai')).toBe('OpenAI')
  })

  it('google (registrado na US3) retorna "Google Translate"', () => {
    expect(getTranslationProviderLabel('google')).toBe('Google Translate')
  })
})

describe('TRANSLATION_PROVIDER_ORDER', () => {
  it('mymemory + deepl + openai + google — os 3 provedores premium completos (US3)', () => {
    expect(TRANSLATION_PROVIDER_ORDER).toEqual(['mymemory', 'deepl', 'openai', 'google'])
  })
})

describe('TranslationProviderError', () => {
  it('carrega code/retryable/message', () => {
    const error = new TranslationProviderError('quota_exceeded', 'limite atingido', false)
    expect(error.code).toBe('quota_exceeded')
    expect(error.retryable).toBe(false)
    expect(error.message).toBe('limite atingido')
    expect(error.name).toBe('TranslationProviderError')
  })
})
