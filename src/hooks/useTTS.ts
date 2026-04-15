import { useEffect, useRef, useState } from 'react'
import { TextToSpeech } from '@capacitor-community/text-to-speech'
import { SpeechifyService } from '../services/SpeechifyService'

interface TTSCallbacks {
  onWordHighlight: (paraIdx: number, start: number, end: number) => void
  onParagraphChange: (paraIdx: number) => void
  onStop: () => void
}

export function useTTS(callbacks: TTSCallbacks) {
  const [isPlaying, setIsPlaying] = useState(false)

  // shouldStopRef: sinaliza parada imediata ao loop async sem esperar re-render
  const shouldStopRef = useRef(false)

  // callbacksRef: mantém referência aos callbacks mais recentes sem recriar funções
  const callbacksRef = useRef(callbacks)
  useEffect(() => { callbacksRef.current = callbacks }, [callbacks])

  // audioRef: rastreia o elemento <Audio> Speechify atual para que stop() possa pausá-lo
  const audioRef = useRef<HTMLAudioElement | null>(null)
  // usingSpeechifyRef: indica se a sessão atual de TTS usa Speechify (vs nativo)
  // — necessário porque isConfigured() virou async e stop() é síncrono
  const usingSpeechifyRef = useRef(false)

  // Toca um parágrafo via Speechify e agenda karaokê pelos speech_marks.
  // new Audio(blobUrl): elemento de áudio HTML5 — funciona no WebView do Capacitor
  // sem precisar de plugin nativo extra.
  async function speakWithSpeechify(text: string, paraIdx: number, apiKey: string): Promise<void> {
    const { audioBlob, speechMarks } = await SpeechifyService.synthesize(text, apiKey)
    const url = URL.createObjectURL(audioBlob)
    const audio = new Audio(url)
    audioRef.current = audio

    // Agenda cada palavra: speech_mark.start_time indica em qual ms ela começa.
    // setTimeout com start_time ms de delay a partir do play() ≈ sincronizado com o áudio.
    const timers = speechMarks.map(mark =>
      setTimeout(() => {
        if (!shouldStopRef.current) {
          callbacksRef.current.onWordHighlight(paraIdx, mark.start, mark.end)
        }
      }, mark.start_time),
    )

    return new Promise<void>((resolve) => {
      const cleanup = () => {
        timers.forEach(clearTimeout)
        URL.revokeObjectURL(url)
        audioRef.current = null
        resolve()
      }
      // 'ended': parágrafo terminou naturalmente → avança para o próximo
      // 'pause': stop() chamou audio.pause() → resolve para o loop checar shouldStopRef
      // 'error': falha no playback → não trava o audiobook
      audio.addEventListener('ended', cleanup, { once: true })
      audio.addEventListener('pause', cleanup, { once: true })
      audio.addEventListener('error', cleanup, { once: true })
      void audio.play()
    })
  }

  // Inicia audiobook contínuo a partir de startIdx.
  // Modo Speechify: speakWithSpeechify por parágrafo (voz neural + karaokê por timers)
  // Modo fallback: TextToSpeech.speak() + onRangeStart nativo
  async function play(paragraphs: string[], startIdx = 0) {
    shouldStopRef.current = false
    setIsPlaying(true)
    const currentIdxRef = { current: startIdx }

    // Resolve a key uma vez para toda a sessão — evita N chamadas ao IndexedDB
    const apiKey = await SpeechifyService.getApiKey()
    usingSpeechifyRef.current = Boolean(apiKey)

    // Listener onRangeStart só é registrado no fallback nativo
    let nativeHandle: Awaited<ReturnType<typeof TextToSpeech.addListener>> | null = null
    if (!apiKey) {
      nativeHandle = await TextToSpeech.addListener('onRangeStart', ({ start, end }) => {
        callbacksRef.current.onWordHighlight(currentIdxRef.current, start, end)
      })
    }

    try {
      for (let i = startIdx; i < paragraphs.length; i++) {
        if (shouldStopRef.current) break
        currentIdxRef.current = i
        callbacksRef.current.onParagraphChange(i)

        if (apiKey) {
          await speakWithSpeechify(paragraphs[i], i, apiKey)
        } else {
          await TextToSpeech.speak({ text: paragraphs[i], lang: 'en-US', rate: 1.0 })
        }
      }
    } finally {
      await nativeHandle?.remove()
      setIsPlaying(false)
      callbacksRef.current.onStop()
    }
  }

  async function stop() {
    shouldStopRef.current = true
    if (usingSpeechifyRef.current) {
      // pause() dispara o evento 'pause' → resolve a Promise em speakWithSpeechify
      // → o loop em play() verifica shouldStopRef e encerra
      audioRef.current?.pause()
    } else {
      await TextToSpeech.stop()
    }
  }

  // Lê um único parágrafo (botão 🔊 no bloco de tradução injetado)
  async function speakOne(text: string) {
    const apiKey = await SpeechifyService.getApiKey()
    if (apiKey) {
      await speakWithSpeechify(text, 0, apiKey)
    } else {
      const handle = await TextToSpeech.addListener('onRangeStart', ({ start, end }) => {
        callbacksRef.current.onWordHighlight(0, start, end)
      })
      try {
        await TextToSpeech.speak({ text, lang: 'en-US', rate: 1.0 })
      } finally {
        await handle.remove()
      }
    }
    callbacksRef.current.onStop()
  }

  return { isPlaying, play, stop, speakOne }
}
