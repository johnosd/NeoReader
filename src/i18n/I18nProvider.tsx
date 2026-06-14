import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import { getSettings } from '../db/settings'
import {
  DEFAULT_APP_LOCALE_PREFERENCE,
  normalizeAppLocalePreference,
  resolveAppLocale,
  type AppLocalePreference,
} from './locales'
import { translateMessage } from './messages'
import { I18nContext, type I18nContextValue, type TranslateFn } from './I18nContext'

export function I18nProvider({ children }: { children: ReactNode }) {
  const [localePreference, setLocalePreferenceState] = useState<AppLocalePreference>(DEFAULT_APP_LOCALE_PREFERENCE)

  useEffect(() => {
    let cancelled = false

    void getSettings()
      .then((settings) => {
        if (!cancelled) setLocalePreferenceState(settings.appSettings.appLocale)
      })
      .catch(() => undefined)

    return () => {
      cancelled = true
    }
  }, [])

  const locale = useMemo(() => resolveAppLocale(localePreference), [localePreference])

  const setLocalePreference = useCallback((preference: AppLocalePreference) => {
    setLocalePreferenceState(normalizeAppLocalePreference(preference))
  }, [])

  const t = useCallback<TranslateFn>(
    (key, params) => translateMessage(locale, key, params),
    [locale],
  )

  const value = useMemo<I18nContextValue>(() => ({
    locale,
    localePreference,
    setLocalePreference,
    t,
  }), [locale, localePreference, setLocalePreference, t])

  return (
    <I18nContext.Provider value={value}>
      {children}
    </I18nContext.Provider>
  )
}
