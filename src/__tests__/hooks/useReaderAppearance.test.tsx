import { renderHook, act } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'

const mocks = vi.hoisted(() => ({
  getSettings: vi.fn(),
  getBookSettings: vi.fn(),
  updateBookSettings: vi.fn(),
  parseExtras: vi.fn(),
  logEvent: vi.fn(),
}))

vi.mock('@/db/settings', () => ({ getSettings: mocks.getSettings }))
vi.mock('@/db/bookSettings', () => ({
  getBookSettings: mocks.getBookSettings,
  updateBookSettings: mocks.updateBookSettings,
}))
vi.mock('@/services/EpubService', () => ({
  EpubService: { parseExtras: mocks.parseExtras },
}))
vi.mock('@/services/DiagnosticsLogger', () => ({
  logEvent: mocks.logEvent,
}))

import { useReaderAppearance } from '@/hooks/useReaderAppearance'
import type { Book } from '@/types/book'

const book: Book = {
  id: 42,
  title: 'Test',
  author: 'Author',
  fileBlob: new Blob(['epub']),
  addedAt: new Date(),
  lastOpenedAt: null,
}

const defaultSettings = {
  appSettings: {
    speechifyApiKey: 'key',
    elevenLabsApiKey: '',
    fishAudioApiKey: '',
    youtubeApiKey: '',
    translationTargetLang: 'pt-BR',
  },
  readerDefaults: {
    defaultFontSize: 'md' as const,
    lineHeight: 'comfortable' as const,
    readerTheme: 'dark' as const,
    fontFamily: 'classic' as const,
    overrideBookFont: true,
    overrideBookColors: true,
    wordLensEnabled: true,
    wordLensLevel: 'B1' as const,
  },
}

const emptyBookSettings = {}

beforeEach(() => {
  mocks.getSettings.mockClear()
  mocks.getBookSettings.mockClear()
  mocks.parseExtras.mockClear()
  mocks.updateBookSettings.mockClear()
  mocks.logEvent.mockClear()
  mocks.getSettings.mockResolvedValue(defaultSettings)
  mocks.getBookSettings.mockResolvedValue(emptyBookSettings)
  mocks.parseExtras.mockResolvedValue({ language: 'en', toc: [], description: null })
  mocks.updateBookSettings.mockResolvedValue(undefined)
})

describe('useReaderAppearance', () => {
  it('retorna defaults antes das preferências carregarem', () => {
    // Pendente — não resolve imediatamente
    mocks.getSettings.mockReturnValue(new Promise(() => {}))
    const { result } = renderHook(() => useReaderAppearance(book))

    expect(result.current.fontSize).toBe('md')
    expect(result.current.readerTheme).toBe('dark')
    expect(result.current.fontFamily).toBe('classic')
    expect(result.current.bookLanguage).toBe('en')
    expect(result.current.wordLensEnabled).toBe(false)
    expect(result.current.wordLensLevel).toBe('B1')
  })

  it('carrega preferências globais quando não há override por livro', async () => {
    mocks.getSettings.mockResolvedValue({
      ...defaultSettings,
      readerDefaults: { ...defaultSettings.readerDefaults, defaultFontSize: 'xl', readerTheme: 'paper' },
    })

    const { result } = renderHook(() => useReaderAppearance(book))
    await act(async () => { await Promise.resolve() })

    expect(result.current.fontSize).toBe('xl')
    expect(result.current.readerTheme).toBe('paper')
  })

  it('preferências por livro sobrescrevem as globais', async () => {
    mocks.getBookSettings.mockResolvedValue({
      fontSize: 'sm',
      readerTheme: 'light',
      fontFamily: 'humanist',
    })

    const { result } = renderHook(() => useReaderAppearance(book))
    await act(async () => { await Promise.resolve() })

    expect(result.current.fontSize).toBe('sm')
    expect(result.current.readerTheme).toBe('light')
    expect(result.current.fontFamily).toBe('humanist')
  })

  it('usa o idioma do livro do EPUB quando não salvo no bookSettings', async () => {
    mocks.parseExtras.mockResolvedValue({ language: 'fr', toc: [], description: null })

    const { result } = renderHook(() => useReaderAppearance(book))
    await act(async () => { await Promise.resolve() })

    expect(result.current.bookLanguage).toBe('fr')
    expect(result.current.ttsConfig.language).toBe('fr')
  })

  it('idioma salvo no bookSettings tem prioridade sobre o EPUB', async () => {
    mocks.getBookSettings.mockResolvedValue({ bookLanguage: 'de' })
    mocks.parseExtras.mockResolvedValue({ language: 'en', toc: [], description: null })

    const { result } = renderHook(() => useReaderAppearance(book))
    await act(async () => { await Promise.resolve() })

    expect(result.current.bookLanguage).toBe('de')
  })

  it('applyAppearancePatch atualiza o estado e persiste no banco', async () => {
    const { result } = renderHook(() => useReaderAppearance(book))
    await act(async () => { await Promise.resolve() })

    act(() => { result.current.applyAppearancePatch({ fontSize: 'lg', readerTheme: 'paper' }) })

    expect(result.current.fontSize).toBe('lg')
    expect(result.current.readerTheme).toBe('paper')
    expect(mocks.updateBookSettings).toHaveBeenCalledWith(book.id, {
      fontSize: 'lg',
      readerTheme: 'paper',
    })
  })

  it('applyAppearancePatch registra mudancas de aparencia do leitor', async () => {
    const { result } = renderHook(() => useReaderAppearance(book))
    await act(async () => { await Promise.resolve() })

    act(() => {
      result.current.applyAppearancePatch({
        fontSize: 'lg',
        lineHeight: 'relaxed',
        readerTheme: 'paper',
        fontFamily: 'modern',
      })
    })

    expect(mocks.logEvent).toHaveBeenCalledWith('reader.appearance.fontSize.change', expect.objectContaining({
      screen: 'reader',
      status: 'success',
      details: expect.objectContaining({
        bookId: book.id,
        previousValue: 'md',
        nextValue: 'lg',
      }),
    }))
    expect(mocks.logEvent).toHaveBeenCalledWith('reader.appearance.lineHeight.change', expect.objectContaining({
      details: expect.objectContaining({
        previousValue: 'comfortable',
        nextValue: 'relaxed',
      }),
    }))
    expect(mocks.logEvent).toHaveBeenCalledWith('reader.appearance.theme.change', expect.objectContaining({
      details: expect.objectContaining({
        previousValue: 'dark',
        nextValue: 'paper',
      }),
    }))
    expect(mocks.logEvent).toHaveBeenCalledWith('reader.appearance.fontFamily.change', expect.objectContaining({
      details: expect.objectContaining({
        previousValue: 'classic',
        nextValue: 'modern',
      }),
    }))
  })

  it('applyAppearancePatch nao registra log quando valor nao muda', async () => {
    const { result } = renderHook(() => useReaderAppearance(book))
    await act(async () => { await Promise.resolve() })

    act(() => {
      result.current.applyAppearancePatch({
        fontSize: 'md',
        lineHeight: 'comfortable',
        readerTheme: 'dark',
        fontFamily: 'classic',
      })
    })

    expect(mocks.logEvent).not.toHaveBeenCalled()
  })

  it('handleReaderStyleModeChange original desativa overrides de fonte e cor', async () => {
    const { result } = renderHook(() => useReaderAppearance(book))
    await act(async () => { await Promise.resolve() })

    act(() => { result.current.handleReaderStyleModeChange('original') })

    expect(result.current.fontFamily).toBe('publisher')
    expect(result.current.overrideBookFont).toBe(false)
    expect(result.current.overrideBookColors).toBe(false)
  })

  it('handleReaderStyleModeChange comfortable ativa overrides', async () => {
    // Começa no modo original
    mocks.getBookSettings.mockResolvedValue({ fontFamily: 'publisher', overrideBookFont: false, overrideBookColors: false })
    const { result } = renderHook(() => useReaderAppearance(book))
    await act(async () => { await Promise.resolve() })

    act(() => { result.current.handleReaderStyleModeChange('comfortable') })

    expect(result.current.overrideBookFont).toBe(true)
    expect(result.current.overrideBookColors).toBe(true)
    // publisher é substituído pela fonte default quando modo confortável é ativado
    expect(result.current.fontFamily).not.toBe('publisher')
  })

  it('ttsEngine cai para native quando speechify não tem API key', async () => {
    mocks.getBookSettings.mockResolvedValue({ ttsProvider: 'speechify' })
    mocks.getSettings.mockResolvedValue({
      ...defaultSettings,
      appSettings: { ...defaultSettings.appSettings, speechifyApiKey: '' },
    })

    const { result } = renderHook(() => useReaderAppearance(book))
    await act(async () => { await Promise.resolve() })

    expect(result.current.ttsEngine).toBe('native')
  })

  it('ttsEngine usa speechify quando API key está configurada', async () => {
    mocks.getBookSettings.mockResolvedValue({ ttsProvider: 'speechify' })
    mocks.getSettings.mockResolvedValue({
      ...defaultSettings,
      appSettings: { ...defaultSettings.appSettings, speechifyApiKey: 'valid-key' },
    })

    const { result } = renderHook(() => useReaderAppearance(book))
    await act(async () => { await Promise.resolve() })

    expect(result.current.ttsEngine).toBe('speechify')
  })

  it('switchToNativeTts atualiza o estado e persiste o provider nativo', async () => {
    mocks.getBookSettings.mockResolvedValue({ ttsProvider: 'speechify' })
    mocks.getSettings.mockResolvedValue({
      ...defaultSettings,
      appSettings: { ...defaultSettings.appSettings, speechifyApiKey: 'valid-key' },
    })

    const { result } = renderHook(() => useReaderAppearance(book))
    await act(async () => { await Promise.resolve() })

    expect(result.current.ttsConfig.provider).toBe('speechify')
    expect(result.current.ttsEngine).toBe('speechify')

    act(() => { result.current.switchToNativeTts() })

    expect(result.current.ttsConfig.provider).toBe('native')
    expect(result.current.ttsEngine).toBe('native')
    expect(mocks.updateBookSettings).toHaveBeenCalledWith(book.id, {
      ttsProvider: 'native',
    })
  })

  it('applyTtsConfigPatch atualiza provider disponivel e persiste no banco', async () => {
    mocks.getSettings.mockResolvedValue({
      ...defaultSettings,
      appSettings: { ...defaultSettings.appSettings, elevenLabsApiKey: 'eleven-key' },
    })

    const { result } = renderHook(() => useReaderAppearance(book))
    await act(async () => { await Promise.resolve() })

    act(() => { result.current.applyTtsConfigPatch({ provider: 'elevenlabs' }) })

    expect(result.current.ttsConfig.provider).toBe('elevenlabs')
    expect(result.current.ttsEngine).toBe('elevenlabs')
    expect(result.current.ttsProviderAvailability.elevenlabs).toBe(true)
    expect(mocks.updateBookSettings).toHaveBeenCalledWith(book.id, {
      ttsProvider: 'elevenlabs',
    })
  })

  it('applyTtsConfigPatch aplica clamp de velocidade e persiste ttsRate', async () => {
    const { result } = renderHook(() => useReaderAppearance(book))
    await act(async () => { await Promise.resolve() })

    act(() => { result.current.applyTtsConfigPatch({ rate: 2 }) })

    expect(result.current.ttsConfig.rate).toBe(1.2)
    expect(mocks.updateBookSettings).toHaveBeenCalledWith(book.id, {
      ttsRate: 1.2,
    })
  })

  it('applyTtsConfigPatch ignora provider premium indisponivel', async () => {
    const { result } = renderHook(() => useReaderAppearance(book))
    await act(async () => { await Promise.resolve() })

    act(() => { result.current.applyTtsConfigPatch({ provider: 'elevenlabs' }) })

    expect(result.current.ttsConfig.provider).not.toBe('elevenlabs')
    expect(result.current.ttsEngine).toBe('speechify')
    expect(mocks.updateBookSettings).not.toHaveBeenCalledWith(book.id, {
      ttsProvider: 'elevenlabs',
    })
  })
})

// Feature 022 (DI-012): idioma de PDF. EPUB não muda — os casos acima seguem valendo.
describe('useReaderAppearance — PDF', () => {
  const pdfBook: Book = { ...book, format: 'PDF', detectedLanguage: 'pt-BR' }
  // Objeto estável: o hook depende da identidade de `book`, e um objeto novo a cada render reexecutaria o efeito sem parar.
  const pdfNoLanguage: Book = { ...pdfBook, detectedLanguage: null }

  it('usa o idioma detectado no import e não lê o arquivo como EPUB', async () => {
    const { result } = renderHook(() => useReaderAppearance(pdfBook))
    await act(async () => { await Promise.resolve() })

    expect(result.current.bookLanguage).toBe('pt-BR')
    expect(result.current.bookLanguageUndefined).toBe(false)
    expect(result.current.ttsConfig.language).toBe('pt-BR')
    expect(mocks.parseExtras).not.toHaveBeenCalled()
  })

  it('idioma manual do livro vence o detectado', async () => {
    mocks.getBookSettings.mockResolvedValue({ bookLanguage: 'es' })
    const { result } = renderHook(() => useReaderAppearance(pdfBook))
    await act(async () => { await Promise.resolve() })

    expect(result.current.bookLanguage).toBe('es')
    expect(result.current.bookLanguageUndefined).toBe(false)
  })

  it('sem idioma manual nem detectado: fica indefinido (sem aviso silencioso de "en")', async () => {
    const { result } = renderHook(() => useReaderAppearance(pdfNoLanguage))
    await act(async () => { await Promise.resolve() })

    expect(result.current.bookLanguageUndefined).toBe(true)
    expect(result.current.pdfLanguageWarningDismissed).toBe(false)
  })

  it('aviso de idioma dispensado fica gravado por livro e não reaparece', async () => {
    const first = renderHook(() => useReaderAppearance(pdfNoLanguage))
    await act(async () => { await Promise.resolve() })

    act(() => first.result.current.dismissPdfLanguageWarning())
    expect(first.result.current.pdfLanguageWarningDismissed).toBe(true)
    expect(mocks.updateBookSettings).toHaveBeenCalledWith(42, { pdfLanguageWarningDismissed: true })

    // Reabrir o livro: a dispensa vem do BookSettings gravado.
    mocks.getBookSettings.mockResolvedValue({ pdfLanguageWarningDismissed: true })
    const second = renderHook(() => useReaderAppearance(pdfNoLanguage))
    await act(async () => { await Promise.resolve() })
    expect(second.result.current.pdfLanguageWarningDismissed).toBe(true)
  })

  it('escolher o idioma pelo aviso passa a valer em tradução/TTS e tira o estado indefinido', async () => {
    const { result } = renderHook(() => useReaderAppearance(pdfNoLanguage))
    await act(async () => { await Promise.resolve() })
    expect(result.current.bookLanguageUndefined).toBe(true)

    act(() => result.current.applyBookLanguage('fr'))

    expect(result.current.bookLanguage).toBe('fr')
    expect(result.current.ttsConfig.language).toBe('fr')
    expect(result.current.bookLanguageUndefined).toBe(false)
    expect(mocks.updateBookSettings).toHaveBeenCalledWith(42, { bookLanguage: 'fr' })
  })

  it('EPUB: bookLanguageUndefined é sempre false e o fallback para "en" continua', async () => {
    mocks.parseExtras.mockResolvedValue({ language: null, toc: [], description: null })
    const { result } = renderHook(() => useReaderAppearance(book))
    await act(async () => { await Promise.resolve() })

    expect(result.current.bookLanguage).toBe('en')
    expect(result.current.bookLanguageUndefined).toBe(false)
    expect(mocks.parseExtras).toHaveBeenCalled()
  })
})
