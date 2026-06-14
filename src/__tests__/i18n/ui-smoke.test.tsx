import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { WelcomeScreen } from '@/screens/WelcomeScreen'
import { I18nContext, type I18nContextValue } from '@/i18n/I18nContext'
import { translateMessage } from '@/i18n'
import type { SupportedLocale } from '@/i18n'

function renderWithLocale(locale: SupportedLocale) {
  const value: I18nContextValue = {
    locale,
    localePreference: locale,
    setLocalePreference: vi.fn(),
    t: (key, params) => translateMessage(locale, key, params),
  }

  render(
    <I18nContext.Provider value={value}>
      <WelcomeScreen onComplete={vi.fn()} />
    </I18nContext.Provider>,
  )
}

describe('i18n UI smoke', () => {
  it.each([
    ['pt-BR', '50.000 livros'],
    ['en', '50,000 books'],
    ['es', '50.000 libros'],
  ] satisfies Array<[SupportedLocale, string]>)('renderiza onboarding em %s', (locale, title) => {
    renderWithLocale(locale)

    expect(screen.getByRole('heading', { name: title })).toBeTruthy()
  })
})
