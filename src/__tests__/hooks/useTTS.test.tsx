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

  play = vi.fn(async () => undefined)
  pause = vi.fn(() => {
    queueMicrotask(() => {
      this.dispatchEvent(new Event('pause'))
    })
  })

  constructor(public readonly src: string) {
    super()
    FakeAudio.instances.push(this)
  }

  finish() {
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
})
