import { useCallback, useMemo, useState } from 'react'
import {
  getTtsProviderLabel,
  isTtsProviderConfigured,
  listTtsProviderCompatibleVoices,
} from '../services/TtsProviderRegistry'
import type { AppSettings } from '../types/settings'
import type { TtsProvider, TtsVoiceOption } from '../types/tts'
import { useI18n } from '../i18n'

const INITIAL_TTS_VOICE_COUNT = 12

interface UseBookDetailsTtsVoicesOptions {
  appSettings: AppSettings
  // Idioma usado pra filtrar/ranquear vozes compatíveis — não é sempre o
  // idioma do livro: com "ouvir traduzido" (feature 018) ativo, o chamador
  // passa o idioma-ALVO aqui, pra listar vozes que soem certo na leitura
  // traduzida em vez de vozes do idioma original.
  voiceLanguage: string
}

export function useBookDetailsTtsVoices({
  appSettings,
  voiceLanguage,
}: UseBookDetailsTtsVoicesOptions) {
  const { t } = useI18n()
  const [options, setOptions] = useState<TtsVoiceOption[]>([])
  const [showAll, setShowAll] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [search, setSearch] = useState('')

  const loadOptions = useCallback(async (provider: TtsProvider) => {
    setLoading(true)
    setError(null)
    try {
      if (!isTtsProviderConfigured(provider, appSettings)) {
        setOptions([])
        setError(t('bookDetails.tts.configureProviderKey', { provider: getTtsProviderLabel(provider) }))
        return
      }

      setOptions(await listTtsProviderCompatibleVoices(provider, voiceLanguage, appSettings))
    } catch {
      setOptions([])
      setError(t('bookDetails.tts.compatibleVoicesError'))
    } finally {
      setLoading(false)
    }
  }, [appSettings, voiceLanguage, t])

  const filteredOptions = useMemo(() => {
    const normalizedSearch = search.trim().toLocaleLowerCase()
    if (!normalizedSearch) return options

    return options.filter((voice) =>
      [voice.label, voice.locale, voice.meta]
        .filter(Boolean)
        .some((value) => value!.toLocaleLowerCase().includes(normalizedSearch)),
    )
  }, [options, search])

  const visibleOptions = useMemo(() => {
    if (showAll || search.trim()) return filteredOptions
    return filteredOptions.slice(0, INITIAL_TTS_VOICE_COUNT)
  }, [filteredOptions, search, showAll])

  return {
    options,
    visibleOptions,
    hiddenCount: Math.max(0, filteredOptions.length - visibleOptions.length),
    loading,
    error,
    search,
    setSearch,
    showAll,
    setShowAll,
    loadOptions,
  }
}
