// Speechify TTS API — https://docs.sws.speechify.com/
// A API key pode vir de duas fontes (prioridade: DB > .env):
//   1. Configurações do usuário no IndexedDB (via SettingsScreen)
//   2. VITE_SPEECHIFY_API_KEY no .env (conveniência para dev local)

import { getSettings } from '../db/settings'

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
  // Resolve a API key: DB primeiro, .env como fallback para dev local.
  // Retorna '' se nenhuma fonte tiver a key.
  async getApiKey(): Promise<string> {
    const settings = await getSettings()
    if (settings.speechifyApiKey) return settings.speechifyApiKey
    return (import.meta.env.VITE_SPEECHIFY_API_KEY as string) ?? ''
  },

  // Versão síncrona — checa apenas o .env (usada para badge de engine no chrome).
  // Use getApiKey() quando precisar da key real para uma chamada.
  isConfiguredSync(): boolean {
    return Boolean(import.meta.env.VITE_SPEECHIFY_API_KEY)
  },

  // Verifica se há key disponível (DB ou .env) — async.
  async isConfigured(): Promise<boolean> {
    return Boolean(await this.getApiKey())
  },

  async synthesize(text: string, apiKey: string): Promise<SpeechifyResult> {

    const res = await fetch(API_URL, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,  // key resolvida pelo chamador
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
