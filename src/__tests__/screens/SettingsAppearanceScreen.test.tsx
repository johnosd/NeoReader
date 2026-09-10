import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { SettingsAppearanceScreen } from '@/screens/SettingsAppearanceScreen'

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

describe('SettingsAppearanceScreen', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.getSettings.mockResolvedValue(settingsFixture())
    mocks.updateAppSettings.mockResolvedValue(undefined)
    mocks.updateReaderDefaults.mockResolvedValue(undefined)
  })

  it('salva defaults do leitor ao alterar tamanho de fonte', async () => {
    render(<SettingsAppearanceScreen onBack={vi.fn()} />)

    await screen.findByText('Aparencia')
    fireEvent.click(screen.getByRole('button', { name: 'Fonte Grande' }))

    expect(mocks.updateReaderDefaults).toHaveBeenCalledWith({ defaultFontSize: 'lg' })
  })

  it('modo original respeita fonte e cores do EPUB nos defaults globais', async () => {
    render(<SettingsAppearanceScreen onBack={vi.fn()} />)

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

    render(<SettingsAppearanceScreen onBack={vi.fn()} />)

    await screen.findByText('Modo de leitura')
    fireEvent.click(screen.getByText('Confortavel'))

    expect(mocks.updateReaderDefaults).toHaveBeenCalledWith({
      fontFamily: 'classic',
      overrideBookFont: true,
      overrideBookColors: true,
    })
  })

  it('mostra o mapa de zonas de toque com a legenda das 3 acoes', async () => {
    render(<SettingsAppearanceScreen onBack={vi.fn()} />)

    await screen.findByText('Mapa de toques do leitor')

    expect(screen.getByText('Topo, rodape e direita')).not.toBeNull()
    expect(screen.getByText('Mostra ou esconde o menu')).not.toBeNull()
    expect(screen.getByText('Centro (texto)')).not.toBeNull()
    expect(screen.getByText('Abre a traducao do trecho tocado')).not.toBeNull()
    expect(screen.getByText('Borda esquerda')).not.toBeNull()
    expect(screen.getByText('Abre o indice do livro')).not.toBeNull()
  })

  it('tocar no diagrama do mapa de zonas nao dispara nenhuma gravacao de preferencia', async () => {
    render(<SettingsAppearanceScreen onBack={vi.fn()} />)

    const title = await screen.findByText('Mapa de toques do leitor')
    fireEvent.click(title)

    expect(mocks.updateReaderDefaults).not.toHaveBeenCalled()
    expect(mocks.updateAppSettings).not.toHaveBeenCalled()
  })
})
