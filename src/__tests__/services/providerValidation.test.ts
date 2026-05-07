import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/db/ttsVoiceCaches', () => ({
  buildTtsVoiceCacheKey: vi.fn(() => 12345),
  getCachedTtsVoiceOptions: vi.fn(),
  setCachedTtsVoiceOptions: vi.fn(),
}))

import { getCachedTtsVoiceOptions, setCachedTtsVoiceOptions } from '@/db/ttsVoiceCaches'
import { ElevenLabsService } from '@/services/ElevenLabsService'
import { SpeechifyService } from '@/services/SpeechifyService'

const mockGetCachedTtsVoiceOptions = vi.mocked(getCachedTtsVoiceOptions)
const mockSetCachedTtsVoiceOptions = vi.mocked(setCachedTtsVoiceOptions)

function makeElevenLabsAlignment(text: string) {
  const characters = Array.from(text)
  return {
    characters,
    character_start_times_seconds: characters.map((_, index) => index * 0.1),
    character_end_times_seconds: characters.map((_, index) => (index + 1) * 0.1),
  }
}

describe('provider API key validation', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    mockGetCachedTtsVoiceOptions.mockResolvedValue(null)
    mockSetCachedTtsVoiceOptions.mockResolvedValue(undefined)
  })

  it('valida uma API key da Speechify com a lista de vozes', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify([]), { status: 200 })))

    const result = await SpeechifyService.validateApiKey('valid-key')

    expect(result).toEqual({
      isValid: true,
      message: 'API key válida.',
    })
    expect(fetch).toHaveBeenCalledOnce()
  })

  it('retorna inválida para uma API key da ElevenLabs rejeitada pela API', async () => {
    const fetchMock = vi.fn(async () => new Response('{}', { status: 401 }))
    vi.stubGlobal('fetch', fetchMock)

    const result = await ElevenLabsService.validateApiKey('bad-key')

    expect(result).toEqual({
      isValid: false,
      message: 'API key inválida ou sem permissão.',
    })
    expect(fetchMock).toHaveBeenCalledOnce()
    expect(String(fetchMock.mock.calls[0][0])).toContain('page_size=20')
  })

  it('usa uma voz compatível da ElevenLabs quando o livro está com voz padrão', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({
        voices: [
          {
            voice_id: 'voice-pt',
            name: 'Luna',
            labels: { accent: 'BR', gender: 'female' },
            preview_url: 'https://cdn.example/luna.mp3',
            verified_languages: [
              { language: 'pt', model_id: 'eleven_multilingual_v2', locale: 'pt-BR' },
            ],
          },
        ],
        has_more: false,
        next_page_token: null,
      }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        voice_id: 'voice-pt',
        name: 'Luna',
        high_quality_base_model_ids: ['eleven_multilingual_v2'],
        verified_languages: [
          { language: 'pt', model_id: 'eleven_multilingual_v2', locale: 'pt-BR' },
        ],
      }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        audio_base64: 'YQ==',
        normalized_alignment: {
          characters: ['O', 'i'],
          character_start_times_seconds: [0, 0.1],
          character_end_times_seconds: [0.1, 0.2],
        },
      }), { status: 200 }))
    vi.stubGlobal('fetch', fetchMock)

    const result = await ElevenLabsService.synthesize('Olá mundo', {
      apiKey: 'valid-key',
      language: 'pt-BR',
      rate: 1,
    })

    expect(result.audioBlob).toBeInstanceOf(Blob)
    expect(fetchMock).toHaveBeenCalledTimes(3)
    expect(String(fetchMock.mock.calls[0][0])).toContain('/v2/voices')
    expect(String(fetchMock.mock.calls[1][0])).toContain('/v1/voices/voice-pt')
    expect(String(fetchMock.mock.calls[2][0])).toContain('/v1/text-to-speech/voice-pt/with-timestamps')
  })

  it('usa alignment original da ElevenLabs antes do normalized_alignment para offsets de karaoke', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({
        voice_id: 'voice-en',
        name: 'Luna',
        high_quality_base_model_ids: ['eleven_multilingual_v2'],
        verified_languages: [
          { language: 'en', model_id: 'eleven_multilingual_v2', locale: 'en-US' },
        ],
      }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        audio_base64: 'YQ==',
        alignment: makeElevenLabsAlignment('Hi 2 you'),
        normalized_alignment: makeElevenLabsAlignment('Hi two you'),
      }), { status: 200 }))
    vi.stubGlobal('fetch', fetchMock)

    const result = await ElevenLabsService.synthesize('Hi 2 you', {
      apiKey: 'valid-key',
      language: 'en-US',
      rate: 1,
      voiceId: 'voice-en',
    })

    expect(result.speechMarks.map(({ value, start, end }) => ({ value, start, end }))).toEqual([
      { value: 'Hi', start: 0, end: 2 },
      { value: '2', start: 3, end: 4 },
      { value: 'you', start: 5, end: 8 },
    ])
  })

  it('reancora normalized_alignment da ElevenLabs no texto original quando alignment nao vem na resposta', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({
        voice_id: 'voice-en',
        name: 'Luna',
        high_quality_base_model_ids: ['eleven_multilingual_v2'],
        verified_languages: [
          { language: 'en', model_id: 'eleven_multilingual_v2', locale: 'en-US' },
        ],
      }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        audio_base64: 'YQ==',
        normalized_alignment: makeElevenLabsAlignment('don\u2019t stop'),
      }), { status: 200 }))
    vi.stubGlobal('fetch', fetchMock)

    const result = await ElevenLabsService.synthesize("don't stop", {
      apiKey: 'valid-key',
      language: 'en-US',
      rate: 1,
      voiceId: 'voice-en',
    })

    expect(result.speechMarks.map(({ value, start, end }) => ({ value, start, end }))).toEqual([
      { value: 'don\u2019t', start: 0, end: 5 },
      { value: 'stop', start: 6, end: 10 },
    ])
  })

  it('preserva type e message do erro HTTP da ElevenLabs', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({
        voice_id: 'voice-pt',
        name: 'Luna',
        verified_languages: [
          { language: 'pt', model_id: 'eleven_multilingual_v2', locale: 'pt-BR' },
        ],
      }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        detail: {
          type: 'invalid_unicode',
          message: 'Request body contains invalid UTF-8 encoding.',
        },
      }), {
        status: 422,
        headers: { 'content-type': 'application/json' },
      }))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        detail: {
          type: 'invalid_unicode',
          message: 'Request body contains invalid UTF-8 encoding.',
        },
      }), {
        status: 422,
        headers: { 'content-type': 'application/json' },
      }))
    vi.stubGlobal('fetch', fetchMock)

    const promise = ElevenLabsService.synthesize('Olá mundo', {
      apiKey: 'valid-key',
      language: 'pt-BR',
      rate: 1,
      voiceId: 'voice-pt',
    })

    await expect(promise).rejects.toMatchObject({
      status: 422,
      type: 'invalid_unicode',
      voiceId: 'voice-pt',
      modelId: 'eleven_multilingual_v2',
    })
    await expect(promise).rejects.toThrow('Request body contains invalid UTF-8 encoding.')
  })

  it('resolve uma voz compativel quando a voz salva nao existe na conta atual', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({
        detail: {
          type: 'voice_not_found',
          message: 'Voice not found.',
        },
      }), { status: 404 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        voices: [
          {
            voice_id: 'free-voice',
            name: 'Free Voice',
            verified_languages: [
              { language: 'pt', model_id: 'eleven_multilingual_v2', locale: 'pt-BR' },
            ],
          },
        ],
        has_more: false,
        next_page_token: null,
      }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        voice_id: 'free-voice',
        name: 'Free Voice',
        verified_languages: [
          { language: 'pt', model_id: 'eleven_multilingual_v2', locale: 'pt-BR' },
        ],
      }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        audio_base64: 'YQ==',
        normalized_alignment: makeElevenLabsAlignment('Olá mundo'),
      }), { status: 200 }))
    vi.stubGlobal('fetch', fetchMock)

    const result = await ElevenLabsService.synthesize('Olá mundo', {
      apiKey: 'free-key',
      language: 'pt-BR',
      rate: 1,
      voiceId: 'paid-voice',
    })

    expect(result.audioBlob).toBeInstanceOf(Blob)
    expect(String(fetchMock.mock.calls[0][0])).toContain('/v1/voices/paid-voice')
    expect(String(fetchMock.mock.calls[1][0])).toContain('/v2/voices')
    expect(String(fetchMock.mock.calls[2][0])).toContain('/v1/voices/free-voice')
    expect(String(fetchMock.mock.calls[3][0])).toContain('/v1/text-to-speech/free-voice/with-timestamps')
  })

  it('cai para o endpoint simples quando with-timestamps falha', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({
        voice_id: 'voice-pt',
        name: 'Luna',
        verified_languages: [
          { language: 'pt', model_id: 'eleven_multilingual_v2', locale: 'pt-BR' },
        ],
      }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        detail: {
          type: 'unprocessable_entity',
          message: 'Timestamps not available for this request.',
        },
      }), { status: 422 }))
      .mockResolvedValueOnce(new Response('mp3-bytes', {
        status: 200,
        headers: { 'content-type': 'audio/mpeg' },
      }))
    vi.stubGlobal('fetch', fetchMock)

    const result = await ElevenLabsService.synthesize('Olá mundo', {
      apiKey: 'free-key',
      language: 'pt-BR',
      rate: 1,
      voiceId: 'voice-pt',
    })

    expect(result.audioBlob).toBeInstanceOf(Blob)
    expect(result.audioBlob.type).toBe('audio/mpeg')
    expect(result.speechMarks).toEqual([])
    expect(String(fetchMock.mock.calls[1][0])).toContain('/v1/text-to-speech/voice-pt/with-timestamps')
    expect(String(fetchMock.mock.calls[2][0])).toBe('https://api.elevenlabs.io/v1/text-to-speech/voice-pt')
    expect((fetchMock.mock.calls[2][1] as RequestInit).headers).toMatchObject({
      Accept: 'audio/mpeg',
      'Content-Type': 'application/json; charset=utf-8',
    })
    expect(JSON.parse(String((fetchMock.mock.calls[2][1] as RequestInit).body))).toEqual({
      text: 'Olá mundo',
      model_id: 'eleven_multilingual_v2',
    })
  })

  it('cai para o endpoint simples quando with-timestamps retorna 402 de assinatura', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({
        voice_id: 'voice-pt',
        name: 'Luna',
        verified_languages: [
          { language: 'pt', model_id: 'eleven_multilingual_v2', locale: 'pt-BR' },
        ],
      }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        detail: {
          type: 'quota_exceeded',
          message: 'This endpoint requires an active subscription.',
        },
      }), { status: 402 }))
      .mockResolvedValueOnce(new Response('mp3-bytes', {
        status: 200,
        headers: { 'content-type': 'audio/mpeg' },
      }))
    vi.stubGlobal('fetch', fetchMock)

    const result = await ElevenLabsService.synthesize('Olá mundo', {
      apiKey: 'free-key',
      language: 'pt-BR',
      rate: 1,
      voiceId: 'voice-pt',
    })

    expect(result.audioBlob.type).toBe('audio/mpeg')
    expect(result.speechMarks).toEqual([])
    expect(String(fetchMock.mock.calls[1][0])).toContain('/v1/text-to-speech/voice-pt/with-timestamps')
    expect(String(fetchMock.mock.calls[2][0])).toBe('https://api.elevenlabs.io/v1/text-to-speech/voice-pt')
  })

  it('usa cache persistido da Speechify sem chamar a rede', async () => {
    mockGetCachedTtsVoiceOptions.mockResolvedValue([
      {
        id: 'cached-voice',
        label: 'Cached Voice',
        locale: 'pt-BR',
        provider: 'speechify',
        previewUrl: null,
        avatarUrl: null,
        meta: 'female',
      },
    ])

    const result = await SpeechifyService.listCompatibleVoices('pt-BR', 'speechify-cache-key')

    expect(result).toEqual([
      {
        id: 'cached-voice',
        label: 'Cached Voice',
        locale: 'pt-BR',
        provider: 'speechify',
        previewUrl: null,
        avatarUrl: null,
        meta: 'female',
      },
    ])
    expect(fetch).not.toHaveBeenCalled()
  })

  it('usa cache persistido da ElevenLabs sem chamar a rede', async () => {
    mockGetCachedTtsVoiceOptions.mockResolvedValue([
      {
        id: 'eleven-cached',
        label: 'Eleven Cached',
        locale: 'pt-BR',
        provider: 'elevenlabs',
        previewUrl: null,
        meta: 'BR',
      },
    ])
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)

    const result = await ElevenLabsService.listCompatibleVoices('pt-BR', 'eleven-key')

    expect(result).toEqual([
      {
        id: 'eleven-cached',
        label: 'Eleven Cached',
        locale: 'pt-BR',
        provider: 'elevenlabs',
        previewUrl: null,
        meta: 'BR',
      },
    ])
    expect(mockGetCachedTtsVoiceOptions).toHaveBeenCalledWith(12345, 24 * 60 * 60 * 1000)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('salva vozes compativeis da ElevenLabs no cache persistido', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({
      voices: [
        {
          voice_id: 'voice-pt',
          name: 'Luna',
          labels: { accent: 'BR', gender: 'female' },
          preview_url: 'https://cdn.example/luna.mp3',
          verified_languages: [
            { language: 'pt', model_id: 'eleven_multilingual_v2', locale: 'pt-BR' },
          ],
        },
      ],
      has_more: false,
      next_page_token: null,
    }), { status: 200 })))

    const result = await ElevenLabsService.listCompatibleVoices('pt-BR', 'eleven-key')

    expect(result).toEqual([
      {
        id: 'voice-pt',
        label: 'Luna',
        locale: 'pt-BR',
        provider: 'elevenlabs',
        previewUrl: 'https://cdn.example/luna.mp3',
        meta: 'BR · female',
      },
    ])
    expect(mockSetCachedTtsVoiceOptions).toHaveBeenCalledWith({
      cacheKey: 12345,
      provider: 'elevenlabs',
      language: 'pt-BR',
      voices: result,
    })
  })

  it('normaliza vozes da Speechify em snake_case para a UI', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify([
      {
        id: 'silvia',
        display_name: 'Sílvia',
        locale: 'pt-BR',
        gender: 'female',
        preview_audio: 'https://cdn.example/silvia.mp3',
        avatar_image: 'https://cdn.example/silvia.webp',
        models: [
          {
            name: 'simba-multilingual',
            languages: [
              {
                locale: 'pt-BR',
                preview_audio: 'https://cdn.example/silvia-pt.mp3',
              },
            ],
          },
        ],
      },
    ]), { status: 200 })))

    const result = await SpeechifyService.listCompatibleVoices('pt-BR', 'speechify-list-key')

    expect(result).toEqual([
      {
        id: 'silvia',
        label: 'Sílvia',
        locale: 'pt-BR',
        provider: 'speechify',
        previewUrl: 'https://cdn.example/silvia-pt.mp3',
        avatarUrl: 'https://cdn.example/silvia.webp',
        meta: 'female',
      },
    ])
    expect(mockSetCachedTtsVoiceOptions).toHaveBeenCalledOnce()
  })

  it('normaliza o texto antes de sintetizar com Speechify', async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({
      audio_data: 'YQ==',
      speech_marks: [],
    }), { status: 200 }))
    vi.stubGlobal('fetch', fetchMock)

    await SpeechifyService.synthesize('  Hello\n\nworld\t ', {
      apiKey: 'valid-key',
      language: 'en-US',
      rate: 1,
    })

    const init = fetchMock.mock.calls[0][1] as RequestInit
    const body = JSON.parse(String(init.body))
    expect(body.input).toBe('Hello world')
  })
})
