import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => {
  let transactionQueue = Promise.resolve<unknown>(undefined)
  const first = vi.fn()
  return {
    first,
    resetTransactionQueue: () => {
      transactionQueue = Promise.resolve(undefined)
    },
    transaction: vi.fn((_mode: string, _table: unknown, callback: () => Promise<unknown>) => {
      const run = transactionQueue.then(() => callback())
      transactionQueue = run.catch(() => undefined)
      return run
    }),
    settingsTable: {
      toCollection: vi.fn(() => ({ first })),
      put: vi.fn(),
    },
  }
})

vi.mock('@/db/database', () => ({
  db: {
    settings: mocks.settingsTable,
    transaction: mocks.transaction,
  },
}))

import { getSettings, updateAppSettings, updateReaderDefaults } from '@/db/settings'

describe('settings db helpers', () => {
  beforeEach(() => {
    mocks.resetTransactionQueue()
    mocks.transaction.mockClear()
    mocks.first.mockReset()
    mocks.settingsTable.put.mockClear()
  })

  it('normaliza registros legados para appSettings + readerDefaults', async () => {
    mocks.first.mockResolvedValue({
      id: 7,
      speechifyApiKey: 'legacy-key',
      translationTargetLang: 'es',
      defaultFontSize: 'lg',
      updatedAt: new Date('2026-04-20T10:00:00.000Z'),
    })

    const settings = await getSettings()

    expect(settings).toEqual({
      id: 7,
      appSettings: {
        appLocale: 'auto',
        speechifyApiKey: 'legacy-key',
        elevenLabsApiKey: '',
        fishAudioApiKey: '',
        youtubeApiKey: '',
        translationTargetLang: 'es',
      },
      readerDefaults: {
        defaultFontSize: 'lg',
        lineHeight: 'comfortable',
        readerTheme: 'dark',
        fontFamily: 'classic',
        overrideBookFont: true,
        overrideBookColors: true,
        wordLensEnabled: true,
        wordLensLevel: 'B1',
      },
      updatedAt: new Date('2026-04-20T10:00:00.000Z'),
    })
  })

  it('persiste reader defaults no formato novo preservando app settings existentes', async () => {
    mocks.first.mockResolvedValue({
      id: 3,
      speechifyApiKey: 'legacy-key',
      translationTargetLang: 'fr',
      defaultFontSize: 'md',
      updatedAt: new Date('2026-04-20T10:00:00.000Z'),
    })

    await updateReaderDefaults({ defaultFontSize: 'xl' })

    expect(mocks.settingsTable.put).toHaveBeenCalledWith(expect.objectContaining({
      id: 3,
      appSettings: {
        appLocale: 'auto',
        speechifyApiKey: 'legacy-key',
        elevenLabsApiKey: '',
        fishAudioApiKey: '',
        youtubeApiKey: '',
        translationTargetLang: 'fr',
      },
      readerDefaults: {
        defaultFontSize: 'xl',
        lineHeight: 'comfortable',
        readerTheme: 'dark',
        fontFamily: 'classic',
        overrideBookFont: true,
        overrideBookColors: true,
        wordLensEnabled: true,
        wordLensLevel: 'B1',
      },
    }))
  })

  it('persiste app settings no formato novo preservando reader defaults existentes', async () => {
    mocks.first.mockResolvedValue({
      id: 4,
      appSettings: {
        appLocale: 'auto',
        speechifyApiKey: '',
        translationTargetLang: 'pt-BR',
      },
      readerDefaults: {
        defaultFontSize: 'sm',
        lineHeight: 'comfortable',
        readerTheme: 'dark',
        fontFamily: 'classic',
        overrideBookFont: true,
        overrideBookColors: true,
        wordLensEnabled: true,
        wordLensLevel: 'B1',
      },
      updatedAt: new Date('2026-04-20T10:00:00.000Z'),
    })

    await updateAppSettings({ translationTargetLang: 'de' })

    expect(mocks.settingsTable.put).toHaveBeenCalledWith(expect.objectContaining({
      id: 4,
      appSettings: {
        appLocale: 'auto',
        speechifyApiKey: '',
        elevenLabsApiKey: '',
        fishAudioApiKey: '',
        youtubeApiKey: '',
        translationTargetLang: 'de',
      },
      readerDefaults: {
        defaultFontSize: 'sm',
        lineHeight: 'comfortable',
        readerTheme: 'dark',
        fontFamily: 'classic',
        overrideBookFont: true,
        overrideBookColors: true,
        wordLensEnabled: true,
        wordLensLevel: 'B1',
      },
    }))
  })

  it('desativa override de fonte quando o padrao usa a fonte original do livro', async () => {
    mocks.first.mockResolvedValue({
      id: 5,
      appSettings: {
        appLocale: 'auto',
        speechifyApiKey: '',
        elevenLabsApiKey: '',
        fishAudioApiKey: '',
        translationTargetLang: 'pt-BR',
      },
      readerDefaults: {
        defaultFontSize: 'md',
        lineHeight: 'comfortable',
        readerTheme: 'paper',
        fontFamily: 'publisher',
      },
      updatedAt: new Date('2026-04-20T10:00:00.000Z'),
    })

    const settings = await getSettings()

    expect(settings.readerDefaults).toEqual({
      defaultFontSize: 'md',
      lineHeight: 'comfortable',
      readerTheme: 'paper',
      fontFamily: 'publisher',
      overrideBookFont: false,
      overrideBookColors: true,
      wordLensEnabled: true,
      wordLensLevel: 'B1',
    })
  })

  it('serializa updates concorrentes para nao perder patches', async () => {
    let stored = {
      id: 9,
      appSettings: {
        appLocale: 'auto',
        speechifyApiKey: '',
        elevenLabsApiKey: '',
        fishAudioApiKey: '',
        youtubeApiKey: '',
        translationTargetLang: 'pt-BR',
      },
      readerDefaults: {
        defaultFontSize: 'md',
        lineHeight: 'comfortable',
        readerTheme: 'dark',
        fontFamily: 'classic',
        overrideBookFont: true,
        overrideBookColors: true,
      },
      updatedAt: new Date('2026-04-20T10:00:00.000Z'),
    }
    mocks.first.mockImplementation(async () => stored)
    mocks.settingsTable.put.mockImplementation(async (nextSettings) => {
      stored = nextSettings
    })

    await Promise.all([
      updateAppSettings({ translationTargetLang: 'es' }),
      updateReaderDefaults({ defaultFontSize: 'xl' }),
    ])

    expect(mocks.transaction).toHaveBeenCalledTimes(2)
    expect(stored.appSettings.translationTargetLang).toBe('es')
    expect(stored.readerDefaults.defaultFontSize).toBe('xl')
  })

  it('normaliza valores ausentes ou invalidos do Word Lens', async () => {
    mocks.first.mockResolvedValue({
      readerDefaults: {
        wordLensEnabled: 'yes',
        wordLensLevel: 'B3',
      },
    })

    const settings = await getSettings()

    expect(settings.readerDefaults.wordLensEnabled).toBe(true)
    expect(settings.readerDefaults.wordLensLevel).toBe('B1')
  })

  it('preserva patches concorrentes do Word Lens', async () => {
    let stored: Awaited<ReturnType<typeof getSettings>> | undefined
    mocks.first.mockImplementation(async () => stored)
    mocks.settingsTable.put.mockImplementation(async (nextSettings) => {
      stored = nextSettings
    })

    await Promise.all([
      updateReaderDefaults({ wordLensEnabled: false }),
      updateReaderDefaults({ wordLensLevel: 'C1' }),
    ])

    expect(stored?.readerDefaults.wordLensEnabled).toBe(false)
    expect(stored?.readerDefaults.wordLensLevel).toBe('C1')
  })
})
