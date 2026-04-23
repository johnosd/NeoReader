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
})
