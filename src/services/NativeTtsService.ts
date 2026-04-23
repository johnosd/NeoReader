import { TextToSpeech } from '@capacitor-community/text-to-speech'
import type { TtsVoiceOption } from '../types/tts'
import { isLanguageCompatible, normalizeLanguageTag } from '../utils/language'

function buildNativeVoiceKey(voice: SpeechSynthesisVoice) {
  return `${voice.voiceURI}::${voice.lang}`
}

function toVoiceOption(voice: SpeechSynthesisVoice): TtsVoiceOption {
  return {
    id: buildNativeVoiceKey(voice),
    label: voice.name,
    locale: voice.lang,
    provider: 'native',
    meta: voice.localService ? 'Local' : 'Sistema',
  }
}

let voicesPromise: Promise<SpeechSynthesisVoice[]> | null = null

async function getVoices() {
  voicesPromise ??= TextToSpeech.getSupportedVoices().then((result) => result.voices)
  return voicesPromise
}

export const NativeTtsService = {
  buildVoiceKey: buildNativeVoiceKey,

  async listCompatibleVoices(language: string): Promise<TtsVoiceOption[]> {
    const normalizedLanguage = normalizeLanguageTag(language)
    const voices = await getVoices()

    return voices
      .filter((voice) => isLanguageCompatible(voice.lang, normalizedLanguage))
      .map(toVoiceOption)
      .sort((left, right) => left.label.localeCompare(right.label))
  },

  async resolveVoiceIndex(voiceKey?: string | null, language?: string | null): Promise<number | undefined> {
    if (!voiceKey) return undefined
    const normalizedLanguage = language ? normalizeLanguageTag(language) : null
    const voices = await getVoices()
    const index = voices.findIndex((voice) => {
      if (buildNativeVoiceKey(voice) !== voiceKey) return false
      return normalizedLanguage ? isLanguageCompatible(voice.lang, normalizedLanguage) : true
    })

    return index >= 0 ? index : undefined
  },
}
