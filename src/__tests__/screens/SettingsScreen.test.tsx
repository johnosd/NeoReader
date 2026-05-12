import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { SettingsScreen } from '@/screens/SettingsScreen'

const mocks = vi.hoisted(() => ({
  getSettings: vi.fn(),
  updateAppSettings: vi.fn(),
  updateReaderDefaults: vi.fn(),
  validateSpeechifyKey: vi.fn(),
  validateElevenLabsKey: vi.fn(),
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

vi.mock('@/services/SpeechifyService', () => ({
  SpeechifyService: {
    validateApiKey: mocks.validateSpeechifyKey,
  },
}))

vi.mock('@/services/ElevenLabsService', () => ({
  ElevenLabsService: {
    validateApiKey: mocks.validateElevenLabsKey,
  },
}))

function settingsFixture() {
  return {
    appSettings: {
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
    },
    updatedAt: new Date(),
  }
}

describe('SettingsScreen', () => {
  beforeEach(() => {
    mocks.getSettings.mockResolvedValue(settingsFixture())
    mocks.updateAppSettings.mockResolvedValue(undefined)
    mocks.updateReaderDefaults.mockResolvedValue(undefined)
    mocks.validateSpeechifyKey.mockResolvedValue({ isValid: true, message: 'ok' })
    mocks.validateElevenLabsKey.mockResolvedValue({ isValid: true, message: 'ok' })
    vi.clearAllMocks()
  })

  it('organiza configuracoes por secoes de leitor e integracoes', async () => {
    render(<SettingsScreen onBack={vi.fn()} />)

    await screen.findByText('Leitor')

    expect(screen.getByText('Aparencia')).not.toBeNull()
    expect(screen.getByText('Traducao')).not.toBeNull()
    expect(screen.getByText('Narracao')).not.toBeNull()
    expect(screen.getByText('Integracoes')).not.toBeNull()
    expect(screen.getByText('Build')).not.toBeNull()
  })

  it('mantem campos de integracao compactos ate o usuario expandir', async () => {
    render(<SettingsScreen onBack={vi.fn()} />)

    await screen.findByText('Integracoes')

    expect(screen.queryByPlaceholderText('sk-...')).toBeNull()

    fireEvent.click(screen.getByRole('button', { name: /Speechify/ }))

    expect(await screen.findByPlaceholderText('sk-...')).not.toBeNull()
  })

  it('salva defaults do leitor ao alterar tamanho de fonte', async () => {
    render(<SettingsScreen onBack={vi.fn()} />)

    await screen.findByText('Aparencia')
    fireEvent.click(screen.getByRole('button', { name: 'Fonte Grande' }))

    expect(mocks.updateReaderDefaults).toHaveBeenCalledWith({ defaultFontSize: 'lg' })
  })

  it('modo original respeita fonte e cores do EPUB nos defaults globais', async () => {
    render(<SettingsScreen onBack={vi.fn()} />)

    await screen.findByText('Modo de leitura')
    fireEvent.click(screen.getByText('Original'))

    expect(mocks.updateReaderDefaults).toHaveBeenCalledWith({
      fontFamily: 'publisher',
      overrideBookFont: false,
      overrideBookColors: false,
    })
  })

  it('modo confortavel reativa fonte e cores do NeoReader nos defaults globais', async () => {
    mocks.getSettings.mockResolvedValue({
      ...settingsFixture(),
      readerDefaults: {
        ...settingsFixture().readerDefaults,
        fontFamily: 'publisher',
        overrideBookFont: false,
        overrideBookColors: false,
      },
    })

    render(<SettingsScreen onBack={vi.fn()} />)

    await screen.findByText('Modo de leitura')
    fireEvent.click(screen.getByText('Confortavel'))

    expect(mocks.updateReaderDefaults).toHaveBeenCalledWith({
      fontFamily: 'classic',
      overrideBookFont: true,
      overrideBookColors: true,
    })
  })

  it('salva idioma padrao pelo bottom sheet', async () => {
    render(<SettingsScreen onBack={vi.fn()} />)

    const languageRows = await screen.findAllByText('Idioma padrao das traducoes')
    fireEvent.click(languageRows[0])
    fireEvent.click(screen.getByText('Espanhol'))

    expect(mocks.updateAppSettings).toHaveBeenCalledWith({ translationTargetLang: 'es' })
  })

  it('valida e salva key da Speechify no blur', async () => {
    render(<SettingsScreen onBack={vi.fn()} />)

    await screen.findByText('Integracoes')
    fireEvent.click(screen.getByRole('button', { name: /Speechify/ }))

    const input = await screen.findByPlaceholderText('sk-...')
    fireEvent.change(input, { target: { value: 'speechify-valid-key' } })
    fireEvent.blur(input)

    await waitFor(() => {
      expect(mocks.validateSpeechifyKey).toHaveBeenCalledWith('speechify-valid-key')
    })
    expect(mocks.updateAppSettings).toHaveBeenCalledWith({ speechifyApiKey: 'speechify-valid-key' })
  })
})
