import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { AuthorCacheRecord } from '@/types/author'

const mocks = vi.hoisted(() => {
  const rows = new Map<string, AuthorCacheRecord>()

  return {
    rows,
    authors: {
      get: vi.fn(async (authorName: string) => rows.get(authorName)),
      put: vi.fn(async (record: AuthorCacheRecord) => {
        rows.set(record.authorName, { ...record, bookIds: [...record.bookIds] })
        return record.authorName
      }),
      where: vi.fn(() => ({
        equals: vi.fn((bookId: number) => ({
          toArray: vi.fn(async () => (
            [...rows.values()]
              .filter((record) => record.bookIds.includes(bookId))
              .map((record) => ({ ...record, bookIds: [...record.bookIds] }))
          )),
        })),
      })),
    },
  }
})

vi.mock('@/db/database', () => ({
  db: {
    authors: mocks.authors,
  },
}))

import { getCachedAuthor, setCachedAuthor, unlinkBookFromAuthors } from '@/db/authors'

describe('author cache db helpers', () => {
  beforeEach(() => {
    mocks.rows.clear()
    mocks.authors.get.mockClear()
    mocks.authors.put.mockClear()
    mocks.authors.where.mockClear()
  })

  it('salva cache novo com o bookId relacionado', async () => {
    await setCachedAuthor('Robert C. Martin', {
      name: 'Robert C. Martin',
      otherBooks: [],
      videos: [],
    }, 10)

    expect(mocks.authors.put).toHaveBeenCalledWith(expect.objectContaining({
      authorName: 'Robert C. Martin',
      bookIds: [10],
    }))
  })

  it('adiciona o bookId ao cache existente sem duplicar', async () => {
    mocks.rows.set('Robert C. Martin', {
      authorName: 'Robert C. Martin',
      bookIds: [10],
      data: { name: 'Robert C. Martin', otherBooks: [], videos: [] },
      fetchedAt: new Date('2026-01-01T00:00:00.000Z'),
    })

    await expect(getCachedAuthor('Robert C. Martin', 10)).resolves.toEqual({
      name: 'Robert C. Martin',
      otherBooks: [],
      videos: [],
    })
    await getCachedAuthor('Robert C. Martin', 11)

    expect(mocks.rows.get('Robert C. Martin')?.bookIds).toEqual([10, 11])
  })

  it('mantem dados estaveis do autor mesmo com fetchedAt antigo', async () => {
    mocks.rows.set('Old Author', {
      authorName: 'Old Author',
      bookIds: [1],
      data: { name: 'Old Author', bio: 'Bio antiga', otherBooks: [], videos: [] },
      fetchedAt: new Date('2024-01-01T00:00:00.000Z'),
    })

    await expect(getCachedAuthor('Old Author', 1)).resolves.toEqual({
      name: 'Old Author',
      bio: 'Bio antiga',
      otherBooks: [],
      videos: [],
    })
  })

  it('normaliza cache legado sem bookIds', async () => {
    mocks.rows.set('Legacy Author', {
      authorName: 'Legacy Author',
      bookIds: undefined as unknown as number[],
      data: { name: 'Legacy Author', otherBooks: [], videos: [] },
      fetchedAt: new Date(),
    })

    await getCachedAuthor('Legacy Author', 7)

    expect(mocks.rows.get('Legacy Author')?.bookIds).toEqual([7])
    expect(mocks.rows.get('Legacy Author')?.videosFetchedAt).toBeNull()
  })

  it('remove o vínculo do livro sem apagar o cache do autor', async () => {
    mocks.rows.set('Autor', {
      authorName: 'Autor',
      bookIds: [42, 99],
      data: { name: 'Autor', otherBooks: [], videos: [] },
      fetchedAt: new Date(),
    })

    await unlinkBookFromAuthors(42)

    expect(mocks.rows.get('Autor')).toEqual(expect.objectContaining({
      authorName: 'Autor',
      bookIds: [99],
    }))
  })
})
