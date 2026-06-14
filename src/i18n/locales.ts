export const SUPPORTED_LOCALES = ['pt-BR', 'en', 'es'] as const
export type SupportedLocale = typeof SUPPORTED_LOCALES[number]

export const APP_LOCALE_PREFERENCES = ['auto', ...SUPPORTED_LOCALES] as const
export type AppLocalePreference = typeof APP_LOCALE_PREFERENCES[number]

export const DEFAULT_APP_LOCALE_PREFERENCE: AppLocalePreference = 'auto'
export const DEFAULT_APP_LOCALE: SupportedLocale = 'en'

export function isSupportedLocale(value: unknown): value is SupportedLocale {
  return typeof value === 'string' && SUPPORTED_LOCALES.includes(value as SupportedLocale)
}

export function isAppLocalePreference(value: unknown): value is AppLocalePreference {
  return value === 'auto' || isSupportedLocale(value)
}

export function normalizeAppLocalePreference(value: unknown): AppLocalePreference {
  return isAppLocalePreference(value) ? value : DEFAULT_APP_LOCALE_PREFERENCE
}

export function resolveAppLocale(
  preference: AppLocalePreference,
  deviceLanguage: string | readonly string[] | null | undefined = getDeviceLanguages(),
): SupportedLocale {
  if (isSupportedLocale(preference)) return preference

  const candidates = Array.isArray(deviceLanguage)
    ? deviceLanguage
    : [deviceLanguage].filter((value): value is string => Boolean(value))

  for (const candidate of candidates) {
    const matched = matchSupportedLocale(candidate)
    if (matched) return matched
  }

  return DEFAULT_APP_LOCALE
}

function getDeviceLanguages(): readonly string[] {
  if (typeof navigator === 'undefined') return []
  if (navigator.languages?.length) return navigator.languages
  return navigator.language ? [navigator.language] : []
}

function matchSupportedLocale(candidate: string | null | undefined): SupportedLocale | null {
  const normalized = candidate?.trim().replace('_', '-').toLowerCase()
  if (!normalized) return null

  if (normalized === 'pt' || normalized.startsWith('pt-')) return 'pt-BR'
  if (normalized === 'en' || normalized.startsWith('en-')) return 'en'
  if (normalized === 'es' || normalized.startsWith('es-')) return 'es'

  return null
}
