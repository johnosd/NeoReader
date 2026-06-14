import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => {
  const translationsEqualsResult = {
    first: vi.fn(),
    delete: vi.fn(),
  }
  const translationsWhereResult = {
    equals: vi.fn(() => translationsEqualsResult),
  }
  const ttsBelowResult = {
    delete: vi.fn(),
  }
  const ttsWhereResult = {
    below: vi.fn(() => ttsBelowResult),
  }

  return {
    translationsEqualsResult,
    translationsWhereResult,
    ttsBelowResult,
    ttsWhereResult,
    db: {
      translations: {
        where: vi.fn(() => translationsWhereResult),
        delete: vi.fn(),
        put: vi.fn(),
        add: vi.fn(),
      },
      ttsVoiceCaches: {
        where: vi.fn(() => ttsWhereResult),
      },
    },
  }
})

vi.mock('@/db/database', () => ({
  db: mocks.db,
}))

import { cleanupExpiredTtsVoiceCaches } from '@/db/ttsVoiceCaches'
import { getCachedTranslation, setCachedTranslation } from '@/db/translations'

describe('cache expiry helpers', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-06-14T12:00:00.000Z'))
    vi.clearAllMocks()
    mocks.translationsEqualsResult.first.mockResolvedValue(undefined)
    mocks.translationsEqualsResult.delete.mockResolvedValue(0)
    mocks.db.translations.delete.mockResolvedValue(undefined)
    mocks.db.translations.put.mockResolvedValue(1)
    mocks.db.translations.add.mockResolvedValue(1)
    mocks.ttsBelowResult.delete.mockResolvedValue(2)
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('descarta traducao expirada ao ler do cache', async () => {
    mocks.translationsEqualsResult.first.mockResolvedValue({
      id: 7,
      textHash: 123,
      sourceText: 'Hello',
      translatedText: 'Ola',
      sourceLang: 'en',
      targetLang: 'pt-BR',
      createdAt: new Date('2026-05-01T12:00:00.000Z'),
    })

    await expect(getCachedTranslation(123, 30 * 24 * 60 * 60 * 1000)).resolves.toBeUndefined()

    expect(mocks.db.translations.delete).toHaveBeenCalledWith(7)
  })

  it('atualiza traducao existente em vez de criar duplicata simples', async () => {
    mocks.translationsEqualsResult.first.mockResolvedValue({
      id: 9,
      textHash: 123,
      sourceText: 'Old',
      translatedText: 'Antigo',
      sourceLang: 'en',
      targetLang: 'pt-BR',
      createdAt: new Date(),
    })

    await setCachedTranslation({
      textHash: 123,
      sourceText: 'Hello',
      translatedText: 'Ola',
      sourceLang: 'en',
      targetLang: 'pt-BR',
      createdAt: new Date(),
    })

    expect(mocks.db.translations.put).toHaveBeenCalledWith(expect.objectContaining({ id: 9, translatedText: 'Ola' }))
    expect(mocks.db.translations.add).not.toHaveBeenCalled()
  })

  it('remove caches de voz TTS mais antigos que a idade maxima', async () => {
    await expect(cleanupExpiredTtsVoiceCaches(24 * 60 * 60 * 1000)).resolves.toBe(2)

    expect(mocks.db.ttsVoiceCaches.where).toHaveBeenCalledWith('updatedAt')
    expect(mocks.ttsWhereResult.below).toHaveBeenCalledWith(new Date('2026-06-13T12:00:00.000Z'))
    expect(mocks.ttsBelowResult.delete).toHaveBeenCalledOnce()
  })
})
