import { createContext, useContext } from 'react'
import {
  DEFAULT_APP_LOCALE_PREFERENCE,
  type AppLocalePreference,
  type SupportedLocale,
} from './locales'
import { translateMessage, type MessageKey, type MessageParams } from './messages'

export type TranslateFn = (key: MessageKey, params?: MessageParams) => string

export interface I18nContextValue {
  locale: SupportedLocale
  localePreference: AppLocalePreference
  setLocalePreference: (preference: AppLocalePreference) => void
  t: TranslateFn
}

const defaultLocalePreference = DEFAULT_APP_LOCALE_PREFERENCE
const defaultLocale: SupportedLocale = 'pt-BR'

export const I18nContext = createContext<I18nContextValue>({
  locale: defaultLocale,
  localePreference: defaultLocalePreference,
  setLocalePreference: () => undefined,
  t: (key, params) => translateMessage(defaultLocale, key, params),
})

export function useI18n(): I18nContextValue {
  return useContext(I18nContext)
}
