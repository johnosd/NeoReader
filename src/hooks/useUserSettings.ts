import { useCallback, useEffect, useState } from 'react'
import { getSettings, updateAppSettings, updateReaderDefaults } from '../db/settings'
import type { AppSettings, ReaderDefaults, UserSettings } from '../types/settings'

// Wrapper fino sobre getSettings/updateAppSettings/updateReaderDefaults +
// estado de loading — extraído porque as 6 novas subtelas de Settings
// (feature 004-settings-categorias) precisam da mesma dança de carregar
// settings uma vez e persistir patches otimisticamente, e duplicar isso em
// 6+ arquivos seria repetição real, não hipotética.
export function useUserSettings() {
  const [settings, setSettings] = useState<UserSettings | null>(null)

  useEffect(() => {
    let cancelled = false

    void getSettings().then((value) => {
      if (!cancelled) setSettings(value)
    })

    return () => {
      cancelled = true
    }
  }, [])

  const saveAppSettings = useCallback(async (patch: Partial<AppSettings>) => {
    await updateAppSettings(patch)
    setSettings((previous) => previous ? {
      ...previous,
      appSettings: { ...previous.appSettings, ...patch },
    } : previous)
  }, [])

  const saveReaderDefaults = useCallback(async (patch: Partial<ReaderDefaults>) => {
    await updateReaderDefaults(patch)
    setSettings((previous) => previous ? {
      ...previous,
      readerDefaults: { ...previous.readerDefaults, ...patch },
    } : previous)
  }, [])

  return { settings, saveAppSettings, saveReaderDefaults }
}
