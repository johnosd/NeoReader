import { useRef } from 'react'
import { act, renderHook } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useTTS } from '@/hooks/useTTS'
import { useTranslatedAudiobook } from '@/hooks/useTranslatedAudiobook'
import type { TtsChunk } from '@/components/reader/EpubViewer'

// Regressão do bug audiobook-traduzido-pula-restante-secao (R09 do code review
// 2026-10-10): integra os dois hooks REAIS, com a tradução do próximo parágrafo
// ainda pendente quando a fala do parágrafo atual termina.

const mocks = vi.hoisted(() => ({
  // Tipado pra mock.calls expor { text } (o texto falado).
  speak: vi.fn<(options: { text: string }) => Promise<void>>(),
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

type TranslateResult = { translatedText: string; provider: 'mymemory' }

const flush = async () => { await act(async () => { for (let i = 0; i < 20; i++) await Promise.resolve() }) }
const spokenTexts = () => mocks.speak.mock.calls.map(([options]) => options.text)

// Monta leitor traduzido mínimo: 1ª tradução resolve na hora, 2ª fica pendente
// até o teste chamar resolveNext/rejectNext.
async function setupTranslatedPlayback(paragraphs = ['First.', 'Second.']) {
  let resolveNext: (value: TranslateResult) => void = () => undefined
  let rejectNext: (error: unknown) => void = () => undefined
  mocks.translate.mockResolvedValueOnce({ translatedText: 'Primeiro.', provider: 'mymemory' })
    .mockImplementationOnce(() => new Promise((resolve, reject) => { resolveNext = resolve; rejectNext = reject }))
  const finished = vi.fn()
  const stopped = vi.fn()
  const fatal = vi.fn()

  const { result } = renderHook(() => {
    const translated = useTranslatedAudiobook({ getParagraphs: () => paragraphs, onFatalFailure: fatal })
    const chunksRef = useRef<TtsChunk[]>([])
    const tts = useTTS({ provider: 'native', language: 'pt-BR', rate: 1,
      onWordHighlight: vi.fn(), onStop: stopped, onFinished: finished,
      onParagraphChange: (idx) => translated.advanceToNextParagraph(idx, chunksRef.current),
      waitForMoreChunks: translated.waitForMoreChunks,
    })
    return { translated, tts, chunksRef }
  })

  let chunks: TtsChunk[] = []
  await act(async () => { chunks = (await result.current.translated.buildInitialChunks(0, 'en', 'pt-BR', 'mymemory'))! })
  // Mesmo array por referência que o ReaderScreen guarda em translatedChunksArrayRef.
  result.current.chunksRef.current = chunks
  let playback: Promise<void> = Promise.resolve()
  act(() => { playback = result.current.tts.play(chunks) })
  await flush()

  return {
    result, finished, stopped, fatal,
    playback: () => playback,
    resolveNext: (value: TranslateResult) => resolveNext(value),
    rejectNext: (error: unknown) => rejectNext(error),
  }
}

describe('Leitura traduzida: espera a tradução do próximo parágrafo', () => {
  beforeEach(() => {
    mocks.speak.mockReset().mockResolvedValue(undefined)
    mocks.stop.mockClear()
    mocks.translate.mockReset()
  })

  it('não encerra a seção enquanto a tradução está pendente e retoma quando ela chega', async () => {
    const s = await setupTranslatedPlayback()

    // Fala do 1º parágrafo terminou, 2º ainda traduzindo: nada de fim natural.
    expect(s.result.current.translated.hasPendingTranslation()).toBe(true)
    expect(spokenTexts()).toEqual(['Primeiro.'])
    expect(s.finished).not.toHaveBeenCalled()
    expect(s.result.current.tts.isPlaying).toBe(true)

    await act(async () => { s.resolveNext({ translatedText: 'Segundo.', provider: 'mymemory' }); await s.playback() })
    await flush()

    expect(spokenTexts()).toEqual(['Primeiro.', 'Segundo.'])
    // Só agora (sem mais parágrafos) é fim de verdade.
    expect(s.finished).toHaveBeenCalledTimes(1)
    s.result.current.translated.cancel()
  })

  it('stop() durante a espera encerra a sessão sem onFinished e ignora a tradução tardia', async () => {
    const s = await setupTranslatedPlayback()

    await act(async () => { await s.result.current.tts.stop() })
    await act(async () => { await s.playback() })
    expect(s.stopped).toHaveBeenCalled()
    expect(s.finished).not.toHaveBeenCalled()
    expect(s.result.current.tts.isPlaying).toBe(false)

    await act(async () => { s.resolveNext({ translatedText: 'Segundo.', provider: 'mymemory' }) })
    await flush()
    expect(spokenTexts()).toEqual(['Primeiro.'])
    expect(s.finished).not.toHaveBeenCalled()
    s.result.current.translated.cancel()
  })

  it('pause() durante a espera resolve sem travar e deixa o próximo chunk como posição de retomada', async () => {
    const s = await setupTranslatedPlayback()

    let pauseSettled = false
    await act(async () => { await s.result.current.tts.pause(); pauseSettled = true })
    await act(async () => { await s.playback() })

    expect(pauseSettled).toBe(true)
    expect(s.result.current.tts.isPaused).toBe(true)
    expect(s.finished).not.toHaveBeenCalled()
    // Índice 1 = 1º chunk do parágrafo que ainda não foi falado.
    expect(s.result.current.tts.lastChunkIdx.current).toBe(1)
    s.result.current.translated.cancel()
  })

  it('erro do produtor durante a espera chama onFatalFailure e não avança de seção', async () => {
    const s = await setupTranslatedPlayback()

    await act(async () => { s.rejectNext(new Error('network down')); await s.playback() })
    await flush()

    expect(s.fatal).toHaveBeenCalledTimes(1)
    expect(s.finished).not.toHaveBeenCalled()
    expect(s.stopped).toHaveBeenCalled()
    expect(spokenTexts()).toEqual(['Primeiro.'])
    s.result.current.translated.cancel()
  })

  it('cancel() da sessão traduzida durante a espera não é tratado como fim natural', async () => {
    const s = await setupTranslatedPlayback()

    await act(async () => {
      s.result.current.translated.cancel()
      // O mock de translate não observa o abort — a resposta tardia chega e é descartada.
      s.resolveNext({ translatedText: 'Segundo.', provider: 'mymemory' })
      await s.playback()
    })
    await flush()

    expect(s.finished).not.toHaveBeenCalled()
    expect(spokenTexts()).toEqual(['Primeiro.'])
  })

  it('fim real da seção (sem mais parágrafos) ainda chama onFinished', async () => {
    mocks.translate.mockResolvedValueOnce({ translatedText: 'Único.', provider: 'mymemory' })
    const finished = vi.fn()
    const { result } = renderHook(() => {
      const translated = useTranslatedAudiobook({ getParagraphs: () => ['Only.'], onFatalFailure: vi.fn() })
      const chunksRef = useRef<TtsChunk[]>([])
      const tts = useTTS({ provider: 'native', language: 'pt-BR', rate: 1,
        onWordHighlight: vi.fn(), onStop: vi.fn(), onFinished: finished,
        onParagraphChange: (idx) => translated.advanceToNextParagraph(idx, chunksRef.current),
        waitForMoreChunks: translated.waitForMoreChunks,
      })
      return { translated, tts, chunksRef }
    })
    let chunks: TtsChunk[] = []
    await act(async () => { chunks = (await result.current.translated.buildInitialChunks(0, 'en', 'pt-BR', 'mymemory'))! })
    result.current.chunksRef.current = chunks
    await act(async () => { await result.current.tts.play(chunks) })
    await flush()

    expect(spokenTexts()).toEqual(['Único.'])
    expect(finished).toHaveBeenCalledTimes(1)
    result.current.translated.cancel()
  })
})
