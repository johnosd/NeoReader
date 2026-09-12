import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { SettingsTranslationScreen } from '@/screens/SettingsTranslationScreen'

const mocks = vi.hoisted(() => ({
  getSettings: vi.fn(),
  updateAppSettings: vi.fn(),
  updateReaderDefaults: vi.fn(),
  validateDeepLKey: vi.fn(),
  validateOpenAiKey: vi.fn(),
  validateGoogleKey: vi.fn(),
  isNativePlatform: vi.fn(() => true),
}))

vi.mock('@capacitor/app', () => ({
  App: {
    addListener: vi.fn(async () => ({ remove: vi.fn() })),
  },
}))

// Default: Android (nativo) — o cenário "normal" de configurar/testar a
// chave. A DeepL bloqueia CORS fora do Android (R-006); o teste dedicado no
// fim do arquivo cobre o cenário Web (isNativePlatform: false).
vi.mock('@capacitor/core', () => ({
  Capacitor: { isNativePlatform: mocks.isNativePlatform },
}))

vi.mock('@/db/settings', () => ({
  getSettings: mocks.getSettings,
  updateAppSettings: mocks.updateAppSettings,
  updateReaderDefaults: mocks.updateReaderDefaults,
}))

vi.mock('@/services/DeepLService', () => ({
  DeepLService: {
    getApiKey: vi.fn(async () => ''),
    isConfigured: vi.fn(async () => false),
    validateApiKey: mocks.validateDeepLKey,
    translate: vi.fn(),
  },
}))

vi.mock('@/services/OpenAiTranslationService', () => ({
  OpenAiTranslationService: {
    getApiKey: vi.fn(async () => ''),
    isConfigured: vi.fn(async () => false),
    validateApiKey: mocks.validateOpenAiKey,
    translate: vi.fn(),
  },
}))

vi.mock('@/services/GoogleTranslateService', () => ({
  GoogleTranslateService: {
    getApiKey: vi.fn(async () => ''),
    isConfigured: vi.fn(async () => false),
    validateApiKey: mocks.validateGoogleKey,
    translate: vi.fn(),
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
      deeplApiKey: '',
      openaiTranslationApiKey: '',
      googleTranslateApiKey: '',
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

// FR-012: a tela não depende de nenhum gate de assinatura (useEntitlements
// não é sequer mockado/importado aqui) — se a tela algum dia passar a
// checar isPro, este arquivo passaria a falhar por falta desse mock,
// sinalizando a regressão.
describe('SettingsTranslationScreen', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.getSettings.mockResolvedValue(settingsFixture())
    mocks.updateAppSettings.mockResolvedValue(undefined)
    mocks.validateDeepLKey.mockResolvedValue({ isValid: true, code: 'valid', message: 'Chave da DeepL válida.' })
    mocks.validateOpenAiKey.mockResolvedValue({ isValid: true, code: 'valid', message: 'Chave da OpenAI válida.' })
    mocks.validateGoogleKey.mockResolvedValue({ isValid: true, code: 'valid', message: 'Chave da Google válida.' })
    mocks.isNativePlatform.mockReturnValue(true)
  })

  it('mantém o campo de chave da DeepL compacto até o usuário expandir', async () => {
    render(<SettingsTranslationScreen onBack={vi.fn()} />)

    expect(await screen.findByText('DeepL')).toBeTruthy()
    expect(screen.queryByPlaceholderText(/xxxxxxxx/)).toBeNull()

    fireEvent.click(screen.getByRole('button', { name: /DeepL/ }))

    expect(await screen.findByPlaceholderText(/xxxxxxxx/)).not.toBeNull()
  })

  it('valida e salva a chave da DeepL no blur', async () => {
    render(<SettingsTranslationScreen onBack={vi.fn()} />)

    await screen.findByText('DeepL')
    fireEvent.click(screen.getByRole('button', { name: /DeepL/ }))

    const input = await screen.findByPlaceholderText(/xxxxxxxx/)
    fireEvent.change(input, { target: { value: 'deepl-valid-key:fx' } })
    fireEvent.blur(input)

    await waitFor(() => {
      expect(mocks.validateDeepLKey).toHaveBeenCalledWith('deepl-valid-key:fx')
    })
    expect(mocks.updateAppSettings).toHaveBeenCalledWith({ deeplApiKey: 'deepl-valid-key:fx' })
  })

  it('não persiste a chave quando a validação falha', async () => {
    mocks.validateDeepLKey.mockResolvedValue({ isValid: false, code: 'invalid', message: 'Chave inválida.' })

    render(<SettingsTranslationScreen onBack={vi.fn()} />)

    await screen.findByText('DeepL')
    fireEvent.click(screen.getByRole('button', { name: /DeepL/ }))

    const input = await screen.findByPlaceholderText(/xxxxxxxx/)
    fireEvent.change(input, { target: { value: 'bad-key' } })
    fireEvent.blur(input)

    await waitFor(() => {
      expect(mocks.validateDeepLKey).toHaveBeenCalledWith('bad-key')
    })
    expect(mocks.updateAppSettings).not.toHaveBeenCalled()
    // A mensagem exibida vem de getTranslationApiKeyValidationMessage(code, t)
    // — mapeada a partir do `code`, não do texto bruto devolvido pelo mock.
    expect(await screen.findByText('API key invalida ou sem permissao.')).toBeTruthy()
  })

  it('fora do Android, mostra aviso em vez do campo de chave pra DeepL/OpenAI, mas Google continua com campo normal (R-006/CORS não afeta Google)', async () => {
    mocks.isNativePlatform.mockReturnValue(false)

    render(<SettingsTranslationScreen onBack={vi.fn()} />)

    expect(await screen.findByText('DeepL')).toBeTruthy()
    expect(screen.getByText('OpenAI')).toBeTruthy()
    expect(screen.getByText('Google Translate')).toBeTruthy()
    expect(screen.getAllByText(/bloqueia chamadas direto do navegador/)).toHaveLength(2) // DeepL + OpenAI
    expect(screen.queryByPlaceholderText(/xxxxxxxx/)).toBeNull()
    expect(screen.queryByPlaceholderText('sk-...')).toBeNull()
    expect(mocks.validateDeepLKey).not.toHaveBeenCalled()
    expect(mocks.validateOpenAiKey).not.toHaveBeenCalled()

    fireEvent.click(screen.getByRole('button', { name: /Google Translate/ }))
    expect(await screen.findByPlaceholderText('AIza...')).not.toBeNull()
  })

  it('mantém o campo de chave da Google compacto até o usuário expandir', async () => {
    render(<SettingsTranslationScreen onBack={vi.fn()} />)

    expect(await screen.findByText('Google Translate')).toBeTruthy()
    expect(screen.queryByPlaceholderText('AIza...')).toBeNull()

    fireEvent.click(screen.getByRole('button', { name: /Google Translate/ }))

    expect(await screen.findByPlaceholderText('AIza...')).not.toBeNull()
  })

  it('valida e salva a chave da Google no blur', async () => {
    render(<SettingsTranslationScreen onBack={vi.fn()} />)

    await screen.findByText('Google Translate')
    fireEvent.click(screen.getByRole('button', { name: /Google Translate/ }))

    const input = await screen.findByPlaceholderText('AIza...')
    fireEvent.change(input, { target: { value: 'google-valid-key' } })
    fireEvent.blur(input)

    await waitFor(() => {
      expect(mocks.validateGoogleKey).toHaveBeenCalledWith('google-valid-key')
    })
    expect(mocks.updateAppSettings).toHaveBeenCalledWith({ googleTranslateApiKey: 'google-valid-key' })
  })

  it('não persiste a chave da Google quando a validação falha', async () => {
    mocks.validateGoogleKey.mockResolvedValue({ isValid: false, code: 'permission_denied', message: 'x' })

    render(<SettingsTranslationScreen onBack={vi.fn()} />)

    await screen.findByText('Google Translate')
    fireEvent.click(screen.getByRole('button', { name: /Google Translate/ }))

    const input = await screen.findByPlaceholderText('AIza...')
    fireEvent.change(input, { target: { value: 'bad-key' } })
    fireEvent.blur(input)

    await waitFor(() => {
      expect(mocks.validateGoogleKey).toHaveBeenCalledWith('bad-key')
    })
    expect(mocks.updateAppSettings).not.toHaveBeenCalled()
  })

  it('mantém o campo de chave da OpenAI compacto até o usuário expandir', async () => {
    render(<SettingsTranslationScreen onBack={vi.fn()} />)

    expect(await screen.findByText('OpenAI')).toBeTruthy()
    expect(screen.queryByPlaceholderText('sk-...')).toBeNull()

    fireEvent.click(screen.getByRole('button', { name: /OpenAI/ }))

    expect(await screen.findByPlaceholderText('sk-...')).not.toBeNull()
  })

  it('valida e salva a chave da OpenAI no blur', async () => {
    render(<SettingsTranslationScreen onBack={vi.fn()} />)

    await screen.findByText('OpenAI')
    fireEvent.click(screen.getByRole('button', { name: /OpenAI/ }))

    const input = await screen.findByPlaceholderText('sk-...')
    fireEvent.change(input, { target: { value: 'openai-valid-key' } })
    fireEvent.blur(input)

    await waitFor(() => {
      expect(mocks.validateOpenAiKey).toHaveBeenCalledWith('openai-valid-key')
    })
    expect(mocks.updateAppSettings).toHaveBeenCalledWith({ openaiTranslationApiKey: 'openai-valid-key' })
  })

  it('não persiste a chave da OpenAI quando a validação falha', async () => {
    mocks.validateOpenAiKey.mockResolvedValue({ isValid: false, code: 'permission_denied', message: 'x' })

    render(<SettingsTranslationScreen onBack={vi.fn()} />)

    await screen.findByText('OpenAI')
    fireEvent.click(screen.getByRole('button', { name: /OpenAI/ }))

    const input = await screen.findByPlaceholderText('sk-...')
    fireEvent.change(input, { target: { value: 'bad-key' } })
    fireEvent.blur(input)

    await waitFor(() => {
      expect(mocks.validateOpenAiKey).toHaveBeenCalledWith('bad-key')
    })
    expect(mocks.updateAppSettings).not.toHaveBeenCalled()
  })
})
