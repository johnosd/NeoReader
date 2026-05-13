import { useCallback, useMemo, useState } from 'react'
import {
  getTtsProviderLabel,
  isTtsProviderConfigured,
  listTtsProviderCompatibleVoices,
} from '../services/TtsProviderRegistry'
import type { AppSettings } from '../types/settings'
import type { TtsProvider, TtsVoiceOption } from '../types/tts'

const INITIAL_TTS_VOICE_COUNT = 12

interface UseBookDetailsTtsVoicesOptions {
  appSettings: AppSettings
  effectiveBookLanguage: string
}

export function useBookDetailsTtsVoices({
  appSettings,
  effectiveBookLanguage,
}: UseBookDetailsTtsVoicesOptions) {
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
        setError(`Configure a API key da ${getTtsProviderLabel(provider)} nas Configuracoes gerais.`)
        return
      }

      setOptions(await listTtsProviderCompatibleVoices(provider, effectiveBookLanguage, appSettings))
    } catch {
      setOptions([])
      setError('Nao foi possivel carregar as vozes compativeis.')
    } finally {
      setLoading(false)
    }
  }, [appSettings, effectiveBookLanguage])

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
