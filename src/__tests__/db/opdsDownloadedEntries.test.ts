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

vi.mock('@/db/database', () => ({ db: { opdsDownloadedEntries: mocks.table } }))
vi.mock('@/db/books', () => ({ getBookById: mocks.getBookById }))

import { findDownloadedBookId, recordDownload } from '@/db/opdsDownloadedEntries'

describe('opdsDownloadedEntries', () => {
  beforeEach(() => {
    mocks.table.setRows([])
    mocks.getBookById.mockReset()
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
})
