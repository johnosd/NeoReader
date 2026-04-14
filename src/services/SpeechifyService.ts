// Speechify TTS API — https://docs.sws.speechify.com/
// Requer VITE_SPEECHIFY_API_KEY no .env.
// Sem a variável, SpeechifyService.isConfigured() retorna false e o app
// usa o TTS nativo do dispositivo como fallback.

const API_URL = 'https://api.speechify.ai/v1/audio/speech'
const VOICE_ID = 'carly'   // voz neural feminina; seleção de voz fica para fase futura
const MAX_CHARS = 1900     // limite da API é 2000 chars; margem de segurança

export interface SpeechMark {
  start_time: number  // ms desde o início do áudio
  end_time: number
  start: number       // índice de char no texto de entrada
  end: number
  value: string       // palavra falada
}

export interface SpeechifyResult {
  audioBlob: Blob
  speechMarks: SpeechMark[]
}

export const SpeechifyService = {
  // true se a API key está presente no .env (VITE_SPEECHIFY_API_KEY)
  isConfigured(): boolean {
    return Boolean(import.meta.env.VITE_SPEECHIFY_API_KEY)
  },

  async synthesize(text: string): Promise<SpeechifyResult> {
    const apiKey = import.meta.env.VITE_SPEECHIFY_API_KEY as string

    const res = await fetch(API_URL, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        input: text.slice(0, MAX_CHARS),
        voice_id: VOICE_ID,
        audio_format: 'mp3',
        model: 'simba-english',
      }),
    })

    if (!res.ok) throw new Error(`Speechify error: ${res.status}`)

    const data = await res.json() as {
      audio_data: string        // áudio MP3 em base64
      speech_marks: SpeechMark[]
    }

    // Converte base64 → Uint8Array → Blob usando Web API padrão.
    // atob() é síncrono e disponível no WebView do Capacitor.
    const binary = atob(data.audio_data)
    const bytes = Uint8Array.from(binary, c => c.charCodeAt(0))

    return {
      audioBlob: new Blob([bytes], { type: 'audio/mpeg' }),
      // Array.isArray: defende contra a API retornar null, objeto ou campo ausente
      speechMarks: Array.isArray(data.speech_marks) ? data.speech_marks : [],
    }
  },
}
