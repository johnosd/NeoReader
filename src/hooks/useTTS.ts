import { useEffect, useRef, useState } from 'react'
import { TextToSpeech } from '@capacitor-community/text-to-speech'
import { SpeechifyService } from '../services/SpeechifyService'
import type { TtsChunk } from '../components/reader/EpubViewer'

interface TTSCallbacks {
  onWordHighlight: (paraIdx: number, start: number, end: number) => void
  onParagraphChange: (paraIdx: number) => void
  onStop: () => void
  // Chamado somente quando o TTS termina naturalmente (não quando o usuário para)
  onFinished?: () => void
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

  // Último chunk tocado — permite retomar de onde parou ao reiniciar
  const lastChunkIdxRef = useRef(0)

  // Contador de sessão: incrementado a cada play(). O loop verifica se ainda é a sessão
  // ativa antes de continuar — impede que um loop antigo (supersedido) rode em paralelo
  // quando stop() + play() são chamados em rápida sucessão.
  const playSessionRef = useRef(0)

  // Toca um chunk de frase via Speechify e agenda karaokê pelos speech_marks.
  // offsetInPara: offset de char da frase dentro do parágrafo completo —
  // necessário para que o karaokê aponte para a posição correta no innerHTML do parágrafo.
  // session: ID da sessão de play() que chamou esta função.
  // Após o await de rede, verifica se a sessão ainda é ativa antes de tocar o áudio —
  // evita que uma resposta de API "atrasada" inicie um áudio depois de stop() ser chamado.
  async function speakWithSpeechify(text: string, paraIdx: number, offsetInPara: number, apiKey: string, session: number): Promise<void> {
    const { audioBlob, speechMarks } = await SpeechifyService.synthesize(text, apiKey)

    // Verifica logo após o await: stop() pode ter sido chamado enquanto a rede respondia.
    // audioRef.current é null durante fetch, então stop() não conseguiu pausar nada.
    if (shouldStopRef.current || playSessionRef.current !== session) return

    const url = URL.createObjectURL(audioBlob)
    const audio = new Audio(url)
    audioRef.current = audio

    // Agenda cada palavra: speech_mark.start_time indica em qual ms ela começa.
    // Os offsets do Speechify são relativos ao chunk (frase), não ao parágrafo inteiro.
    // Somamos offsetInPara para obter a posição correta no innerHTML do parágrafo.
    const timers = speechMarks.map(mark =>
      setTimeout(() => {
        if (!shouldStopRef.current) {
          callbacksRef.current.onWordHighlight(paraIdx, offsetInPara + mark.start, offsetInPara + mark.end)
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

  // Inicia audiobook contínuo a partir de startIdx (índice de chunk, não de parágrafo).
  // Cada chunk é uma frase ou grupo de frases curtas — menor latência vs parágrafo inteiro.
  // Modo Speechify: speakWithSpeechify por chunk (voz neural + karaokê por timers)
  // Modo fallback: TextToSpeech.speak() + onRangeStart nativo
  async function play(chunks: TtsChunk[], startIdx = 0) {
    // Gera ID único para esta invocação. Loops anteriores que ainda estejam
    // aguardando uma Promise async vão perceber que não são mais a sessão ativa.
    const mySession = ++playSessionRef.current

    shouldStopRef.current = false
    setIsPlaying(true)

    // currentChunkRef: chunk sendo tocado agora — lido pelo listener nativo de onRangeStart
    const currentChunkRef = { current: chunks[startIdx] ?? chunks[0] }

    // Resolve a key uma vez para toda a sessão — evita N chamadas ao IndexedDB
    const apiKey = await SpeechifyService.getApiKey()
    usingSpeechifyRef.current = Boolean(apiKey)

    // Listener onRangeStart só é registrado no fallback nativo.
    // Soma offsetInPara para que o karaokê aponte para a posição correta no parágrafo.
    let nativeHandle: Awaited<ReturnType<typeof TextToSpeech.addListener>> | null = null
    if (!apiKey) {
      nativeHandle = await TextToSpeech.addListener('onRangeStart', ({ start, end }) => {
        const c = currentChunkRef.current
        callbacksRef.current.onWordHighlight(c.paraIdx, c.offsetInPara + start, c.offsetInPara + end)
      })
    }

    try {
      for (let i = startIdx; i < chunks.length; i++) {
        // Para se o usuário pediu stop OU se uma nova sessão de play() foi iniciada
        if (shouldStopRef.current || playSessionRef.current !== mySession) break
        const chunk = chunks[i]
        currentChunkRef.current = chunk
        lastChunkIdxRef.current = i

        // onParagraphChange só dispara quando troca de parágrafo (não a cada frase)
        if (i === startIdx || chunks[i - 1].paraIdx !== chunk.paraIdx) {
          callbacksRef.current.onParagraphChange(chunk.paraIdx)
        }

        if (apiKey) {
          await speakWithSpeechify(chunk.text, chunk.paraIdx, chunk.offsetInPara, apiKey, mySession)
        } else {
          await TextToSpeech.speak({ text: chunk.text, lang: 'en-US', rate: 1.0 })
        }
      }
    } finally {
      await nativeHandle?.remove()
      // Só atualiza estado da UI se esta sessão ainda for a ativa.
      // Se uma nova sessão já começou, deixa ela gerenciar isPlaying e os callbacks —
      // chamar onStop() aqui removeria os highlights da nova sessão.
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
  async function speakOne(text: string, paraIdx: number) {
    // Reseta flag de stop — sem isso, se o audiobook foi parado antes, speakWithSpeechify
    // retornaria imediatamente após o fetch sem tocar o áudio
    shouldStopRef.current = false
    const apiKey = await SpeechifyService.getApiKey()
    if (apiKey) {
      // speakOne usa a sessão atual — não conflita com o loop do audiobook
      await speakWithSpeechify(text, paraIdx, 0, apiKey, playSessionRef.current)
    } else {
      const handle = await TextToSpeech.addListener('onRangeStart', ({ start, end }) => {
        callbacksRef.current.onWordHighlight(paraIdx, start, end)
      })
      try {
        await TextToSpeech.speak({ text, lang: 'en-US', rate: 1.0 })
      } finally {
        await handle.remove()
      }
    }
    callbacksRef.current.onStop()
  }

  // Reseta a posição para início — usado pelo botão ⏹ Stop do mini player
  function resetPosition() {
    lastChunkIdxRef.current = 0
  }

  return { isPlaying, play, stop, speakOne, lastChunkIdx: lastChunkIdxRef, resetPosition }
}
