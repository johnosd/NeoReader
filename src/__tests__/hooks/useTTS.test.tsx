import { act, renderHook } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useTTS } from '@/hooks/useTTS'
import type { TtsChunk } from '@/components/reader/EpubViewer'

const textToSpeechMock = vi.hoisted(() => {
  const listeners = new Set<(payload: { start: number; end: number }) => void>()

  return {
    addListener: vi.fn(async (_event: string, callback: (payload: { start: number; end: number }) => void) => {
      listeners.add(callback)
      return {
        remove: vi.fn(async () => {
          listeners.delete(callback)
        }),
      }
    }),
    speak: vi.fn(async () => undefined),
    stop: vi.fn(async () => undefined),
    reset() {
      listeners.clear()
      this.addListener.mockClear()
      this.speak.mockClear()
      this.stop.mockClear()
    },
  }
})

const speechifyMock = vi.hoisted(() => ({
  getApiKey: vi.fn(async () => ''),
  isConfigured: vi.fn(async () => false),
  synthesize: vi.fn(async (text: string) => ({
    audioBlob: new Blob([text], { type: 'audio/mpeg' }),
    speechMarks: [],
  })),
}))

const elevenLabsMock = vi.hoisted(() => ({
  getApiKey: vi.fn(async () => ''),
  isConfigured: vi.fn(async () => false),
  synthesize: vi.fn(async (text: string) => ({
    audioBlob: new Blob([text], { type: 'audio/mpeg' }),
    speechMarks: [],
  })),
}))

vi.mock('@capacitor-community/text-to-speech', () => ({
  TextToSpeech: textToSpeechMock,
}))

vi.mock('@/services/SpeechifyService', () => ({
  SpeechifyService: speechifyMock,
}))

vi.mock('@/services/ElevenLabsService', () => ({
  ElevenLabsService: elevenLabsMock,
}))

vi.mock('@/services/NativeTtsService', () => ({
  NativeTtsService: {
    resolveVoiceIndex: vi.fn(async () => undefined),
  },
}))

class FakeAudio extends EventTarget {
  static instances: FakeAudio[] = []

  currentTime = 0
  duration = 2
  ended = false
  paused = true
  play = vi.fn(async () => {
    this.paused = false
    this.dispatchEvent(new Event('play'))
  })
  pause = vi.fn(() => {
    this.paused = true
    queueMicrotask(() => {
      this.dispatchEvent(new Event('pause'))
    })
  })

  constructor(public readonly src: string) {
    super()
    FakeAudio.instances.push(this)
  }

  finish() {
    this.ended = true
    this.dispatchEvent(new Event('ended'))
  }

  static reset() {
    FakeAudio.instances = []
  }
}

function createCallbacks() {
  return {
    onWordHighlight: vi.fn(),
    onParagraphChange: vi.fn(),
    onProviderFallback: vi.fn(),
    onStop: vi.fn(),
    onFinished: vi.fn(),
  }
}

async function flushMicrotasks() {
  await act(async () => {
    await Promise.resolve()
    await Promise.resolve()
  })
}

describe('useTTS', () => {
  beforeEach(() => {
    textToSpeechMock.reset()
    speechifyMock.getApiKey.mockReset()
    speechifyMock.isConfigured.mockReset()
    speechifyMock.synthesize.mockReset()
    speechifyMock.getApiKey.mockResolvedValue('')
    speechifyMock.isConfigured.mockResolvedValue(false)
    speechifyMock.synthesize.mockImplementation(async (text: string) => ({
      audioBlob: new Blob([text], { type: 'audio/mpeg' }),
      speechMarks: [],
    }))
    elevenLabsMock.getApiKey.mockReset()
    elevenLabsMock.isConfigured.mockReset()
    elevenLabsMock.synthesize.mockReset()
    elevenLabsMock.getApiKey.mockResolvedValue('')
    elevenLabsMock.isConfigured.mockResolvedValue(false)
    elevenLabsMock.synthesize.mockImplementation(async (text: string) => ({
      audioBlob: new Blob([text], { type: 'audio/mpeg' }),
      speechMarks: [],
    }))

    FakeAudio.reset()
    vi.stubGlobal('Audio', FakeAudio)
    Object.defineProperty(URL, 'createObjectURL', {
      configurable: true,
      value: vi.fn(() => 'blob:mock'),
    })
    Object.defineProperty(URL, 'revokeObjectURL', {
      configurable: true,
      value: vi.fn(),
    })
  })

  it('encerra o TTS nativo ao desmontar o hook', async () => {
    let resolveSpeak: (() => void) | undefined
    textToSpeechMock.speak.mockImplementationOnce(() => new Promise<void>((resolve) => {
      resolveSpeak = resolve
    }))

    const callbacks = createCallbacks()
    const { result, unmount } = renderHook(() => useTTS({
      ...callbacks,
      provider: 'native',
      language: 'en-US',
      rate: 1,
    }))
    const chunks: TtsChunk[] = [
      { text: 'Long native playback.', paraIdx: 0, offsetInPara: 0 },
    ]

    let playPromise: Promise<void> = Promise.resolve()
    await act(async () => {
      playPromise = result.current.play(chunks, 0)
    })
    await flushMicrotasks()

    expect(textToSpeechMock.speak).toHaveBeenCalledOnce()

    unmount()

    expect(textToSpeechMock.stop).toHaveBeenCalledOnce()

    await act(async () => {
      resolveSpeak?.()
      await playPromise
    })

    expect(callbacks.onStop).not.toHaveBeenCalled()
    expect(callbacks.onFinished).not.toHaveBeenCalled()
  })

  it('encerra o audio premium ao desmontar o hook', async () => {
    speechifyMock.getApiKey.mockResolvedValue('speechify-key')
    speechifyMock.isConfigured.mockResolvedValue(true)

    const callbacks = createCallbacks()
    const { result, unmount } = renderHook(() => useTTS({
      ...callbacks,
      provider: 'speechify',
      language: 'en-US',
      rate: 1,
    }))
    const chunks: TtsChunk[] = [
      { text: 'Long premium playback.', paraIdx: 0, offsetInPara: 0 },
    ]

    let playPromise: Promise<void> = Promise.resolve()
    await act(async () => {
      playPromise = result.current.play(chunks, 0)
    })
    await flushMicrotasks()

    expect(FakeAudio.instances.length).toBe(1)

    unmount()

    expect(FakeAudio.instances[0]?.pause).toHaveBeenCalledOnce()
    expect(URL.revokeObjectURL).toHaveBeenCalledOnce()

    await act(async () => {
      await playPromise
    })

    expect(callbacks.onStop).not.toHaveBeenCalled()
    expect(callbacks.onFinished).not.toHaveBeenCalled()
  })

  it('interrompe o audiobook atual antes de tocar um speakOne via Speechify', async () => {
    speechifyMock.getApiKey.mockResolvedValue('speechify-key')
    speechifyMock.isConfigured.mockResolvedValue(true)

    const callbacks = createCallbacks()
    const { result } = renderHook(() => useTTS({
      ...callbacks,
      provider: 'speechify',
      language: 'en-US',
      rate: 1,
    }))
    const chunks: TtsChunk[] = [
      { text: 'First paragraph.', paraIdx: 0, offsetInPara: 0 },
      { text: 'Second paragraph.', paraIdx: 1, offsetInPara: 0 },
    ]

    await act(async () => {
      void result.current.play(chunks, 0)
    })
    await flushMicrotasks()

    expect(FakeAudio.instances.length).toBe(1)
    expect(callbacks.onParagraphChange).toHaveBeenCalledWith(0)
    expect(result.current.isPlaying).toBe(true)

    let speakPromise: Promise<void> | undefined
    await act(async () => {
      speakPromise = result.current.speakOne('Inline snippet.')
      await Promise.resolve()
      await Promise.resolve()
    })

    expect(FakeAudio.instances[0]?.pause).toHaveBeenCalledTimes(1)
    expect(FakeAudio.instances.length).toBe(2)
    expect(result.current.isPlaying).toBe(false)

    await act(async () => {
      FakeAudio.instances[1]?.finish()
      await speakPromise
    })

    expect(callbacks.onStop).toHaveBeenCalled()
    expect(speechifyMock.synthesize).toHaveBeenNthCalledWith(1, 'First paragraph.', {
      apiKey: 'speechify-key',
      language: 'en-US',
      rate: 1,
      voiceId: undefined,
    })
    expect(speechifyMock.synthesize).toHaveBeenNthCalledWith(2, 'Inline snippet.', {
      apiKey: 'speechify-key',
      language: 'en-US',
      rate: 1,
      voiceId: undefined,
    })
  })

  it('pausa e retoma audio premium sem sintetizar o chunk novamente', async () => {
    speechifyMock.getApiKey.mockResolvedValue('speechify-key')
    speechifyMock.isConfigured.mockResolvedValue(true)

    const callbacks = createCallbacks()
    const { result } = renderHook(() => useTTS({
      ...callbacks,
      provider: 'speechify',
      language: 'en-US',
      rate: 1,
    }))
    const chunks: TtsChunk[] = [
      { text: 'First paragraph.', paraIdx: 0, offsetInPara: 0 },
    ]

    let playPromise: Promise<void> | undefined
    await act(async () => {
      playPromise = result.current.play(chunks, 0)
    })
    await flushMicrotasks()

    expect(FakeAudio.instances.length).toBe(1)
    expect(result.current.isPlaying).toBe(true)

    await act(async () => {
      await result.current.pause()
      await Promise.resolve()
    })

    expect(result.current.isPlaying).toBe(false)
    expect(result.current.isPaused).toBe(true)
    expect(URL.revokeObjectURL).not.toHaveBeenCalled()

    await act(async () => {
      await result.current.resume()
      await Promise.resolve()
    })

    expect(result.current.isPlaying).toBe(true)
    expect(result.current.isPaused).toBe(false)
    expect(FakeAudio.instances[0]?.play).toHaveBeenCalledTimes(2)
    expect(speechifyMock.synthesize).toHaveBeenCalledTimes(1)

    await act(async () => {
      FakeAudio.instances[0]?.finish()
      await playPromise
    })

    expect(URL.revokeObjectURL).toHaveBeenCalledTimes(1)
    expect(callbacks.onFinished).toHaveBeenCalledOnce()
  })

  it('normaliza speech marks em segundos antes de destacar palavras premium', async () => {
    vi.useFakeTimers()
    try {
      speechifyMock.getApiKey.mockResolvedValue('speechify-key')
      speechifyMock.isConfigured.mockResolvedValue(true)
      speechifyMock.synthesize.mockResolvedValueOnce({
        audioBlob: new Blob(['Say hello now.'], { type: 'audio/mpeg' }),
        speechMarks: [
          { start_time: 0.5, end_time: 0.8, start: 4, end: 9, value: 'hello' },
        ],
      })

      const callbacks = createCallbacks()
      const { result } = renderHook(() => useTTS({
        ...callbacks,
        provider: 'speechify',
        language: 'en-US',
        rate: 1,
      }))
      const chunks: TtsChunk[] = [
        { text: 'Say hello now.', paraIdx: 2, offsetInPara: 10 },
      ]

      let playPromise: Promise<void> | undefined
      await act(async () => {
        playPromise = result.current.play(chunks, 0)
      })
      await flushMicrotasks()

      await act(async () => {
        vi.advanceTimersByTime(639)
        await Promise.resolve()
      })
      expect(callbacks.onWordHighlight).not.toHaveBeenCalledWith(2, 14, 19)

      await act(async () => {
        vi.advanceTimersByTime(1)
        await Promise.resolve()
      })
      expect(callbacks.onWordHighlight).toHaveBeenCalledWith(2, 14, 19)

      await act(async () => {
        FakeAudio.instances[0]?.finish()
        await playPromise
      })
    } finally {
      vi.clearAllTimers()
      vi.useRealTimers()
    }
  })

  it('gera marcas estimadas quando audio premium nao retorna speech marks', async () => {
    vi.useFakeTimers()
    try {
      speechifyMock.getApiKey.mockResolvedValue('speechify-key')
      speechifyMock.isConfigured.mockResolvedValue(true)
      speechifyMock.synthesize.mockResolvedValueOnce({
        audioBlob: new Blob(['First word.'], { type: 'audio/mpeg' }),
        speechMarks: [],
      })

      const callbacks = createCallbacks()
      const { result } = renderHook(() => useTTS({
        ...callbacks,
        provider: 'speechify',
        language: 'en-US',
        rate: 1,
      }))
      const chunks: TtsChunk[] = [
        { text: 'First word.', paraIdx: 1, offsetInPara: 3 },
      ]

      let playPromise: Promise<void> | undefined
      await act(async () => {
        playPromise = result.current.play(chunks, 0)
      })
      await flushMicrotasks()

      await act(async () => {
        vi.advanceTimersByTime(141)
        await Promise.resolve()
      })

      expect(callbacks.onWordHighlight).toHaveBeenCalledWith(1, 3, 8)

      await act(async () => {
        FakeAudio.instances[0]?.finish()
        await playPromise
      })
    } finally {
      vi.clearAllTimers()
      vi.useRealTimers()
    }
  })

  it('gera marcas estimadas no TTS nativo quando o motor nao envia eventos de range', async () => {
    vi.useFakeTimers()
    try {
      let resolveSpeak: (() => void) | undefined
      textToSpeechMock.speak.mockImplementationOnce(() => new Promise<void>((resolve) => {
        resolveSpeak = resolve
      }))

      const callbacks = createCallbacks()
      const { result } = renderHook(() => useTTS({
        ...callbacks,
        provider: 'native',
        language: 'en-US',
        rate: 1,
      }))
      const chunks: TtsChunk[] = [
        { text: 'Native word.', paraIdx: 3, offsetInPara: 5 },
      ]

      let playPromise: Promise<void> | undefined
      await act(async () => {
        playPromise = result.current.play(chunks, 0)
      })
      await flushMicrotasks()

      await act(async () => {
        vi.advanceTimersByTime(321)
        await Promise.resolve()
      })

      expect(callbacks.onWordHighlight).toHaveBeenCalledWith(3, 5, 11)

      await act(async () => {
        resolveSpeak?.()
        await playPromise
      })
    } finally {
      vi.clearAllTimers()
      vi.useRealTimers()
    }
  })

  it('usa TTS nativo como fallback quando Speechify falha em um chunk', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    speechifyMock.getApiKey.mockResolvedValue('speechify-key')
    speechifyMock.isConfigured.mockResolvedValue(true)
    speechifyMock.synthesize.mockRejectedValueOnce(new Error('Speechify error: 500'))

    const callbacks = createCallbacks()
    const { result } = renderHook(() => useTTS({
      ...callbacks,
      provider: 'speechify',
      language: 'en-US',
      rate: 1,
    }))
    const chunks: TtsChunk[] = [
      { text: 'Speechify fails here.', paraIdx: 0, offsetInPara: 0 },
    ]

    await act(async () => {
      await result.current.play(chunks, 0)
    })

    expect(speechifyMock.synthesize).toHaveBeenCalledOnce()
    expect(textToSpeechMock.speak).toHaveBeenCalledWith(expect.objectContaining({
      text: 'Speechify fails here.',
      lang: 'en-US',
    }))
    expect(callbacks.onProviderFallback).toHaveBeenCalledWith({
      provider: 'speechify',
      fallbackProvider: 'native',
    })
    expect(callbacks.onFinished).toHaveBeenCalledOnce()
    expect(callbacks.onStop).toHaveBeenCalledOnce()

    warnSpy.mockRestore()
  })

  it('nao chama Speechify novamente nos chunks seguintes apos falha premium', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    speechifyMock.getApiKey.mockResolvedValue('speechify-key')
    speechifyMock.isConfigured.mockResolvedValue(true)
    speechifyMock.synthesize.mockRejectedValueOnce(new Error('Speechify error: 500'))

    const callbacks = createCallbacks()
    const { result } = renderHook(() => useTTS({
      ...callbacks,
      provider: 'speechify',
      language: 'en-US',
      rate: 1,
    }))
    const chunks: TtsChunk[] = [
      { text: 'Speechify fails here.', paraIdx: 0, offsetInPara: 0 },
      { text: 'Next chunk should use native directly.', paraIdx: 1, offsetInPara: 0 },
    ]

    await act(async () => {
      await result.current.play(chunks, 0)
    })

    expect(speechifyMock.synthesize).toHaveBeenCalledTimes(1)
    expect(textToSpeechMock.speak).toHaveBeenCalledTimes(2)
    expect(textToSpeechMock.speak).toHaveBeenNthCalledWith(2, expect.objectContaining({
      text: 'Next chunk should use native directly.',
      lang: 'en-US',
    }))
    expect(callbacks.onProviderFallback).toHaveBeenCalledOnce()

    warnSpy.mockRestore()
  })
})
