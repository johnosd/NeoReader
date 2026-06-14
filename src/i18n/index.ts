export {
  APP_LOCALE_PREFERENCES,
  DEFAULT_APP_LOCALE,
  DEFAULT_APP_LOCALE_PREFERENCE,
  SUPPORTED_LOCALES,
  isAppLocalePreference,
  isSupportedLocale,
  normalizeAppLocalePreference,
  resolveAppLocale,
  type AppLocalePreference,
  type SupportedLocale,
} from './locales'
export {
  messages,
  ptBRMessages,
  translateMessage,
  type MessageKey,
  type MessageParams,
} from './messages'
export { useI18n, type I18nContextValue, type TranslateFn } from './I18nContext'
export { I18nProvider } from './I18nProvider'
