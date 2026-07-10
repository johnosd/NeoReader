import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { VocabItem } from '@/types/vocabulary'

const mocks = vi.hoisted(() => {
  const allToArray = vi.fn()
  const byBookToArray = vi.fn()
  return {
    add: vi.fn(),
    delete: vi.fn(),
    allToArray,
    byBookToArray,
    orderReverse: vi.fn(() => ({ toArray: allToArray })),
    whereEquals: vi.fn(() => ({ toArray: byBookToArray })),
    scheduleVocabularyDriveSync: vi.fn(),
  }
})

vi.mock('@/db/database', () => ({
  db: {
    vocabulary: {
      add: mocks.add,
      delete: mocks.delete,
      orderBy: vi.fn(() => ({ reverse: mocks.orderReverse })),
      where: vi.fn(() => ({ equals: mocks.whereEquals })),
    },
  },
}))

vi.mock('@/services/VocabularyDriveSyncService', () => ({
  scheduleVocabularyDriveSync: mocks.scheduleVocabularyDriveSync,
}))

import { getVocabItemsByBookId } from '@/db/vocabulary'

function makeItem(id: number, createdAt: string): VocabItem {
  return {
    id,
    bookId: 42,
    bookTitle: 'Livro',
    sourceText: `source-${id}`,
    translatedText: `translated-${id}`,
    sourceLang: 'en',
    targetLang: 'pt-BR',
    createdAt: new Date(createdAt),
  }
}

describe('vocabulary repository', () => {
  beforeEach(() => {
    mocks.byBookToArray.mockReset()
    mocks.orderReverse.mockClear()
    mocks.whereEquals.mockClear()
  })

  it('retorna itens de um livro do mais recente ao mais antigo', async () => {
    mocks.byBookToArray.mockResolvedValue([
      makeItem(1, '2026-01-01T00:00:00Z'),
      makeItem(2, '2026-03-01T00:00:00Z'),
      makeItem(3, '2026-02-01T00:00:00Z'),
    ])

    const items = await getVocabItemsByBookId(42)

    expect(mocks.whereEquals).toHaveBeenCalledWith(42)
    expect(items.map((item) => item.id)).toEqual([2, 3, 1])
  })
})
