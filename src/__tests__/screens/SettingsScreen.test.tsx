import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { SettingsScreen } from '@/screens/SettingsScreen'
import { FeatureQuotaService } from '@/services/FeatureQuotaService'

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
    FeatureQuotaService.reset()
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

  it('mostra sync de bookmarks como recurso Pro nas configuracoes', async () => {
    const onOpenPaywall = vi.fn()
    render(<SettingsScreen onBack={vi.fn()} onOpenPaywall={onOpenPaywall} />)

    await screen.findByText('Bookmarks na nuvem')

    expect(screen.getByText('Backup de bookmarks')).toBeTruthy()
    expect(screen.getByText('Recurso Pro')).toBeTruthy()
    expect(screen.getByText(/Bookmarks locais continuam disponiveis/)).toBeTruthy()
    expect(onOpenPaywall).not.toHaveBeenCalled()
  })

  it('mostra status Free e quotas restantes nas configuracoes', async () => {
    FeatureQuotaService.consume('book-intelligence', { isPro: false, subjectKey: 'book:1' })

    render(<SettingsScreen onBack={vi.fn()} />)

    await screen.findByText('Uso Free')

    expect(screen.getByText('Review e Autor')).toBeTruthy()
    expect(screen.getByText(/Restam 4 de 5 livros este mes/)).toBeTruthy()
    expect(screen.getByText('Descubra/NYT')).toBeTruthy()
    expect(screen.getByText(/Restam 5 de 5 atualizacoes este mes/)).toBeTruthy()
  })

  it('mantem campos de integracao compactos ate o usuario expandir', async () => {
    render(<SettingsScreen onBack={vi.fn()} />)

    await screen.findByText('Integracoes')

    expect(screen.queryByPlaceholderText('sk-...')).toBeNull()

    fireEvent.click(screen.getByRole('button', { name: /Speechify/ }))

    expect(await screen.findByPlaceholderText('sk-...')).not.toBeNull()
  })

  it('explica o que cada API key habilita nas integracoes', async () => {
    render(<SettingsScreen onBack={vi.fn()} />)

    await screen.findByText('Integracoes')
    fireEvent.click(screen.getByRole('button', { name: /Speechify/ }))

    expect(await screen.findByText(/Vozes Speechify/)).toBeTruthy()
    expect(screen.getByText(/A key fica salva neste dispositivo/)).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: /YouTube Data API/ }))

    expect(await screen.findByText(/Reviews em video/)).toBeTruthy()
    expect(screen.getByText(/entrevistas e palestras/)).toBeTruthy()
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
    const spanishOptions = screen.getAllByText('Espanhol')
    fireEvent.click(spanishOptions[spanishOptions.length - 1])

    expect(mocks.updateAppSettings).toHaveBeenCalledWith({ translationTargetLang: 'es' })
  })

  it('salva idioma do app pelo bottom sheet', async () => {
    render(<SettingsScreen onBack={vi.fn()} />)

    const appLanguageLabels = await screen.findAllByText('Idioma do app')
    const appLanguageRow = appLanguageLabels[0].closest('[role="button"]')
    expect(appLanguageRow).not.toBeNull()
    fireEvent.click(appLanguageRow!)
    const englishOptions = screen.getAllByText('Inglês')
    fireEvent.click(englishOptions[0])

    expect(mocks.updateAppSettings).toHaveBeenCalledWith({ appLocale: 'en' })
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
