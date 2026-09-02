import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { SettingsWordLensScreen } from '@/screens/SettingsWordLensScreen'

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

describe('SettingsWordLensScreen', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.getSettings.mockResolvedValue(settingsFixture())
    mocks.updateAppSettings.mockResolvedValue(undefined)
    mocks.updateReaderDefaults.mockResolvedValue(undefined)
  })

  it('mostra o Word Lens ativo em B1 sem carregar o data pack', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch')
    render(<SettingsWordLensScreen onBack={vi.fn()} />)

    expect((await screen.findByRole('switch', { name: 'Ativar Word Lens' }) as HTMLButtonElement).getAttribute('aria-checked')).toBe('true')
    expect((screen.getByRole('combobox', { name: 'Nivel CEFR do Word Lens' }) as HTMLSelectElement).value).toBe('B1')
    expect(fetchSpy).not.toHaveBeenCalled()
    fetchSpy.mockRestore()
  })

  it('exibe legenda, versao, limitacoes e atribuicoes do Word Lens', async () => {
    render(<SettingsWordLensScreen onBack={vi.fn()} />)

    await screen.findByText('Como a marcacao aparece')

    expect(screen.getByText('Palavra acima do nivel escolhido')).toBeTruthy()
    expect(screen.getByText(/Pacote 1\.0\.0/)).toBeTruthy()
    expect(screen.getByText(/CEFR-J Wordlist 1\.5/)).toBeTruthy()
    expect(screen.getByText(/Octanove Vocabulary Profile C1\/C2 1\.0 \(CC BY-SA 4\.0\)/)).toBeTruthy()
    expect(screen.getByText(/Open English WordNet 2025 \(CC BY 4\.0\)/)).toBeTruthy()
    expect(screen.getByText(/mostra sentidos disponiveis.*nao interpreta o contexto/)).toBeTruthy()
  })

  it('salva ativacao e nivel do Word Lens', async () => {
    render(<SettingsWordLensScreen onBack={vi.fn()} />)

    await screen.findByRole('switch', { name: 'Ativar Word Lens' })
    fireEvent.change(screen.getByRole('combobox', { name: 'Nivel CEFR do Word Lens' }), {
      target: { value: 'C2' },
    })
    expect(mocks.updateReaderDefaults).toHaveBeenCalledWith({ wordLensLevel: 'C2' })

    const toggle = await screen.findByRole('switch', { name: 'Ativar Word Lens' })
    fireEvent.click(toggle)
    expect(mocks.updateReaderDefaults).toHaveBeenCalledWith({ wordLensEnabled: false })
  })
})
