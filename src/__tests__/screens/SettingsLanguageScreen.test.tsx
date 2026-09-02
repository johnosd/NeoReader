import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { SettingsLanguageScreen } from '@/screens/SettingsLanguageScreen'

const mocks = vi.hoisted(() => ({
  getSettings: vi.fn(),
  updateAppSettings: vi.fn(),
  updateReaderDefaults: vi.fn(),
}))

vi.mock('@capacitor/app', () => ({
  App: {
    addListener: vi.fn(async () => ({ remove: vi.fn() })),
  },
}))

vi.mock('@/db/settings', () => ({
  getSettings: mocks.getSettings,
  updateAppSettings: mocks.updateAppSettings,
  updateReaderDefaults: mocks.updateReaderDefaults,
}))

function settingsFixture() {
  return {
    appSettings: {
      appLocale: 'auto',
      speechifyApiKey: '',
      elevenLabsApiKey: '',
      fishAudioApiKey: '',
      translationTargetLang: 'pt-BR',
      youtubeApiKey: '',
    },
    readerDefaults: {
      defaultFontSize: 'md',
      lineHeight: 'comfortable',
      readerTheme: 'dark',
      fontFamily: 'classic',
      overrideBookFont: true,
      overrideBookColors: true,
      wordLensEnabled: true,
      wordLensLevel: 'B1',
    },
    updatedAt: new Date(),
  }
}

describe('SettingsLanguageScreen', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.getSettings.mockResolvedValue(settingsFixture())
    mocks.updateAppSettings.mockResolvedValue(undefined)
    mocks.updateReaderDefaults.mockResolvedValue(undefined)
  })

  it('mostra os dois controles de idioma juntos na mesma tela, sem navegar entre categorias', async () => {
    render(<SettingsLanguageScreen onBack={vi.fn()} />)

    // "Idioma do app" também é o título do bottom sheet (mesmo texto),
    // por isso findAllByText — o que importa é que a linha do menu exista.
    const appLanguageMatches = await screen.findAllByText('Idioma do app')
    const translationMatches = await screen.findAllByText('Idioma padrao das traducoes')

    expect(appLanguageMatches.length).toBeGreaterThan(0)
    expect(translationMatches.length).toBeGreaterThan(0)
  })

  it('salva idioma padrao pelo bottom sheet', async () => {
    render(<SettingsLanguageScreen onBack={vi.fn()} />)

    const languageRows = await screen.findAllByText('Idioma padrao das traducoes')
    fireEvent.click(languageRows[0])
    const spanishOptions = screen.getAllByText('Espanhol')
    fireEvent.click(spanishOptions[spanishOptions.length - 1])

    expect(mocks.updateAppSettings).toHaveBeenCalledWith({ translationTargetLang: 'es' })
  })

  it('salva idioma do app pelo bottom sheet', async () => {
    render(<SettingsLanguageScreen onBack={vi.fn()} />)

    const appLanguageLabels = await screen.findAllByText('Idioma do app')
    const appLanguageRow = appLanguageLabels[0].closest('[role="button"]')
    expect(appLanguageRow).not.toBeNull()
    fireEvent.click(appLanguageRow!)
    const englishOptions = screen.getAllByText('Inglês')
    fireEvent.click(englishOptions[0])

    expect(mocks.updateAppSettings).toHaveBeenCalledWith({ appLocale: 'en' })
  })
})
