import { beforeEach, describe, expect, it } from 'vitest'
import {
  PREMIUM_TTS_AUDIO_CACHE_MAX_AGE_MS,
  buildPremiumTtsAudioCacheKey,
  clearPremiumTtsAudioCache,
  getCachedPremiumTtsAudio,
  setCachedPremiumTtsAudio,
} from '@/services/TtsAudioCache'
import type { PremiumTtsAudioCacheParams } from '@/services/TtsAudioCache'

describe('TtsAudioCache', () => {
  beforeEach(() => {
    clearPremiumTtsAudioCache()
  })

  it('reusa audio premium para a mesma chave de sintese', () => {
    const params: PremiumTtsAudioCacheParams = {
      provider: 'speechify',
      voiceId: 'voice-a',
      language: 'en-US',
      rate: 1,
      text: 'Repeat this sentence.',
    }
    const audioBlob = new Blob(['audio'], { type: 'audio/mpeg' })
    const speechMarks = [
      { start_time: 0, end_time: 200, start: 0, end: 6, value: 'Repeat' },
    ]

    setCachedPremiumTtsAudio(params, { audioBlob, speechMarks }, 1000)

    const cached = getCachedPremiumTtsAudio(params, PREMIUM_TTS_AUDIO_CACHE_MAX_AGE_MS, 2000)

    expect(cached?.audioBlob).toBe(audioBlob)
    expect(cached?.speechMarks).toEqual(speechMarks)
    expect(cached?.speechMarks).not.toBe(speechMarks)
  })

  it('gera chave diferente quando voz, idioma, rate ou texto mudam', () => {
    const baseParams: PremiumTtsAudioCacheParams = {
      provider: 'elevenlabs',
      voiceId: 'voice-a',
      language: 'en-US',
      rate: 1,
      text: 'Same text.',
    }
    const baseKey = buildPremiumTtsAudioCacheKey(baseParams)

    expect(buildPremiumTtsAudioCacheKey({ ...baseParams, voiceId: 'voice-b' })).not.toBe(baseKey)
    expect(buildPremiumTtsAudioCacheKey({ ...baseParams, language: 'pt-BR' })).not.toBe(baseKey)
    expect(buildPremiumTtsAudioCacheKey({ ...baseParams, rate: 1.25 })).not.toBe(baseKey)
    expect(buildPremiumTtsAudioCacheKey({ ...baseParams, text: 'Other text.' })).not.toBe(baseKey)
  })

  it('expira entradas antigas', () => {
    const params: PremiumTtsAudioCacheParams = {
      provider: 'fishaudio',
      voiceId: 'fish-voice',
      language: 'en-US',
      rate: 1,
      text: 'Cache me briefly.',
    }

    setCachedPremiumTtsAudio(params, {
      audioBlob: new Blob(['audio'], { type: 'audio/mpeg' }),
      speechMarks: [],
    }, 1000)

    expect(getCachedPremiumTtsAudio(params, 500, 1400)).not.toBeNull()
    expect(getCachedPremiumTtsAudio(params, 500, 1601)).toBeNull()
  })
})
