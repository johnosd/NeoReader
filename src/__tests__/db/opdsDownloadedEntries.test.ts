import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Book } from '@/types/book'
import type { OpdsDownloadedEntry } from '@/types/opds'

const mocks = vi.hoisted(() => {
  let rows: OpdsDownloadedEntry[] = []
  let nextId = 1

  const table = {
    add: vi.fn(async (row: OpdsDownloadedEntry) => {
      const id = nextId++
      rows.push({ ...row, id })
      return id
    }),
    update: vi.fn(async (id: number, changes: Partial<OpdsDownloadedEntry>) => {
      const row = rows.find((candidate) => candidate.id === id)
      if (row) Object.assign(row, changes)
      return row ? 1 : 0
    }),
    count: () => rows.length,
    where: vi.fn((index: string) => ({
      equals: vi.fn((key: [number, string]) => ({
        first: vi.fn(async () => (
          index === '[catalogId+entryId]'
            ? rows.find((row) => row.catalogId === key[0] && row.entryId === key[1])
            : undefined
        )),
      })),
    })),
    setRows(next: OpdsDownloadedEntry[]) {
      rows = next.map((row) => ({ ...row }))
      nextId = 1
    },
  }

  return { table, getBookById: vi.fn() }
})

vi.mock('@/db/database', () => ({
  db: {
    opdsDownloadedEntries: mocks.table,
    transaction: vi.fn(async (_mode: string, _table: unknown, task: () => Promise<void>) => task()),
  },
}))
vi.mock('@/db/books', () => ({ getBookById: mocks.getBookById }))

import { findDownloadedBookId, recordDownload } from '@/db/opdsDownloadedEntries'

describe('opdsDownloadedEntries', () => {
  beforeEach(() => {
    mocks.table.setRows([])
    mocks.getBookById.mockReset()
    mocks.table.add.mockClear()
  })

  it('grava e encontra o vínculo entry -> livro', async () => {
    mocks.getBookById.mockResolvedValue({ id: 42 } as Book)
    await recordDownload(1, 'entry-a', 42)

    const bookId = await findDownloadedBookId(1, 'entry-a')
    expect(bookId).toBe(42)
  })

  it('devolve null se não existe vínculo pra esse catálogo+entry', async () => {
    const bookId = await findDownloadedBookId(1, 'entry-desconhecida')
    expect(bookId).toBeNull()
  })

  it('reconcilia como não baixado se o Book foi removido da Biblioteca depois', async () => {
    mocks.getBookById.mockResolvedValue(undefined)
    await recordDownload(1, 'entry-a', 42)

    const bookId = await findDownloadedBookId(1, 'entry-a')
    expect(bookId).toBeNull()
  })

  it('distingue catálogos diferentes com o mesmo entryId bruto', async () => {
    mocks.getBookById.mockResolvedValue({ id: 1 } as Book)
    await recordDownload(1, 'same-id', 1)

    const bookIdOutroCatalogo = await findDownloadedBookId(2, 'same-id')
    expect(bookIdOutroCatalogo).toBeNull()
  })

  // R06: re-download depois de excluir o livro (ou vínculo órfão antigo) não
  // pode estourar o índice único — atualiza o bookId em vez de duplicar.
  it('registrar de novo a mesma entry atualiza o vínculo em vez de duplicar', async () => {
    mocks.getBookById.mockResolvedValue({ id: 43 } as Book)
    await recordDownload(1, 'entry-a', 42)
    await recordDownload(1, 'entry-a', 43)

    expect(mocks.table.count()).toBe(1)
    expect(mocks.table.add).toHaveBeenCalledTimes(1)
    expect(await findDownloadedBookId(1, 'entry-a')).toBe(43)
  })
})
