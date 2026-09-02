import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { SettingsNarrationScreen } from '@/screens/SettingsNarrationScreen'
import { WakeLockService } from '@/services/WakeLockService'

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
      wordLensEnabled: true,
      wordLensLevel: 'B1',
    },
    updatedAt: new Date(),
  }
}

describe('SettingsNarrationScreen', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    WakeLockService.setEnabled(false)
    mocks.getSettings.mockResolvedValue(settingsFixture())
    mocks.updateAppSettings.mockResolvedValue(undefined)
    mocks.updateReaderDefaults.mockResolvedValue(undefined)
    mocks.validateSpeechifyKey.mockResolvedValue({ isValid: true, message: 'ok' })
    mocks.validateElevenLabsKey.mockResolvedValue({ isValid: true, message: 'ok' })
  })

  it('mostra o card de TTS nativo como sempre disponivel', async () => {
    render(<SettingsNarrationScreen onBack={vi.fn()} />)

    expect(await screen.findByText('TTS nativo')).toBeTruthy()
    expect(screen.getByText('Sempre disponivel como fallback no dispositivo.')).toBeTruthy()
    expect(screen.getByText('Ativo')).toBeTruthy()
    expect(screen.getByText('Leitura por voz sempre funciona')).toBeTruthy()
  })

  it('liga e desliga "Manter tela acesa", persistindo via WakeLockService', async () => {
    render(<SettingsNarrationScreen onBack={vi.fn()} />)

    const toggle = await screen.findByRole('switch', { name: 'Manter tela acesa' }) as HTMLButtonElement
    expect(toggle.getAttribute('aria-checked')).toBe('false')
    expect(WakeLockService.isEnabled()).toBe(false)

    fireEvent.click(toggle)

    expect(toggle.getAttribute('aria-checked')).toBe('true')
    expect(WakeLockService.isEnabled()).toBe(true)
  })

  it('mantem campos de chave TTS compactos ate o usuario expandir', async () => {
    render(<SettingsNarrationScreen onBack={vi.fn()} />)

    await screen.findByText('TTS nativo')
    expect(screen.queryByPlaceholderText('sk-...')).toBeNull()

    fireEvent.click(screen.getByRole('button', { name: /Speechify/ }))

    expect(await screen.findByPlaceholderText('sk-...')).not.toBeNull()
  })

  it('explica o que a chave da Speechify habilita', async () => {
    render(<SettingsNarrationScreen onBack={vi.fn()} />)

    await screen.findByText('TTS nativo')
    fireEvent.click(screen.getByRole('button', { name: /Speechify/ }))

    expect(await screen.findByText(/Vozes Speechify/)).toBeTruthy()
    expect(screen.getByText(/A key fica salva neste dispositivo/)).toBeTruthy()
  })

  it('valida e salva key da Speechify no blur', async () => {
    render(<SettingsNarrationScreen onBack={vi.fn()} />)

    await screen.findByText('TTS nativo')
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
