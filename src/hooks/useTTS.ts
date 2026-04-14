import { useEffect, useRef, useState } from 'react'
import { TextToSpeech } from '@capacitor-community/text-to-speech'

interface TTSCallbacks {
  onWordHighlight: (paraIdx: number, start: number, end: number) => void
  onParagraphChange: (paraIdx: number) => void
  onStop: () => void
}

export function useTTS(callbacks: TTSCallbacks) {
  const [isPlaying, setIsPlaying] = useState(false)

  // shouldStopRef: flag para o loop de audiobook saber que deve parar.
  // Usamos ref (não state) para que a mudança seja visível imediatamente
  // dentro do loop async, sem esperar um re-render.
  const shouldStopRef = useRef(false)

  // callbacksRef: mantém sempre os callbacks mais recentes sem recriar funções.
  // Padrão comum em hooks com loops async — equivale a "stable callback" do Python.
  const callbacksRef = useRef(callbacks)
  useEffect(() => { callbacksRef.current = callbacks }, [callbacks])

  // Inicia audiobook contínuo a partir de startIdx.
  // speak() é uma Promise que resolve quando o utterance termina — então
  // o loop avança naturalmente de parágrafo em parágrafo.
  async function play(paragraphs: string[], startIdx = 0) {
    shouldStopRef.current = false
    setIsPlaying(true)

    // currentIdxRef precisa ser declarado ANTES de addListener
    // para que o callback do onRangeStart acesse o valor correto
    const currentIdxRef = { current: startIdx }

    const handle = await TextToSpeech.addListener('onRangeStart', ({ start, end }) => {
      callbacksRef.current.onWordHighlight(currentIdxRef.current, start, end)
    })

    try {
      for (let i = startIdx; i < paragraphs.length; i++) {
        if (shouldStopRef.current) break
        currentIdxRef.current = i
        callbacksRef.current.onParagraphChange(i)
        await TextToSpeech.speak({ text: paragraphs[i], lang: 'en-US', rate: 1.0 })
      }
    } finally {
      await handle.remove()
      setIsPlaying(false)
      callbacksRef.current.onStop()
    }
  }

  async function stop() {
    shouldStopRef.current = true
    await TextToSpeech.stop()
  }

  // Lê um único parágrafo (acionado pelo botão 🔊 no bloco de tradução)
  async function speakOne(text: string) {
    const handle = await TextToSpeech.addListener('onRangeStart', ({ start, end }) => {
      // paraIdx 0: speakOne sempre se refere ao parágrafo tocado, sem loop
      callbacksRef.current.onWordHighlight(0, start, end)
    })
    try {
      await TextToSpeech.speak({ text, lang: 'en-US', rate: 1.0 })
    } finally {
      await handle.remove()
      callbacksRef.current.onStop()
    }
  }

  return { isPlaying, play, stop, speakOne }
}
