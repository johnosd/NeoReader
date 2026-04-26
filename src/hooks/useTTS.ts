import { useEffect, useRef, useState } from 'react'
import { TextToSpeech } from '@capacitor-community/text-to-speech'
import type { TtsChunk } from '../components/reader/EpubViewer'
import { ElevenLabsService } from '../services/ElevenLabsService'
import { NativeTtsService } from '../services/NativeTtsService'
import { SpeechifyService } from '../services/SpeechifyService'
import type { TtsPlaybackConfig, TtsProvider } from '../types/tts'
import { clampTtsRate, normalizeLanguageTag } from '../utils/language'

type AudioSpeechMark = {
  start_time: number
  end_time?: number
  start: number
  end: number
}

const WORD_HIGHLIGHT_SYNC_DELAY_MS = 140
const NATIVE_RANGE_FALLBACK_DELAY_MS = 180

interface UseTTSOptions extends TtsPlaybackConfig {
  onWordHighlight: (paraIdx: number, start: number, end: number) => void
  onParagraphChange: (paraIdx: number) => void
  onProviderFallback?: (payload: { provider: TtsProvider; fallbackProvider: 'native' }) => void
  onStop: () => void
  onFinished?: () => void
}

async function resolveConfiguredProvider(provider: TtsProvider): Promise<TtsProvider> {
  if (provider === 'speechify') {
    return await SpeechifyService.isConfigured() ? 'speechify' : 'native'
  }
  if (provider === 'elevenlabs') {
    return await ElevenLabsService.isConfigured() ? 'elevenlabs' : 'native'
  }
  return 'native'
}

function replaceSpeechControlCharacters(text: string) {
  let result = ''

  for (const character of text) {
    const code = character.charCodeAt(0)
    result += code <= 8 || code === 11 || code === 12 || (code >= 14 && code <= 31) || code === 127
      ? ' '
      : character
  }

  return result
}

function normalizeChunkText(text: string) {
  return replaceSpeechControlCharacters(text)
    .replace(/\s+/g, ' ')
    .trim()
}

function logPremiumTtsFallback(provider: TtsProvider, error: unknown) {
  console.warn(`${provider} TTS failed; falling back to native TTS.`, error)
}

function logTtsPlaybackError(error: unknown) {
  console.warn('TTS playback failed.', error)
}

function getAudioDurationMs(audio: HTMLAudioElement): number | null {
  const durationMs = audio.duration * 1000
  return Number.isFinite(durationMs) && durationMs > 0 ? durationMs : null
}

function normalizeSpeechMarkTimes(speechMarks: AudioSpeechMark[], durationMs: number | null): AudioSpeechMark[] {
  const validMarks = speechMarks.filter((mark) =>
    Number.isFinite(mark.start_time) &&
    Number.isFinite(mark.start) &&
    Number.isFinite(mark.end) &&
    mark.end > mark.start,
  )
  if (validMarks.length === 0) return []

  const maxTime = Math.max(...validMarks.map((mark) => mark.end_time ?? mark.start_time))
  const durationSeconds = durationMs ? durationMs / 1000 : null
  const hasFractionalTimes = validMarks.some((mark) =>
    !Number.isInteger(mark.start_time) || (mark.end_time != null && !Number.isInteger(mark.end_time)),
  )
  const timesLookLikeSeconds = durationSeconds
    ? maxTime > 0 && maxTime <= durationSeconds * 1.25 + 1
    : hasFractionalTimes && maxTime < 600
  const scale = timesLookLikeSeconds ? 1000 : 1

  return validMarks.map((mark) => ({
    ...mark,
    start_time: Math.round(mark.start_time * scale),
    ...(mark.end_time != null ? { end_time: Math.round(mark.end_time * scale) } : {}),
  }))
}

function estimateSpeechMarks(text: string, durationMs: number | null): AudioSpeechMark[] {
  const matches = Array.from(text.matchAll(/\S+/g))
  if (matches.length === 0) return []

  const estimatedDurationMs = durationMs ?? Math.max(900, text.length * 55)
  const slotMs = estimatedDurationMs / matches.length

  return matches.map((match, index) => {
    const start = match.index ?? 0
    return {
      start,
      end: start + match[0].length,
      start_time: Math.max(0, Math.round(index * slotMs)),
      end_time: Math.max(0, Math.round((index + 0.85) * slotMs)),
    }
  })
}

function resolveSpeechMarks(speechMarks: AudioSpeechMark[], text: string, durationMs: number | null): AudioSpeechMark[] {
  const normalizedMarks = normalizeSpeechMarkTimes(speechMarks, durationMs)
  return normalizedMarks.length > 0 ? normalizedMarks : estimateSpeechMarks(text, durationMs)
}

export function useTTS(options: UseTTSOptions) {
  const [isPlaying, setIsPlaying] = useState(false)
  const [isPaused, setIsPaused] = useState(false)
  const shouldStopRef = useRef(false)
  const pauseRequestedRef = useRef(false)
  const callbacksRef = useRef({
    onWordHighlight: options.onWordHighlight,
    onParagraphChange: options.onParagraphChange,
    onProviderFallback: options.onProviderFallback,
    onStop: options.onStop,
    onFinished: options.onFinished,
  })
  const configRef = useRef<TtsPlaybackConfig>({
    provider: options.provider,
    language: options.language,
    rate: options.rate,
    speechifyVoiceId: options.speechifyVoiceId,
    elevenLabsVoiceId: options.elevenLabsVoiceId,
    nativeVoiceKey: options.nativeVoiceKey,
  })
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const activeProviderRef = useRef<TtsProvider>('native')
  const lastChunkIdxRef = useRef(0)
  const playSessionRef = useRef(0)
  const playbackDoneRef = useRef<Promise<void>>(Promise.resolve())
  const activeChunksRef = useRef<TtsChunk[]>([])
  const stopPremiumPlaybackRef = useRef<(() => void) | null>(null)
  const nativeRangeEventSeenRef = useRef(false)

  function updatePaused(next: boolean) {
    pauseRequestedRef.current = next
    setIsPaused(next)
  }

  useEffect(() => {
    callbacksRef.current = {
      onWordHighlight: options.onWordHighlight,
      onParagraphChange: options.onParagraphChange,
      onProviderFallback: options.onProviderFallback,
      onStop: options.onStop,
      onFinished: options.onFinished,
    }
  }, [options.onFinished, options.onParagraphChange, options.onProviderFallback, options.onStop, options.onWordHighlight])

  useEffect(() => {
    configRef.current = {
      provider: options.provider,
      language: options.language,
      rate: options.rate,
      speechifyVoiceId: options.speechifyVoiceId,
      elevenLabsVoiceId: options.elevenLabsVoiceId,
      nativeVoiceKey: options.nativeVoiceKey,
    }
  }, [
    options.provider,
    options.language,
    options.rate,
    options.speechifyVoiceId,
    options.elevenLabsVoiceId,
    options.nativeVoiceKey,
  ])

  useEffect(() => {
    return () => {
      const hasPlaybackSession = playSessionRef.current > 0 || audioRef.current || stopPremiumPlaybackRef.current
      if (!hasPlaybackSession) return

      shouldStopRef.current = true
      pauseRequestedRef.current = false
      playSessionRef.current += 1

      audioRef.current?.pause()
      stopPremiumPlaybackRef.current?.()
      audioRef.current = null

      void TextToSpeech.stop().catch(logTtsPlaybackError)
    }
  }, [])

  async function playAudioBlob(
    text: string,
    audioBlob: Blob,
    speechMarks: AudioSpeechMark[],
    paraIdx: number,
    offsetInPara: number,
    session: number,
    trackPlaybackState = true,
  ) {
    if (shouldStopRef.current || playSessionRef.current !== session) return

    const url = URL.createObjectURL(audioBlob)
    const audio = new Audio(url)
    audioRef.current = audio
    let timers: ReturnType<typeof setTimeout>[] = []

    const clearTimers = () => {
      timers.forEach(clearTimeout)
      timers = []
    }

    const scheduleMarks = () => {
      clearTimers()
      const elapsedMs = audio.currentTime * 1000
      const activeSpeechMarks = resolveSpeechMarks(speechMarks, text, getAudioDurationMs(audio))
      timers = activeSpeechMarks
        .filter(mark => mark.start_time + WORD_HIGHLIGHT_SYNC_DELAY_MS >= elapsedMs - 25)
        .map((mark) =>
          setTimeout(() => {
            if (!shouldStopRef.current && playSessionRef.current === session && !audio.paused) {
              callbacksRef.current.onWordHighlight(paraIdx, offsetInPara + mark.start, offsetInPara + mark.end)
            }
          }, Math.max(0, mark.start_time + WORD_HIGHLIGHT_SYNC_DELAY_MS - elapsedMs)),
        )
    }

    return new Promise<void>((resolve) => {
      let resolved = false

      const cleanup = () => {
        if (resolved) return
        resolved = true
        clearTimers()
        URL.revokeObjectURL(url)
        if (audioRef.current === audio) audioRef.current = null
        if (stopPremiumPlaybackRef.current === cleanup) stopPremiumPlaybackRef.current = null
        resolve()
      }

      stopPremiumPlaybackRef.current = cleanup

      const handlePause = () => {
        clearTimers()
        if (shouldStopRef.current || playSessionRef.current !== session || audio.ended) {
          cleanup()
          return
        }
        if (trackPlaybackState) {
          updatePaused(true)
          setIsPlaying(false)
        }
      }

      const handlePlay = () => {
        if (shouldStopRef.current || playSessionRef.current !== session) return
        if (trackPlaybackState) {
          updatePaused(false)
          setIsPlaying(true)
        }
        scheduleMarks()
      }

      const handleMetadata = () => {
        if (shouldStopRef.current || playSessionRef.current !== session || audio.paused) return
        scheduleMarks()
      }

      audio.addEventListener('play', handlePlay)
      audio.addEventListener('loadedmetadata', handleMetadata)
      audio.addEventListener('durationchange', handleMetadata)
      audio.addEventListener('ended', cleanup, { once: true })
      audio.addEventListener('pause', handlePause)
      audio.addEventListener('error', cleanup, { once: true })
      scheduleMarks()
      void audio.play()
    })
  }

  async function speakWithSpeechify(text: string, paraIdx: number, offsetInPara: number, session: number, trackPlaybackState = true) {
    const config = configRef.current
    const apiKey = await SpeechifyService.getApiKey()
    if (!apiKey) throw new Error('Speechify not configured')
    const result = await SpeechifyService.synthesize(text, {
      apiKey,
      language: config.language,
      rate: config.rate,
      voiceId: config.speechifyVoiceId,
    })
    await playAudioBlob(text, result.audioBlob, result.speechMarks, paraIdx, offsetInPara, session, trackPlaybackState)
  }

  async function speakWithElevenLabs(text: string, paraIdx: number, offsetInPara: number, session: number, trackPlaybackState = true) {
    const config = configRef.current
    const apiKey = await ElevenLabsService.getApiKey()
    if (!apiKey) throw new Error('ElevenLabs not configured')
    const voiceId = config.elevenLabsVoiceId
    if (!voiceId) throw new Error('ElevenLabs voice missing')
    const result = await ElevenLabsService.synthesize(text, {
      apiKey,
      voiceId,
      language: config.language,
      rate: config.rate,
    })
    await playAudioBlob(text, result.audioBlob, result.speechMarks, paraIdx, offsetInPara, session, trackPlaybackState)
  }

  function scheduleSyntheticWordHighlights(text: string, paraIdx: number, offsetInPara: number, session: number) {
    const estimatedDurationMs = Math.max(900, text.length * 55 / clampTtsRate(configRef.current.rate))
    const timers = estimateSpeechMarks(text, estimatedDurationMs).map((mark) =>
      setTimeout(() => {
        if (shouldStopRef.current || playSessionRef.current !== session) return
        callbacksRef.current.onWordHighlight(paraIdx, offsetInPara + mark.start, offsetInPara + mark.end)
      }, mark.start_time + WORD_HIGHLIGHT_SYNC_DELAY_MS),
    )

    return () => timers.forEach(clearTimeout)
  }

  async function speakWithNative(text: string, session: number, paraIdx?: number, offsetInPara = 0) {
    const config = configRef.current
    const language = normalizeLanguageTag(config.language)
    const rate = clampTtsRate(config.rate)
    const voice = await NativeTtsService.resolveVoiceIndex(config.nativeVoiceKey, language)
    let clearSyntheticHighlights = () => {}
    const syntheticDelay = paraIdx === undefined
      ? null
      : setTimeout(() => {
          if (nativeRangeEventSeenRef.current || shouldStopRef.current || playSessionRef.current !== session) return
          clearSyntheticHighlights = scheduleSyntheticWordHighlights(text, paraIdx, offsetInPara, session)
        }, NATIVE_RANGE_FALLBACK_DELAY_MS)

    try {
      await TextToSpeech.speak({
        text,
        lang: language,
        rate,
        ...(voice !== undefined ? { voice } : {}),
      })
      if (shouldStopRef.current || playSessionRef.current !== session) return
    } finally {
      if (syntheticDelay) clearTimeout(syntheticDelay)
      clearSyntheticHighlights()
    }
  }

  async function fallbackToNative(text: string, session: number, paraIdx?: number, offsetInPara = 0) {
    activeProviderRef.current = 'native'
    await speakWithNative(text, session, paraIdx, offsetInPara)
  }

  async function play(chunks: TtsChunk[], startIdx = 0) {
    const mySession = ++playSessionRef.current
    let resolvePlaybackDone = () => {}
    playbackDoneRef.current = new Promise<void>((resolve) => {
      resolvePlaybackDone = resolve
    })

    shouldStopRef.current = false
    activeChunksRef.current = chunks
    nativeRangeEventSeenRef.current = false
    updatePaused(false)
    setIsPlaying(true)

    const resolvedProvider = await resolveConfiguredProvider(configRef.current.provider).catch(() => 'native' as const)
    let playbackProvider = resolvedProvider
    activeProviderRef.current = resolvedProvider
    const currentChunkRef = { current: chunks[startIdx] ?? chunks[0] }
    let nativeHandle: Awaited<ReturnType<typeof TextToSpeech.addListener>> | null = null
    let playbackError: unknown = null
    let providerFallbackNotified = false

    const notifyProviderFallback = (provider: TtsProvider) => {
      if (providerFallbackNotified) return
      providerFallbackNotified = true
      callbacksRef.current.onProviderFallback?.({ provider, fallbackProvider: 'native' })
    }

    if (resolvedProvider === 'native') {
      nativeHandle = await TextToSpeech.addListener('onRangeStart', ({ start, end }) => {
        if (shouldStopRef.current || playSessionRef.current !== mySession) return
        nativeRangeEventSeenRef.current = true
        const chunk = currentChunkRef.current
        callbacksRef.current.onWordHighlight(chunk.paraIdx, chunk.offsetInPara + start, chunk.offsetInPara + end)
      })
    }

    try {
      for (let index = startIdx; index < chunks.length; index += 1) {
        if (shouldStopRef.current || playSessionRef.current !== mySession) break

        const chunk = chunks[index]
        const text = normalizeChunkText(chunk.text)
        if (!text) continue
        currentChunkRef.current = chunk
        lastChunkIdxRef.current = index

        if (index === startIdx || chunks[index - 1].paraIdx !== chunk.paraIdx) {
          callbacksRef.current.onParagraphChange(chunk.paraIdx)
        }

        if (playbackProvider === 'speechify') {
          activeProviderRef.current = 'speechify'
          try {
            await speakWithSpeechify(text, chunk.paraIdx, chunk.offsetInPara, mySession)
          } catch (error) {
            if (shouldStopRef.current || playSessionRef.current !== mySession) break
            logPremiumTtsFallback('speechify', error)
            playbackProvider = 'native'
            notifyProviderFallback('speechify')
            await fallbackToNative(text, mySession, chunk.paraIdx, chunk.offsetInPara)
          }
        } else if (playbackProvider === 'elevenlabs') {
          activeProviderRef.current = 'elevenlabs'
          try {
            await speakWithElevenLabs(text, chunk.paraIdx, chunk.offsetInPara, mySession)
          } catch (error) {
            if (shouldStopRef.current || playSessionRef.current !== mySession) break
            logPremiumTtsFallback('elevenlabs', error)
            playbackProvider = 'native'
            notifyProviderFallback('elevenlabs')
            await fallbackToNative(text, mySession, chunk.paraIdx, chunk.offsetInPara)
          }
        } else {
          activeProviderRef.current = 'native'
          await speakWithNative(text, mySession, chunk.paraIdx, chunk.offsetInPara)
        }
      }
    } catch (error) {
      playbackError = error
      logTtsPlaybackError(error)
    } finally {
      resolvePlaybackDone()
      await nativeHandle?.remove()
      if (playSessionRef.current === mySession) {
        setIsPlaying(false)
        if (pauseRequestedRef.current) {
          setIsPaused(true)
        } else if (!shouldStopRef.current && !playbackError) {
          lastChunkIdxRef.current = 0
          setIsPaused(false)
          callbacksRef.current.onFinished?.()
          callbacksRef.current.onStop()
        } else {
          setIsPaused(false)
          callbacksRef.current.onStop()
        }
      }
    }
  }

  async function pause() {
    if (!isPlaying) return
    const playbackDone = playbackDoneRef.current
    updatePaused(true)
    setIsPlaying(false)

    if (activeProviderRef.current === 'native') {
      shouldStopRef.current = true
      await TextToSpeech.stop()
      await playbackDone
      return
    }

    audioRef.current?.pause()
  }

  async function resume() {
    if (!pauseRequestedRef.current) return false

    if (activeProviderRef.current === 'native') {
      const chunks = activeChunksRef.current
      const startIdx = lastChunkIdxRef.current
      if (chunks.length === 0 || startIdx >= chunks.length) return false
      void play(chunks, startIdx)
      return true
    }

    const audio = audioRef.current
    if (!audio) return false

    shouldStopRef.current = false
    updatePaused(false)
    setIsPlaying(true)
    await audio.play()
    return true
  }

  async function stop() {
    const playbackDone = playbackDoneRef.current
    shouldStopRef.current = true
    updatePaused(false)

    if (activeProviderRef.current === 'native') {
      await TextToSpeech.stop()
    } else {
      audioRef.current?.pause()
      stopPremiumPlaybackRef.current?.()
    }

    await playbackDone
  }

  async function speakOne(text: string) {
    await stop()
    const mySession = ++playSessionRef.current
    let resolvePlaybackDone = () => {}
    playbackDoneRef.current = new Promise<void>((resolve) => {
      resolvePlaybackDone = resolve
    })

    shouldStopRef.current = false
    nativeRangeEventSeenRef.current = false
    updatePaused(false)
    const resolvedProvider = await resolveConfiguredProvider(configRef.current.provider).catch(() => 'native' as const)
    activeProviderRef.current = resolvedProvider
    const normalizedText = normalizeChunkText(text)
    let speakOneError: unknown = null
    let providerFallbackNotified = false

    const notifyProviderFallback = (provider: TtsProvider) => {
      if (providerFallbackNotified) return
      providerFallbackNotified = true
      callbacksRef.current.onProviderFallback?.({ provider, fallbackProvider: 'native' })
    }

    let nativeHandle: Awaited<ReturnType<typeof TextToSpeech.addListener>> | null = null
    if (resolvedProvider === 'native') {
      nativeHandle = await TextToSpeech.addListener('onRangeStart', ({ start, end }) => {
        if (shouldStopRef.current || playSessionRef.current !== mySession) return
        nativeRangeEventSeenRef.current = true
        callbacksRef.current.onWordHighlight(0, start, end)
      })
    }

    try {
      if (!normalizedText) return
      if (resolvedProvider === 'speechify') {
        activeProviderRef.current = 'speechify'
        try {
          await speakWithSpeechify(normalizedText, 0, 0, mySession, false)
        } catch (error) {
          if (shouldStopRef.current || playSessionRef.current !== mySession) return
          logPremiumTtsFallback('speechify', error)
          notifyProviderFallback('speechify')
          await fallbackToNative(normalizedText, mySession)
        }
      } else if (resolvedProvider === 'elevenlabs') {
        activeProviderRef.current = 'elevenlabs'
        try {
          await speakWithElevenLabs(normalizedText, 0, 0, mySession, false)
        } catch (error) {
          if (shouldStopRef.current || playSessionRef.current !== mySession) return
          logPremiumTtsFallback('elevenlabs', error)
          notifyProviderFallback('elevenlabs')
          await fallbackToNative(normalizedText, mySession)
        }
      } else {
        activeProviderRef.current = 'native'
        await speakWithNative(normalizedText, mySession)
      }
    } catch (error) {
      speakOneError = error
      logTtsPlaybackError(error)
    } finally {
      resolvePlaybackDone()
      await nativeHandle?.remove()
      if (playSessionRef.current === mySession && !speakOneError) {
        callbacksRef.current.onStop()
      }
    }
  }

  function resetPosition() {
    lastChunkIdxRef.current = 0
  }

  return { isPlaying, isPaused, play, pause, resume, stop, speakOne, lastChunkIdx: lastChunkIdxRef, resetPosition }
}
