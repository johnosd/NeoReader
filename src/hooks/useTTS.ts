import { useEffect, useRef, useState } from 'react'
import { TextToSpeech } from '@capacitor-community/text-to-speech'
import { WakeLockService } from '../services/WakeLockService'
import { TtsPlaybackSessionService, type TtsAudioFocusType } from '../services/TtsPlaybackSessionService'
import type { TtsChunk } from '../components/reader/EpubViewer'
import { NativeTtsService } from '../services/NativeTtsService'
import { createFlowId, getDiagnosticsNowMs, logError, logEvent, logWarn } from '../services/DiagnosticsLogger'
import {
  getCachedPremiumTtsAudio,
  setCachedPremiumTtsAudio,
  type PremiumTtsAudioCacheParams,
} from '../services/TtsAudioCache'
import {
  getPremiumTtsApiKey,
  getTtsProviderLabel,
  isPremiumTtsProvider,
  resolveConfiguredTtsProvider,
  synthesizePremiumTts,
} from '../services/TtsProviderRegistry'
import type { TtsPlaybackConfig, TtsProvider } from '../types/tts'
import { clampTtsRate, normalizeLanguageTag } from '../utils/language'
import { getPlaybackTtsVoiceId } from '../utils/ttsVoiceSelection'
import { useI18n, type TranslateFn } from '../i18n'

type AudioSpeechMark = {
  start_time: number
  end_time?: number
  start: number
  end: number
}

type TtsPlaybackMode = 'continuous' | 'inline'
type TtsPlaybackStopReason = 'finished' | 'stopped' | 'paused' | 'error'

const WORD_HIGHLIGHT_SYNC_DELAY_MS = 140
const NATIVE_RANGE_FALLBACK_DELAY_MS = 180

interface UseTTSOptions extends TtsPlaybackConfig {
  bookId?: number
  bookTitle?: string
  onWordHighlight: (paraIdx: number, start: number, end: number) => void
  onParagraphChange: (paraIdx: number) => void
  onProviderFallback?: (payload: { provider: TtsProvider; fallbackProvider: 'native'; reason: string; transient: boolean }) => void
  onStop: () => void
  onFinished?: () => void
  onError?: (error: unknown) => void
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

function getErrorMessage(error: unknown): string {
  if (error instanceof DOMException) return error.message || error.name
  if (error instanceof Error) return error.message
  return String(error)
}

function getHttpStatusFromError(message: string): number | null {
  const match = message.match(/(?:error|status)[:\s]+(\d{3})/i)
  if (!match) return null

  const status = Number(match[1])
  return Number.isFinite(status) ? status : null
}

function getPremiumFallbackReason(provider: TtsProvider, error: unknown, t: TranslateFn): string {
  const providerLabel = getTtsProviderLabel(provider)
  const message = getErrorMessage(error)
  const normalized = message.toLowerCase()
  const status = getHttpStatusFromError(message)

  if (normalized.includes('not configured')) {
    return t('tts.fallbackReason.notConfigured', { provider: providerLabel })
  }
  if (normalized.includes('empty input')) {
    return t('tts.fallbackReason.emptyInput')
  }
  if (normalized.includes('compatible voice missing')) {
    return t('tts.fallbackReason.compatibleVoiceMissing', { provider: providerLabel })
  }
  if (normalized.includes('voice missing')) {
    return t('tts.fallbackReason.voiceMissing', { provider: providerLabel })
  }
  if (normalized.includes('aborted') || normalized.includes('aborterror')) {
    return t('tts.fallbackReason.timeout', { provider: providerLabel })
  }
  if (normalized.includes('failed to fetch') || normalized.includes('networkerror')) {
    return t('tts.fallbackReason.network', { provider: providerLabel })
  }

  if (status === 400) return t('tts.fallbackReason.badRequest', { provider: providerLabel })
  if (status === 401 || status === 403) return t('tts.fallbackReason.invalidKey', { provider: providerLabel })
  if (status === 402) return t('tts.fallbackReason.noCredits', { provider: providerLabel })
  if (status === 404) return t('tts.fallbackReason.voiceNotFound', { provider: providerLabel })
  if (status === 408) return t('tts.fallbackReason.timeout', { provider: providerLabel })
  if (status === 409) return t('tts.fallbackReason.voiceRejected', { provider: providerLabel })
  if (status === 413) return t('tts.fallbackReason.payloadTooLarge')
  if (status === 422) return t('tts.fallbackReason.unprocessable', { provider: providerLabel })
  if (status === 429) return t('tts.fallbackReason.rateLimited', { provider: providerLabel })
  if (status && status >= 500) return t('tts.fallbackReason.providerUnavailable', { provider: providerLabel })

  return t('tts.fallbackReason.unexpected', { provider: providerLabel })
}

// Erros transientes: AbortError (WebView suspensa, timeout) e erros de rede.
// Nesses casos o provider premium pode ter sucesso na próxima tentativa,
// então o loop não troca permanentemente para native.
function isTransientTtsFailure(error: unknown): boolean {
  if (error instanceof DOMException && error.name === 'AbortError') return true
  const message = getErrorMessage(error)
  const normalized = message.toLowerCase()
  return (
    normalized.includes('aborted') ||
    normalized.includes('failed to fetch') ||
    normalized.includes('networkerror')
  )
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
  const { t } = useI18n()
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
    onError: options.onError,
  })
  const configRef = useRef<TtsPlaybackConfig>({
    provider: options.provider,
    language: options.language,
    rate: options.rate,
    speechifyVoiceId: options.speechifyVoiceId,
    elevenLabsVoiceId: options.elevenLabsVoiceId,
    nativeVoiceKey: options.nativeVoiceKey,
    voiceSelections: options.voiceSelections,
  })
  // Identifica o livro pro Service nativo (notificação/MediaSession) — useTTS
  // continua agnóstico do resto de Book, só repassa esses dois campos.
  const bookInfoRef = useRef({ bookId: options.bookId, bookTitle: options.bookTitle })
  const audioRef = useRef<HTMLAudioElement | null>(null)
  // Elemento <audio> persistente reaproveitado entre chunks premium (ver playAudioBlob) —
  // um `new Audio()` por chunk fazia o WebMediaPlayer do Chromium pedir/devolver foco de
  // áudio a cada parágrafo, mascarando nosso AudioFocusRequestCompat nativo (R-003).
  const sharedPremiumAudioElementRef = useRef<HTMLAudioElement | null>(null)
  const activeProviderRef = useRef<TtsProvider>('native')
  const lastChunkIdxRef = useRef(0)
  const playSessionRef = useRef(0)
  const playbackDoneRef = useRef<Promise<void>>(Promise.resolve())
  const activeChunksRef = useRef<TtsChunk[]>([])
  const stopPremiumPlaybackRef = useRef<(() => void) | null>(null)
  const nativeRangeEventSeenRef = useRef(false)
  const playbackFlowIdRef = useRef<string | null>(null)
  const playbackModeRef = useRef<TtsPlaybackMode | null>(null)
  const playbackStopReasonRef = useRef<TtsPlaybackStopReason | null>(null)
  // Prevents duplicate TextToSpeech.stop() calls when stop() is invoked concurrently.
  const nativeStopPendingRef = useRef(false)
  const premiumSynthesisAbortControllerRef = useRef<AbortController | null>(null)
  // Resolve function registrado pelo speakWithNative ativo. Quando TextToSpeech.stop()
  // confirma o stop no Android, chamamos este resolver para desbloquear o Promise.race
  // dentro de speakWithNative — o speak() nativo nunca rejeita/resolve por conta própria
  // ao ser interrompido, causando deadlock no await playbackDone dentro de stop().
  const nativeSpeakStopAckRef = useRef<(() => void)>(() => {})
  // true quando a última pausa foi causada por perda TRANSITÓRIA de foco de áudio
  // (ex: ligação) — só nesse caso o retorno do foco retoma sozinho (handleAudioFocusChange).
  const pausedByTransientFocusLossRef = useRef(false)

  function updatePaused(next: boolean) {
    pauseRequestedRef.current = next
    setIsPaused(next)
  }

  function getPlaybackLogDetails(extra: Record<string, unknown> = {}) {
    return {
      mode: playbackModeRef.current,
      chunkIndex: lastChunkIdxRef.current,
      ...extra,
    }
  }

  function logPlaybackEvent(
    eventName: string,
    provider: TtsProvider,
    status: 'start' | 'success',
    details: Record<string, unknown> = {},
  ) {
    logEvent(eventName, {
      flowId: playbackFlowIdRef.current ?? undefined,
      provider,
      status,
      details: getPlaybackLogDetails(details),
    })
  }

  function logPlaybackError(error: unknown, details: Record<string, unknown> = {}) {
    logError('tts.playback.error', error, {
      flowId: playbackFlowIdRef.current ?? undefined,
      provider: activeProviderRef.current,
      status: 'failure',
      details: getPlaybackLogDetails(details),
    })
  }

  useEffect(() => {
    callbacksRef.current = {
      onWordHighlight: options.onWordHighlight,
      onParagraphChange: options.onParagraphChange,
      onProviderFallback: options.onProviderFallback,
      onStop: options.onStop,
      onFinished: options.onFinished,
      onError: options.onError,
    }
  }, [options.onError, options.onFinished, options.onParagraphChange, options.onProviderFallback, options.onStop, options.onWordHighlight])

  useEffect(() => {
    configRef.current = {
      provider: options.provider,
      language: options.language,
      rate: options.rate,
      speechifyVoiceId: options.speechifyVoiceId,
      elevenLabsVoiceId: options.elevenLabsVoiceId,
      nativeVoiceKey: options.nativeVoiceKey,
      voiceSelections: options.voiceSelections,
    }
  }, [
    options.provider,
    options.language,
    options.rate,
    options.speechifyVoiceId,
    options.elevenLabsVoiceId,
    options.nativeVoiceKey,
    options.voiceSelections,
  ])

  useEffect(() => {
    bookInfoRef.current = { bookId: options.bookId, bookTitle: options.bookTitle }
  }, [options.bookId, options.bookTitle])

  useEffect(() => {
    return () => {
      // Skip if stop() was already called — avoids duplicate TextToSpeech.stop()/
      // allowSleep() when the user explicitly stopped before unmount. Não basta checar
      // shouldStopRef sozinho: pause() do provider nativo também o marca (pra quebrar o
      // loop de speak()), mas pause() NUNCA chama TtsPlaybackSessionService.stop() (a
      // notificação deve continuar ativa durante a pausa) — sem o !pauseRequestedRef aqui,
      // pausar e sair (Back) deixava o TtsPlaybackService/wake lock vazando pra sempre,
      // já que este cleanup também pulava a limpeza (achado em code review).
      if (shouldStopRef.current && !pauseRequestedRef.current) return

      const hasPlaybackSession = playSessionRef.current > 0 || audioRef.current || stopPremiumPlaybackRef.current
      if (!hasPlaybackSession) return

      shouldStopRef.current = true
      pauseRequestedRef.current = false
      playSessionRef.current += 1

      audioRef.current?.pause()
      stopPremiumPlaybackRef.current?.()
      audioRef.current = null

      void TextToSpeech.stop().catch(logTtsPlaybackError)
      void WakeLockService.allowSleep()
      void TtsPlaybackSessionService.stop()
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
    onPlayStarted?: () => void,
  ) {
    if (shouldStopRef.current || playSessionRef.current !== session) return

    const url = URL.createObjectURL(audioBlob)
    if (!sharedPremiumAudioElementRef.current) {
      sharedPremiumAudioElementRef.current = new Audio()
    }
    const audio = sharedPremiumAudioElementRef.current
    audio.src = url
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

    return new Promise<void>((resolve, reject) => {
      let settled = false

      const finish = (error?: unknown) => {
        if (settled) return
        settled = true
        clearTimers()
        audio.removeEventListener('play', handlePlay)
        audio.removeEventListener('loadedmetadata', handleMetadata)
        audio.removeEventListener('durationchange', handleMetadata)
        audio.removeEventListener('ended', cleanup)
        audio.removeEventListener('pause', handlePause)
        audio.removeEventListener('error', handleAudioError)
        URL.revokeObjectURL(url)
        if (audioRef.current === audio) audioRef.current = null
        if (stopPremiumPlaybackRef.current === cleanup) stopPremiumPlaybackRef.current = null
        if (error) {
          if (!shouldStopRef.current && playSessionRef.current === session) {
            logPlaybackError(error, {
              paraIdx,
              offsetInPara,
              trackPlaybackState,
            })
          }
          reject(error)
        } else {
          resolve()
        }
      }

      function cleanup() {
        finish()
      }

      stopPremiumPlaybackRef.current = cleanup

      function handlePause() {
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

      function handlePlay() {
        if (shouldStopRef.current || playSessionRef.current !== session) return
        if (trackPlaybackState) {
          updatePaused(false)
          setIsPlaying(true)
        }
        scheduleMarks()
        onPlayStarted?.()
      }

      function handleMetadata() {
        if (shouldStopRef.current || playSessionRef.current !== session || audio.paused) return
        scheduleMarks()
      }

      function handleAudioError() {
        finish(audio.error ?? new Error('Audio playback failed'))
      }

      audio.addEventListener('play', handlePlay)
      audio.addEventListener('loadedmetadata', handleMetadata)
      audio.addEventListener('durationchange', handleMetadata)
      audio.addEventListener('ended', cleanup, { once: true })
      audio.addEventListener('pause', handlePause)
      audio.addEventListener('error', handleAudioError, { once: true })
      scheduleMarks()
      // Se o usuário pausou enquanto este chunk ainda sintetizava (audioRef
      // era null até agora, pause() não tinha o que pausar), não inicia a
      // reprodução sozinho — o elemento fica pronto (src carregado, listeners
      // presos) pra resume() tocar depois. Sem isso, a pausa era perdida
      // silenciosamente e o áudio começava a tocar assim que a síntese
      // terminasse (achado em code review).
      if (pauseRequestedRef.current) return
      void audio.play().catch(finish)
    })
  }

  async function speakWithPremium(
    provider: Exclude<TtsProvider, 'native'>,
    text: string,
    paraIdx: number,
    offsetInPara: number,
    session: number,
    trackPlaybackState = true,
    onPlayStarted?: () => void,
  ) {
    const config = configRef.current
    const apiKey = await getPremiumTtsApiKey(provider)
    if (!apiKey) throw new Error(`${getTtsProviderLabel(provider)} not configured`)
    const flowId = createFlowId(`tts-${provider}`)
    const startedAt = getDiagnosticsNowMs()
    const voiceId = getPlaybackTtsVoiceId(config, provider)
    const baseDetails = {
      textLength: text.length,
      paraIdx,
      language: config.language,
      rate: config.rate,
      hasVoiceId: Boolean(voiceId),
    }
    const cacheParams: PremiumTtsAudioCacheParams = {
      provider,
      voiceId,
      language: config.language,
      rate: config.rate,
      text,
    }

    logEvent('tts.synthesize.start', {
      flowId,
      provider,
      status: 'start',
      details: baseDetails,
    })

    const cachedResult = getCachedPremiumTtsAudio(cacheParams)
    if (cachedResult) {
      logEvent('tts.synthesize.cache.hit', {
        flowId,
        provider,
        status: 'success',
        durationMs: getDiagnosticsNowMs() - startedAt,
        details: {
          ...baseDetails,
          audioBytes: cachedResult.audioBlob.size,
          speechMarkCount: cachedResult.speechMarks.length,
        },
      })
      logEvent('tts.synthesize.success', {
        flowId,
        provider,
        status: 'success',
        durationMs: getDiagnosticsNowMs() - startedAt,
        details: {
          ...baseDetails,
          audioBytes: cachedResult.audioBlob.size,
          speechMarkCount: cachedResult.speechMarks.length,
          cacheHit: true,
        },
      })
      await playAudioBlob(text, cachedResult.audioBlob, cachedResult.speechMarks, paraIdx, offsetInPara, session, trackPlaybackState, onPlayStarted)
      return
    }

    premiumSynthesisAbortControllerRef.current?.abort()
    const premiumSynthesisAbortController = new AbortController()
    premiumSynthesisAbortControllerRef.current = premiumSynthesisAbortController

    let result: Awaited<ReturnType<typeof synthesizePremiumTts>>
    try {
      result = await synthesizePremiumTts(provider, text, {
        apiKey,
        language: config.language,
        rate: config.rate,
        voiceId,
        signal: premiumSynthesisAbortController.signal,
      })
    } catch (error) {
      logError('tts.synthesize.failure', error, {
        flowId,
        provider,
        status: 'failure',
        durationMs: getDiagnosticsNowMs() - startedAt,
        details: baseDetails,
      })
      throw error
    }

    setCachedPremiumTtsAudio(cacheParams, result)

    logEvent('tts.synthesize.success', {
      flowId,
      provider,
      status: 'success',
      durationMs: getDiagnosticsNowMs() - startedAt,
      details: {
        ...baseDetails,
        audioBytes: result.audioBlob.size,
        speechMarkCount: result.speechMarks.length,
        cacheHit: false,
      },
    })

    await playAudioBlob(text, result.audioBlob, result.speechMarks, paraIdx, offsetInPara, session, trackPlaybackState, onPlayStarted)
  }

  function scheduleSyntheticWordHighlights(
    text: string,
    paraIdx: number,
    offsetInPara: number,
    session: number,
    speechStartedAt: number,
  ) {
    const estimatedDurationMs = Math.max(900, text.length * 55 / clampTtsRate(configRef.current.rate))
    const timers = estimateSpeechMarks(text, estimatedDurationMs)
      .map((mark) => {
        const targetTime = mark.start_time + WORD_HIGHLIGHT_SYNC_DELAY_MS
        const elapsedMs = Math.max(0, performance.now() - speechStartedAt)
        return setTimeout(() => {
          if (
            nativeRangeEventSeenRef.current ||
            shouldStopRef.current ||
            playSessionRef.current !== session
          ) {
            return
          }
          callbacksRef.current.onWordHighlight(paraIdx, offsetInPara + mark.start, offsetInPara + mark.end)
        }, Math.max(0, targetTime - elapsedMs))
      })

    return () => timers.forEach(clearTimeout)
  }

  async function speakWithNative(text: string, session: number, paraIdx?: number, offsetInPara = 0) {
    const config = configRef.current
    const language = normalizeLanguageTag(config.language)
    const rate = clampTtsRate(config.rate)
    const flowId = createFlowId('tts-native')
    const diagnosticsStartedAt = getDiagnosticsNowMs()
    const baseDetails = {
      textLength: text.length,
      paraIdx,
      language,
      rate,
      hasNativeVoiceKey: Boolean(config.nativeVoiceKey),
    }

    logEvent('tts.synthesize.start', {
      flowId,
      provider: 'native',
      status: 'start',
      details: baseDetails,
    })

    let clearSyntheticHighlights = () => {}
    const speechStartedAt = performance.now()
    const syntheticDelay = paraIdx === undefined
      ? null
      : setTimeout(() => {
          if (nativeRangeEventSeenRef.current || shouldStopRef.current || playSessionRef.current !== session) return
          clearSyntheticHighlights = scheduleSyntheticWordHighlights(text, paraIdx, offsetInPara, session, speechStartedAt)
        }, NATIVE_RANGE_FALLBACK_DELAY_MS)

    try {
      const voice = await NativeTtsService.resolveVoiceIndex(config.nativeVoiceKey, language)
      // Promise.race: desbloqueia quando o TTS termina OU quando stop() confirma o stop no Android.
      // O plugin Capacitor TextToSpeech.speak() não rejeita/resolve ao ser interrompido por stop(),
      // causando deadlock quando stop() espera playbackDone. O nativeSpeakStopAckRef permite que
      // stop() sinalize aqui para desbloquear sem precisar de timeout.
      let stopAckResolve: () => void = () => {}
      const stopAckPromise = new Promise<void>((resolve) => { stopAckResolve = resolve })
      nativeSpeakStopAckRef.current = stopAckResolve
      await Promise.race([
        TextToSpeech.speak({
          text,
          lang: language,
          rate,
          ...(voice !== undefined ? { voice } : {}),
        }),
        stopAckPromise,
      ])
      nativeSpeakStopAckRef.current = () => {}
      if (shouldStopRef.current || playSessionRef.current !== session) return
      logEvent('tts.synthesize.success', {
        flowId,
        provider: 'native',
        status: 'success',
        durationMs: getDiagnosticsNowMs() - diagnosticsStartedAt,
        details: {
          ...baseDetails,
          hasResolvedVoice: voice !== undefined,
        },
      })
    } catch (error) {
      nativeSpeakStopAckRef.current = () => {}
      logError('tts.synthesize.failure', error, {
        flowId,
        provider: 'native',
        status: 'failure',
        durationMs: getDiagnosticsNowMs() - diagnosticsStartedAt,
        details: baseDetails,
      })
      throw error
    } finally {
      if (syntheticDelay) clearTimeout(syntheticDelay)
      clearSyntheticHighlights()
    }
  }

  async function fallbackToNative(text: string, session: number, paraIdx?: number, offsetInPara = 0) {
    activeProviderRef.current = 'native'
    await speakWithNative(text, session, paraIdx, offsetInPara)
  }

  // Despacha para o provider correto com fallback automático para native em caso de erro.
  // nativeParaIdx: controla highlights sintéticos no native — undefined desativa (ex: speakOne).
  // Retorna sessionEnded=true se a sessão foi cancelada durante o erro (caller deve parar).
  async function speakChunk(
    provider: TtsProvider,
    text: string,
    paraIdx: number,
    nativeParaIdx: number | undefined,
    offsetInPara: number,
    session: number,
    trackPlaybackState: boolean,
    onFallback: (provider: TtsProvider, error: unknown) => void,
    onPlayStarted?: () => void,
  ): Promise<{ sessionEnded: boolean; usedProvider: TtsProvider }> {
    if (isPremiumTtsProvider(provider)) {
      activeProviderRef.current = provider
      try {
        await speakWithPremium(provider, text, paraIdx, offsetInPara, session, trackPlaybackState, onPlayStarted)
        return { sessionEnded: false, usedProvider: provider }
      } catch (error) {
        if (shouldStopRef.current || playSessionRef.current !== session) {
          return { sessionEnded: true, usedProvider: provider }
        }
        const transient = isTransientTtsFailure(error)
        logPremiumTtsFallback(provider, error)
        logWarn('tts.provider.fallback', {
          provider,
          status: 'fallback',
          error,
          details: {
            fallbackProvider: 'native',
            textLength: text.length,
            paraIdx,
            transient,
          },
        })
        onFallback(provider, error)
        await fallbackToNative(text, session, nativeParaIdx, offsetInPara)
        // Transiente (AbortError/rede): retorna o provider original → loop retenta premium no próximo chunk.
        // Permanente (API error, auth, etc.): retorna 'native' → play() troca playbackProvider definitivamente.
        return { sessionEnded: false, usedProvider: transient ? provider : 'native' }
      }
    }

    activeProviderRef.current = 'native'
    await speakWithNative(text, session, nativeParaIdx, offsetInPara)
    return { sessionEnded: false, usedProvider: 'native' }
  }

  // Pré-sintetiza o próximo chunk enquanto o atual ainda está tocando.
  // O resultado vai para o TtsAudioCache — quando o loop chega no chunk,
  // é cache hit e não precisa de requisição HTTP nova.
  // Garante continuidade com a tela desligada: o próximo chunk já está pronto
  // antes do atual terminar, eliminando o gap onde a WebView poderia estar suspensa.
  async function prefetchPremiumChunk(
    provider: Exclude<TtsProvider, 'native'>,
    chunk: TtsChunk,
    session: number,
  ) {
    const text = normalizeChunkText(chunk.text)
    if (!text) return
    const config = configRef.current
    const apiKey = await getPremiumTtsApiKey(provider)
    if (!apiKey) return
    // Aborta se a sessão mudou (stop chamado ou novo play iniciado)
    if (shouldStopRef.current || playSessionRef.current !== session) return
    const voiceId = getPlaybackTtsVoiceId(config, provider)
    const cacheParams: PremiumTtsAudioCacheParams = {
      provider,
      voiceId,
      language: config.language,
      rate: config.rate,
      text,
    }
    if (getCachedPremiumTtsAudio(cacheParams)) return
    try {
      const result = await synthesizePremiumTts(provider, text, {
        apiKey,
        language: config.language,
        rate: config.rate,
        voiceId,
        // Sem AbortSignal: o prefetch não deve ser cancelado pelo abort do chunk principal
      })
      // Verifica novamente após await — sessão pode ter mudado durante a síntese
      if (shouldStopRef.current || playSessionRef.current !== session) return
      setCachedPremiumTtsAudio(cacheParams, result)
    } catch {
      // Falha silenciosa — o loop principal sintetiza normalmente quando chegar no chunk
    }
  }

  async function play(chunks: TtsChunk[], startIdx = 0) {
    const mySession = ++playSessionRef.current
    const playbackFlowId = createFlowId('tts-playback')
    playbackFlowIdRef.current = playbackFlowId
    playbackModeRef.current = 'continuous'
    playbackStopReasonRef.current = null
    let resolvePlaybackDone = () => {}
    playbackDoneRef.current = new Promise<void>((resolve) => {
      resolvePlaybackDone = resolve
    })

    shouldStopRef.current = false
    nativeStopPendingRef.current = false
    activeChunksRef.current = chunks
    nativeRangeEventSeenRef.current = false
    updatePaused(false)
    setIsPlaying(true)
    void WakeLockService.keepAwake()
    if (bookInfoRef.current.bookId != null) {
      void TtsPlaybackSessionService.start({
        bookId: bookInfoRef.current.bookId,
        title: bookInfoRef.current.bookTitle ?? '',
      })
    }

    const resolvedProvider = await resolveConfiguredTtsProvider(configRef.current.provider).catch(() => 'native' as const)
    let playbackProvider = resolvedProvider
    activeProviderRef.current = resolvedProvider
    logPlaybackEvent('tts.playback.start', resolvedProvider, 'start', {
      requestedProvider: configRef.current.provider,
      startIdx,
      chunkCount: chunks.length,
    })
    const currentChunkRef = { current: chunks[startIdx] ?? chunks[0] }
    let nativeHandle: Awaited<ReturnType<typeof TextToSpeech.addListener>> | null = null
    let playbackError: unknown = null
    let providerFallbackNotified = false

    const notifyProviderFallback = (provider: TtsProvider, error: unknown) => {
      if (providerFallbackNotified) return
      providerFallbackNotified = true
      callbacksRef.current.onProviderFallback?.({
        provider,
        fallbackProvider: 'native',
        reason: getPremiumFallbackReason(provider, error, t),
        transient: isTransientTtsFailure(error),
      })
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

        // Lookahead: quando o áudio deste chunk INICIAR, dispara síntese do próximo
        const nextChunk = chunks[index + 1]
        const lookahead = isPremiumTtsProvider(playbackProvider) && nextChunk
          ? () => { void prefetchPremiumChunk(playbackProvider as Exclude<TtsProvider, 'native'>, nextChunk, mySession) }
          : undefined

        const { sessionEnded, usedProvider } = await speakChunk(
          playbackProvider, text, chunk.paraIdx, chunk.paraIdx,
          chunk.offsetInPara, mySession, true, notifyProviderFallback, lookahead,
        )
        if (sessionEnded) break
        if (usedProvider === 'native' && playbackProvider !== 'native') {
          playbackProvider = 'native'
          // Registra listener de palavra para chunks nativos seguintes ao fallback
          if (!nativeHandle) {
            nativeHandle = await TextToSpeech.addListener('onRangeStart', ({ start, end }) => {
              if (shouldStopRef.current || playSessionRef.current !== mySession) return
              nativeRangeEventSeenRef.current = true
              const chunk = currentChunkRef.current
              callbacksRef.current.onWordHighlight(chunk.paraIdx, chunk.offsetInPara + start, chunk.offsetInPara + end)
            })
          }
        }
      }
    } catch (error) {
      playbackError = error
      playbackStopReasonRef.current = 'error'
      logPlaybackError(error, { phase: 'continuous-playback' })
      logTtsPlaybackError(error)
      callbacksRef.current.onError?.(error)
    } finally {
      resolvePlaybackDone()
      await nativeHandle?.remove()
      if (playSessionRef.current === mySession) {
        const stopReason: TtsPlaybackStopReason = playbackStopReasonRef.current ??
          (playbackError ? 'error' : pauseRequestedRef.current ? 'paused' : shouldStopRef.current ? 'stopped' : 'finished')
        logPlaybackEvent('tts.playback.stop', activeProviderRef.current, 'success', {
          reason: stopReason,
        })
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
    void WakeLockService.allowSleep()
    // Não chama TtsPlaybackSessionService.stop() aqui — a sessão/notificação
    // nativa continua ativa durante a pausa, só o ícone/estado é atualizado.
    void TtsPlaybackSessionService.updatePlaybackState({ state: 'paused' })
    logPlaybackEvent('tts.playback.pause', activeProviderRef.current, 'success')

    if (activeProviderRef.current === 'native') {
      shouldStopRef.current = true
      playbackStopReasonRef.current = 'paused'
      try {
        await TextToSpeech.stop()
        await playbackDone
      } catch (error) {
        playbackStopReasonRef.current = 'error'
        logPlaybackError(error, { phase: 'pause' })
        throw error
      }
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
      logPlaybackEvent('tts.playback.resume', activeProviderRef.current, 'success', {
        startIdx,
      })
      void play(chunks, startIdx)
      return true
    }

    const audio = audioRef.current
    if (!audio) return false

    shouldStopRef.current = false
    updatePaused(false)
    setIsPlaying(true)
    void WakeLockService.keepAwake()
    // Sessão nativa continua rodando desde o play() original (pause() não a
    // encerra) — só precisa sincronizar o estado de volta pra "tocando".
    void TtsPlaybackSessionService.updatePlaybackState({ state: 'playing' })
    try {
      await audio.play()
      logPlaybackEvent('tts.playback.resume', activeProviderRef.current, 'success')
    } catch (error) {
      playbackStopReasonRef.current = 'error'
      logPlaybackError(error, { phase: 'resume' })
      throw error
    }
    return true
  }

  async function stop() {
    const playbackDone = playbackDoneRef.current
    const shouldLogStopIntent = isPlaying || isPaused || pauseRequestedRef.current || Boolean(audioRef.current || stopPremiumPlaybackRef.current)
    shouldStopRef.current = true
    updatePaused(false)
    void WakeLockService.allowSleep()
    void TtsPlaybackSessionService.stop()
    premiumSynthesisAbortControllerRef.current?.abort()
    premiumSynthesisAbortControllerRef.current = null
    if (shouldLogStopIntent) {
      playbackStopReasonRef.current = 'stopped'
    }

    if (activeProviderRef.current === 'native') {
      if (!nativeStopPendingRef.current) {
        nativeStopPendingRef.current = true
        try {
          await TextToSpeech.stop()
          // Android confirmou o stop — desbloqueia o Promise.race em speakWithNative
          // para que o play loop termine e playbackDone resolva.
          nativeSpeakStopAckRef.current()
          nativeSpeakStopAckRef.current = () => {}
        } catch (error) {
          playbackStopReasonRef.current = 'error'
          logPlaybackError(error, { phase: 'stop' })
          throw error
        } finally {
          nativeStopPendingRef.current = false
        }
      }
    } else {
      audioRef.current?.pause()
      stopPremiumPlaybackRef.current?.()
    }

    await playbackDone
  }

  async function speakOne(text: string) {
    await stop()
    const normalizedText = normalizeChunkText(text)
    if (!normalizedText) return

    const mySession = ++playSessionRef.current
    const playbackFlowId = createFlowId('tts-inline-playback')
    playbackFlowIdRef.current = playbackFlowId
    playbackModeRef.current = 'inline'
    playbackStopReasonRef.current = null
    let resolvePlaybackDone = () => {}
    playbackDoneRef.current = new Promise<void>((resolve) => {
      resolvePlaybackDone = resolve
    })

    shouldStopRef.current = false
    nativeStopPendingRef.current = false
    nativeRangeEventSeenRef.current = false
    updatePaused(false)
    const resolvedProvider = await resolveConfiguredTtsProvider(configRef.current.provider).catch(() => 'native' as const)
    activeProviderRef.current = resolvedProvider
    logPlaybackEvent('tts.playback.start', resolvedProvider, 'start', {
      requestedProvider: configRef.current.provider,
      textLength: normalizedText.length,
    })
    let speakOneError: unknown = null
    let providerFallbackNotified = false

    const notifyProviderFallback = (provider: TtsProvider, error: unknown) => {
      if (providerFallbackNotified) return
      providerFallbackNotified = true
      callbacksRef.current.onProviderFallback?.({
        provider,
        fallbackProvider: 'native',
        reason: getPremiumFallbackReason(provider, error, t),
        transient: isTransientTtsFailure(error),
      })
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
      const { sessionEnded } = await speakChunk(
        resolvedProvider, normalizedText, 0, undefined,
        0, mySession, false, notifyProviderFallback,
      )
      if (sessionEnded) return
    } catch (error) {
      speakOneError = error
      playbackStopReasonRef.current = 'error'
      logPlaybackError(error, { phase: 'inline-playback' })
      logTtsPlaybackError(error)
    } finally {
      resolvePlaybackDone()
      await nativeHandle?.remove()
      if (playSessionRef.current === mySession) {
        const stopReason: TtsPlaybackStopReason = playbackStopReasonRef.current ??
          (speakOneError ? 'error' : shouldStopRef.current ? 'stopped' : 'finished')
        logPlaybackEvent('tts.playback.stop', activeProviderRef.current, 'success', {
          reason: stopReason,
        })
      }
      if (playSessionRef.current === mySession && !speakOneError) {
        callbacksRef.current.onStop()
      }
    }
  }

  function resetPosition() {
    lastChunkIdxRef.current = 0
  }

  // Foco de áudio nativo (TtsPlaybackService) só é acionável pro provider nativo:
  // o <audio> dos providers premium roda dentro do WebView, e o Chromium já
  // pausa/retoma esse elemento sozinho ao perder/reaver foco (confirmado em
  // device real — ligação de voz retomou e Spotify pausou corretamente mesmo
  // sem nenhuma ação nossa). Reagir aqui também pro caso premium só causa uma
  // pausa espúria logo no início de toda sessão (o Chromium sempre disputa e
  // vence o foco do TtsPlaybackService assim que o primeiro chunk toca — ver
  // R-003 em plan.md).
  function handleAudioFocusChange(type: TtsAudioFocusType) {
    if (activeProviderRef.current !== 'native') return
    switch (type) {
      case 'lossTransient':
        // Só marca como "pausado pelo foco" se realmente estava tocando —
        // senão uma pausa manual anterior (isPlaying já false) seria
        // promovida a pausa transitória e retomaria sozinha quando o foco
        // voltasse, contra a vontade do usuário (achado em code review).
        if (isPlaying) {
          pausedByTransientFocusLossRef.current = true
          void pause()
        }
        break
      case 'loss':
        pausedByTransientFocusLossRef.current = false
        void pause()
        break
      case 'gain':
        if (pausedByTransientFocusLossRef.current) {
          pausedByTransientFocusLossRef.current = false
          void resume()
        }
        break
    }
  }

  return { isPlaying, isPaused, play, pause, resume, stop, speakOne, lastChunkIdx: lastChunkIdxRef, resetPosition, handleAudioFocusChange }
}
