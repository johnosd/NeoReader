import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { BookSettings } from '@/types/book'

const mocks = vi.hoisted(() => {
  let rows: BookSettings[] = []
  let nextId = 100

  const table = {
    where: vi.fn((field: string) => ({
      equals: vi.fn((bookId: number) => ({
        toArray: vi.fn(async () => (
          field === 'bookId'
            ? rows.filter((row) => row.bookId === bookId).map((row) => ({ ...row }))
            : []
        )),
      })),
    })),
    update: vi.fn(async (id: number, patch: Partial<BookSettings>) => {
      const row = rows.find((candidate) => candidate.id === id)
      if (!row) return 0
      Object.assign(row, patch)
      return 1
    }),
    add: vi.fn(async (row: BookSettings) => {
      const id = row.id ?? nextId++
      rows.push({ ...row, id })
      return id
    }),
    bulkDelete: vi.fn(async (ids: number[]) => {
      rows = rows.filter((row) => row.id === undefined || !ids.includes(row.id))
    }),
    getRows: () => rows,
    setRows: (nextRows: BookSettings[]) => {
      rows = nextRows.map((row) => ({ ...row }))
      nextId = 100
    },
  }

  return {
    table,
    transaction: vi.fn(async (_mode: string, _table: unknown, task: () => Promise<void>) => task()),
  }
})

vi.mock('@/db/database', () => ({
  db: {
    bookSettings: mocks.table,
    transaction: mocks.transaction,
  },
}))

import { getBookSettings, updateBookSettings } from '@/db/bookSettings'

describe('book settings db helpers', () => {
  beforeEach(() => {
    mocks.table.setRows([])
    mocks.table.where.mockClear()
    mocks.table.update.mockClear()
    mocks.table.add.mockClear()
    mocks.table.bulkDelete.mockClear()
    mocks.transaction.mockClear()
  })

  it('mescla e compacta configuracoes duplicadas do mesmo livro', async () => {
    mocks.table.setRows([
      {
        id: 1,
        bookId: 10,
        fontSize: 'lg',
        readerTheme: 'dark',
        updatedAt: new Date('2026-04-20T10:00:00.000Z'),
      },
      {
        id: 2,
        bookId: 10,
        readerTheme: 'paper',
        overrideBookColors: true,
        updatedAt: new Date('2026-04-20T10:01:00.000Z'),
      },
      {
        id: 3,
        bookId: 11,
        readerTheme: 'warm',
      },
    ])

    const settings = await getBookSettings(10)

    expect(settings).toEqual(expect.objectContaining({
      id: 1,
      bookId: 10,
      fontSize: 'lg',
      readerTheme: 'paper',
      overrideBookColors: true,
    }))
    expect(mocks.table.update).toHaveBeenCalledWith(1, expect.objectContaining({
      bookId: 10,
      fontSize: 'lg',
      readerTheme: 'paper',
      overrideBookColors: true,
    }))
    expect(mocks.table.bulkDelete).toHaveBeenCalledWith([2])
    expect(mocks.table.getRows().filter((row) => row.bookId === 10)).toHaveLength(1)
  })

  it('atualiza uma linha unica preservando preferencias anteriores', async () => {
    mocks.table.setRows([
      {
        id: 1,
        bookId: 10,
        fontSize: 'xl',
        lineHeight: 'relaxed',
        readerTheme: 'dark',
      },
    ])

    await updateBookSettings(10, { readerTheme: 'paper', overrideBookColors: true })

    expect(mocks.transaction).toHaveBeenCalled()
    expect(mocks.table.add).not.toHaveBeenCalled()
    expect(mocks.table.update).toHaveBeenCalledWith(1, expect.objectContaining({
      bookId: 10,
      fontSize: 'xl',
      lineHeight: 'relaxed',
      readerTheme: 'paper',
      overrideBookColors: true,
      updatedAt: expect.any(Date),
    }))
  })

  it('cria configuracao quando o livro ainda nao tem preferencia propria', async () => {
    await updateBookSettings(10, { readerTheme: 'paper', overrideBookColors: true })

    expect(mocks.table.add).toHaveBeenCalledWith(expect.objectContaining({
      bookId: 10,
      readerTheme: 'paper',
      overrideBookColors: true,
      updatedAt: expect.any(Date),
    }))
  })
})
