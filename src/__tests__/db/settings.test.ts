import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => {
  const first = vi.fn()
  return {
    first,
    settingsTable: {
      toCollection: vi.fn(() => ({ first })),
      put: vi.fn(),
    },
  }
})

vi.mock('@/db/database', () => ({
  db: {
    settings: mocks.settingsTable,
  },
}))

import { getSettings, updateAppSettings, updateReaderDefaults } from '@/db/settings'

describe('settings db helpers', () => {
  beforeEach(() => {
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
        speechifyApiKey: 'legacy-key',
        elevenLabsApiKey: '',
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
        speechifyApiKey: 'legacy-key',
        elevenLabsApiKey: '',
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
      },
    }))
  })

  it('persiste app settings no formato novo preservando reader defaults existentes', async () => {
    mocks.first.mockResolvedValue({
      id: 4,
      appSettings: {
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
      },
      updatedAt: new Date('2026-04-20T10:00:00.000Z'),
    })

    await updateAppSettings({ translationTargetLang: 'de' })

    expect(mocks.settingsTable.put).toHaveBeenCalledWith(expect.objectContaining({
      id: 4,
      appSettings: {
        speechifyApiKey: '',
        elevenLabsApiKey: '',
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
      },
    }))
  })

  it('desativa override de fonte quando o padrao usa a fonte original do livro', async () => {
    mocks.first.mockResolvedValue({
      id: 5,
      appSettings: {
        speechifyApiKey: '',
        elevenLabsApiKey: '',
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
    })
  })
})
