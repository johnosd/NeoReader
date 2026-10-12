import { describe, expect, it, vi } from 'vitest'
import { translate } from '@/services/TranslationService'
import { buildPremiumTtsAudioCacheKey } from '@/services/TtsAudioCache'

const mocks = vi.hoisted(() => ({ fetch: vi.fn() }))
vi.mock('@/db/translations', () => ({ getCachedTranslation: async () => undefined, setCachedTranslation: async () => undefined }))
vi.mock('@/services/http', () => ({ fetchWithTimeout: mocks.fetch }))

// Passing probes assert faulty behavior, not acceptance of a future correction.
describe('Review probes: provider boundaries', () => {
  it('R10: an already aborted MyMemory translation still dispatches an HTTP request', async () => {
    mocks.fetch.mockResolvedValue({ ok: true, json: async () => ({ responseStatus: 200, responseData: { translatedText: 'Sintético' } }) })
    const controller = new AbortController()
    controller.abort()
    const result = await translate('Synthetic', 'en', 'pt-BR', { provider: 'mymemory', signal: controller.signal })
    expect(result.translatedText).toBe('Sintético')
    expect(mocks.fetch).toHaveBeenCalledTimes(1)
    expect(mocks.fetch.mock.calls[0]).toHaveLength(1)
  })

  it('R13: two synthesis models have the same audio cache key', () => {
    const base = { provider: 'elevenlabs' as const, voiceId: 'same-voice', language: 'en', rate: 1, text: 'Synthetic text.' }
    const first = { ...base, modelId: 'eleven_multilingual_v2' }
    const second = { ...base, modelId: 'eleven_v3' }
    expect(buildPremiumTtsAudioCacheKey(first)).toBe(buildPremiumTtsAudioCacheKey(second))
  })
})
