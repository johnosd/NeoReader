import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { SettingsIntegrationsScreen } from '@/screens/SettingsIntegrationsScreen'

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

describe('SettingsIntegrationsScreen', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.getSettings.mockResolvedValue(settingsFixture())
    mocks.updateAppSettings.mockResolvedValue(undefined)
    mocks.updateReaderDefaults.mockResolvedValue(undefined)
  })

  it('mantem o campo do YouTube compacto ate o usuario expandir', async () => {
    render(<SettingsIntegrationsScreen onBack={vi.fn()} />)

    await screen.findByText('Integracoes')
    expect(screen.queryByPlaceholderText('AIza...')).toBeNull()

    fireEvent.click(screen.getByRole('button', { name: /YouTube Data API/ }))

    expect(await screen.findByPlaceholderText('AIza...')).not.toBeNull()
  })

  it('explica o que a chave do YouTube habilita', async () => {
    render(<SettingsIntegrationsScreen onBack={vi.fn()} />)

    await screen.findByText('Integracoes')
    fireEvent.click(screen.getByRole('button', { name: /YouTube Data API/ }))

    expect(await screen.findByText(/Reviews em video/)).toBeTruthy()
    expect(screen.getByText(/entrevistas e palestras/)).toBeTruthy()
  })

  it('salva a key do YouTube no blur', async () => {
    render(<SettingsIntegrationsScreen onBack={vi.fn()} />)

    await screen.findByText('Integracoes')
    fireEvent.click(screen.getByRole('button', { name: /YouTube Data API/ }))

    const input = await screen.findByPlaceholderText('AIza...')
    fireEvent.change(input, { target: { value: 'youtube-key-123' } })
    fireEvent.blur(input)

    expect(mocks.updateAppSettings).toHaveBeenCalledWith({ youtubeApiKey: 'youtube-key-123' })
  })
})
