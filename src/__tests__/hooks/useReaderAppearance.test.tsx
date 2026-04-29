import { renderHook, act } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'

const mocks = vi.hoisted(() => ({
  getSettings: vi.fn(),
  getBookSettings: vi.fn(),
  updateBookSettings: vi.fn(),
  parseExtras: vi.fn(),
}))

vi.mock('@/db/settings', () => ({ getSettings: mocks.getSettings }))
vi.mock('@/db/bookSettings', () => ({
  getBookSettings: mocks.getBookSettings,
  updateBookSettings: mocks.updateBookSettings,
}))
vi.mock('@/services/EpubService', () => ({
  EpubService: { parseExtras: mocks.parseExtras },
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
  },
}

const emptyBookSettings = {}

beforeEach(() => {
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
})
