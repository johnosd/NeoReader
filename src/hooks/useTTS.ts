import { useEffect, useRef, useState } from 'react'
import { TextToSpeech } from '@capacitor-community/text-to-speech'
import type { TtsChunk } from '../components/reader/EpubViewer'
import { ElevenLabsService } from '../services/ElevenLabsService'
import { NativeTtsService } from '../services/NativeTtsService'
import { SpeechifyService } from '../services/SpeechifyService'
import type { TtsPlaybackConfig, TtsProvider } from '../types/tts'
import { clampTtsRate, normalizeLanguageTag } from '../utils/language'

interface UseTTSOptions extends TtsPlaybackConfig {
  onWordHighlight: (paraIdx: number, start: number, end: number) => void
  onParagraphChange: (paraIdx: number) => void
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

export function useTTS(options: UseTTSOptions) {
  const [isPlaying, setIsPlaying] = useState(false)
  const shouldStopRef = useRef(false)
  const callbacksRef = useRef({
    onWordHighlight: options.onWordHighlight,
    onParagraphChange: options.onParagraphChange,
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

  useEffect(() => {
    callbacksRef.current = {
      onWordHighlight: options.onWordHighlight,
      onParagraphChange: options.onParagraphChange,
      onStop: options.onStop,
      onFinished: options.onFinished,
    }
  }, [options.onFinished, options.onParagraphChange, options.onStop, options.onWordHighlight])

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

  async function playAudioBlob(
    audioBlob: Blob,
    speechMarks: Array<{ start_time: number; start: number; end: number }>,
    paraIdx: number,
    offsetInPara: number,
    session: number,
  ) {
    if (shouldStopRef.current || playSessionRef.current !== session) return

    const url = URL.createObjectURL(audioBlob)
    const audio = new Audio(url)
    audioRef.current = audio
    const timers = speechMarks.map((mark) =>
      setTimeout(() => {
        if (!shouldStopRef.current && playSessionRef.current === session) {
          callbacksRef.current.onWordHighlight(paraIdx, offsetInPara + mark.start, offsetInPara + mark.end)
        }
      }, mark.start_time),
    )

    return new Promise<void>((resolve) => {
      const cleanup = () => {
        timers.forEach(clearTimeout)
        URL.revokeObjectURL(url)
        if (audioRef.current === audio) audioRef.current = null
        resolve()
      }

      audio.addEventListener('ended', cleanup, { once: true })
      audio.addEventListener('pause', cleanup, { once: true })
      audio.addEventListener('error', cleanup, { once: true })
      void audio.play()
    })
  }

  async function speakWithSpeechify(text: string, paraIdx: number, offsetInPara: number, session: number) {
    const config = configRef.current
    const apiKey = await SpeechifyService.getApiKey()
    if (!apiKey) throw new Error('Speechify not configured')
    const result = await SpeechifyService.synthesize(text, {
      apiKey,
      language: config.language,
      rate: config.rate,
      voiceId: config.speechifyVoiceId,
    })
    await playAudioBlob(result.audioBlob, result.speechMarks, paraIdx, offsetInPara, session)
  }

  async function speakWithElevenLabs(text: string, paraIdx: number, offsetInPara: number, session: number) {
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
    await playAudioBlob(result.audioBlob, result.speechMarks, paraIdx, offsetInPara, session)
  }

  async function speakWithNative(text: string, session: number) {
    const config = configRef.current
    const language = normalizeLanguageTag(config.language)
    const rate = clampTtsRate(config.rate)
    const voice = await NativeTtsService.resolveVoiceIndex(config.nativeVoiceKey, language)
    await TextToSpeech.speak({
      text,
      lang: language,
      rate,
      ...(voice !== undefined ? { voice } : {}),
    })
    if (shouldStopRef.current || playSessionRef.current !== session) return
  }

  async function play(chunks: TtsChunk[], startIdx = 0) {
    const mySession = ++playSessionRef.current
    let resolvePlaybackDone = () => {}
    playbackDoneRef.current = new Promise<void>((resolve) => {
      resolvePlaybackDone = resolve
    })

    shouldStopRef.current = false
    setIsPlaying(true)

    const resolvedProvider = await resolveConfiguredProvider(configRef.current.provider)
    activeProviderRef.current = resolvedProvider
    const currentChunkRef = { current: chunks[startIdx] ?? chunks[0] }
    let nativeHandle: Awaited<ReturnType<typeof TextToSpeech.addListener>> | null = null

    if (resolvedProvider === 'native') {
      nativeHandle = await TextToSpeech.addListener('onRangeStart', ({ start, end }) => {
        if (shouldStopRef.current || playSessionRef.current !== mySession) return
        const chunk = currentChunkRef.current
        callbacksRef.current.onWordHighlight(chunk.paraIdx, chunk.offsetInPara + start, chunk.offsetInPara + end)
      })
    }

    try {
      for (let index = startIdx; index < chunks.length; index += 1) {
        if (shouldStopRef.current || playSessionRef.current !== mySession) break

        const chunk = chunks[index]
        currentChunkRef.current = chunk
        lastChunkIdxRef.current = index

        if (index === startIdx || chunks[index - 1].paraIdx !== chunk.paraIdx) {
          callbacksRef.current.onParagraphChange(chunk.paraIdx)
        }

        if (resolvedProvider === 'speechify') {
          await speakWithSpeechify(chunk.text, chunk.paraIdx, chunk.offsetInPara, mySession)
        } else if (resolvedProvider === 'elevenlabs') {
          await speakWithElevenLabs(chunk.text, chunk.paraIdx, chunk.offsetInPara, mySession)
        } else {
          await speakWithNative(chunk.text, mySession)
        }
      }
    } finally {
      resolvePlaybackDone()
      await nativeHandle?.remove()
      if (playSessionRef.current === mySession) {
        setIsPlaying(false)
        if (!shouldStopRef.current) {
          lastChunkIdxRef.current = 0
          callbacksRef.current.onFinished?.()
        }
        callbacksRef.current.onStop()
      }
    }
  }

  async function stop() {
    const playbackDone = playbackDoneRef.current
    shouldStopRef.current = true

    if (activeProviderRef.current === 'native') {
      await TextToSpeech.stop()
    } else {
      audioRef.current?.pause()
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
    const resolvedProvider = await resolveConfiguredProvider(configRef.current.provider)
    activeProviderRef.current = resolvedProvider

    let nativeHandle: Awaited<ReturnType<typeof TextToSpeech.addListener>> | null = null
    if (resolvedProvider === 'native') {
      nativeHandle = await TextToSpeech.addListener('onRangeStart', ({ start, end }) => {
        if (shouldStopRef.current || playSessionRef.current !== mySession) return
        callbacksRef.current.onWordHighlight(0, start, end)
      })
    }

    try {
      if (resolvedProvider === 'speechify') {
        await speakWithSpeechify(text, 0, 0, mySession)
      } else if (resolvedProvider === 'elevenlabs') {
        await speakWithElevenLabs(text, 0, 0, mySession)
      } else {
        await speakWithNative(text, mySession)
      }
    } finally {
      resolvePlaybackDone()
      await nativeHandle?.remove()
      if (playSessionRef.current === mySession) {
        callbacksRef.current.onStop()
      }
    }
  }

  function resetPosition() {
    lastChunkIdxRef.current = 0
  }

  return { isPlaying, play, stop, speakOne, lastChunkIdx: lastChunkIdxRef, resetPosition }
}
