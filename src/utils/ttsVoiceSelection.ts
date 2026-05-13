import type { BookSettings } from '../types/book'
import type { TtsPlaybackConfig, TtsProvider, TtsVoiceOption, TtsVoiceSelection, TtsVoiceSelections } from '../types/tts'

function normalizeSelection(selection?: TtsVoiceSelection | null): TtsVoiceSelection | null {
  if (!selection) return null
  if (!selection.id && !selection.label && !selection.avatarUrl && !selection.modelId) return null
  return selection
}

export function getBookTtsVoiceSelection(
  settings: BookSettings | null | undefined,
  provider: TtsProvider,
): TtsVoiceSelection | null {
  const genericSelection = normalizeSelection(settings?.ttsVoiceSelections?.[provider])
  if (genericSelection) return genericSelection

  if (provider === 'speechify') {
    return normalizeSelection({
      id: settings?.ttsSpeechifyVoiceId,
      label: settings?.ttsSpeechifyVoiceLabel,
      avatarUrl: settings?.ttsSpeechifyVoiceAvatarUrl,
    })
  }

  if (provider === 'elevenlabs') {
    return normalizeSelection({
      id: settings?.ttsElevenLabsVoiceId,
      label: settings?.ttsElevenLabsVoiceLabel,
    })
  }

  if (provider === 'native') {
    return normalizeSelection({
      id: settings?.ttsNativeVoiceKey,
      label: settings?.ttsNativeVoiceLabel,
    })
  }

  return null
}

export function getBookTtsVoiceSelections(settings: BookSettings | null | undefined): TtsVoiceSelections {
  return {
    ...settings?.ttsVoiceSelections,
    speechify: getBookTtsVoiceSelection(settings, 'speechify') ?? undefined,
    elevenlabs: getBookTtsVoiceSelection(settings, 'elevenlabs') ?? undefined,
    native: getBookTtsVoiceSelection(settings, 'native') ?? undefined,
    fishaudio: getBookTtsVoiceSelection(settings, 'fishaudio') ?? undefined,
  }
}

export function getPlaybackTtsVoiceId(config: TtsPlaybackConfig, provider: TtsProvider): string | null | undefined {
  const genericVoiceId = config.voiceSelections?.[provider]?.id
  if (genericVoiceId) return genericVoiceId

  if (provider === 'speechify') return config.speechifyVoiceId
  if (provider === 'elevenlabs') return config.elevenLabsVoiceId
  if (provider === 'native') return config.nativeVoiceKey
  return null
}

export function buildTtsVoiceSelection(option: TtsVoiceOption | null): TtsVoiceSelection {
  return {
    id: option?.id ?? null,
    label: option?.label ?? null,
    avatarUrl: option?.avatarUrl ?? null,
    modelId: option?.modelId ?? null,
  }
}

export function buildBookTtsVoiceSelectionPatch(
  settings: BookSettings | null | undefined,
  provider: TtsProvider,
  option: TtsVoiceOption | null,
): Partial<Omit<BookSettings, 'id' | 'bookId'>> {
  const selection = buildTtsVoiceSelection(option)
  const patch: Partial<Omit<BookSettings, 'id' | 'bookId'>> = {
    ttsVoiceSelections: {
      ...settings?.ttsVoiceSelections,
      [provider]: selection,
    },
  }

  if (provider === 'speechify') {
    return {
      ...patch,
      ttsSpeechifyVoiceId: option?.id ?? null,
      ttsSpeechifyVoiceLabel: option?.label ?? null,
      ttsSpeechifyVoiceAvatarUrl: option?.avatarUrl ?? null,
    }
  }

  if (provider === 'elevenlabs') {
    return {
      ...patch,
      ttsElevenLabsVoiceId: option?.id ?? null,
      ttsElevenLabsVoiceLabel: option?.label ?? null,
    }
  }

  if (provider === 'native') {
    return {
      ...patch,
      ttsNativeVoiceKey: option?.id ?? null,
      ttsNativeVoiceLabel: option?.label ?? null,
    }
  }

  return patch
}
