import { useRef } from 'react'
import { act, renderHook } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useTTS } from '@/hooks/useTTS'
import { useTranslatedAudiobook } from '@/hooks/useTranslatedAudiobook'
import type { TtsChunk } from '@/components/reader/EpubViewer'

const mocks = vi.hoisted(() => ({
  speak: vi.fn(async () => undefined),
  stop: vi.fn(async () => undefined),
  translate: vi.fn(),
}))
vi.mock('@capacitor-community/text-to-speech', () => ({ TextToSpeech: {
  speak: mocks.speak, stop: mocks.stop,
  addListener: async () => ({ remove: async () => undefined }),
}}))
vi.mock('@/services/NativeTtsService', () => ({ NativeTtsService: { resolveVoiceIndex: async () => undefined } }))
vi.mock('@/services/TtsPlaybackSessionService', () => ({ TtsPlaybackSessionService: {
  start: async () => undefined, stop: async () => undefined, updatePlaybackState: async () => undefined,
}}))
vi.mock('@/services/WakeLockService', () => ({ WakeLockService: {
  keepAwake: async () => undefined, allowSleep: async () => undefined,
}}))
vi.mock('@/services/TranslationService', () => ({ MAX_CHARS: 500, translate: mocks.translate }))

const flush = async () => { await act(async () => { for (let i = 0; i < 20; i++) await Promise.resolve() }) }
const callbacks = () => ({ onWordHighlight: vi.fn(), onParagraphChange: vi.fn(), onStop: vi.fn(), onFinished: vi.fn() })

// Passing probes confirm the observed faulty behavior; they are not fix acceptance tests.
describe('Review probes: audiobook sequencing', () => {
  beforeEach(() => { mocks.speak.mockReset().mockResolvedValue(undefined); mocks.stop.mockClear(); mocks.translate.mockReset() })

  it('R08: native pause remains pending after stop acknowledges interruption', async () => {
    mocks.speak.mockImplementation(() => new Promise<void>(() => undefined))
    const { result } = renderHook(() => useTTS({ provider: 'native', language: 'en', rate: 1, ...callbacks() }))
    let playback: Promise<void>
    act(() => { playback = result.current.play([{ text: 'Synthetic sentence.', paraIdx: 0, offsetInPara: 0 }]) })
    await flush()
    expect(mocks.speak).toHaveBeenCalled()
    let pauseSettled = false
    act(() => { void result.current.pause().then(() => { pauseSettled = true }) })
    await flush()
    expect(mocks.stop).toHaveBeenCalled()
    expect(pauseSettled).toBe(false)
    await act(async () => { await result.current.stop(); await playback! })
    expect(pauseSettled).toBe(true)
  })

  it('R09: translated playback finishes while the next paragraph is still translating', async () => {
    let resolveNext: (value: { translatedText: string; provider: 'mymemory' }) => void = () => undefined
    mocks.translate.mockResolvedValueOnce({ translatedText: 'Primeiro.', provider: 'mymemory' })
      .mockImplementationOnce(() => new Promise((resolve) => { resolveNext = resolve }))
    const finished = vi.fn()
    const { result } = renderHook(() => {
      const translated = useTranslatedAudiobook({ getParagraphs: () => ['First.', 'Second.'], onFatalFailure: vi.fn() })
      const chunksRef = useRef<TtsChunk[]>([])
      const tts = useTTS({ provider: 'native', language: 'pt-BR', rate: 1,
        onWordHighlight: vi.fn(), onStop: vi.fn(), onFinished: finished,
        onParagraphChange: (idx) => translated.advanceToNextParagraph(idx, chunksRef.current),
      })
      return { translated, tts, chunksRef }
    })
    let chunks: TtsChunk[] = []
    await act(async () => { chunks = (await result.current.translated.buildInitialChunks(0, 'en', 'pt-BR', 'mymemory'))! })
    // Keep the same array as the current render's callback, like ReaderScreen's useRef.
    result.current.chunksRef.current = chunks
    let playback: Promise<void>
    act(() => { playback = result.current.tts.play(chunks) })
    await flush()
    expect(result.current.translated.hasPendingTranslation()).toBe(true)
    expect(finished).toHaveBeenCalledTimes(1)
    expect(mocks.speak).toHaveBeenCalledTimes(1)
    await act(async () => { resolveNext({ translatedText: 'Segundo.', provider: 'mymemory' }); await playback! })
    await flush()
    expect(mocks.speak).toHaveBeenCalledTimes(1)
    result.current.translated.cancel()
  })
})

