import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  // Parâmetros tipados via genérico (e não nomeados na função) deixam `mock.calls` tipado sem
  // gerar "variável não usada" no lint.
  update: vi.fn<(id: number, changes: Record<string, unknown>) => Promise<number>>(async () => 1),
  transaction: vi.fn<(mode: string, table: unknown, task: () => Promise<void>) => Promise<void>>(
    async (_mode, _table, task) => task(),
  ),
}))

vi.mock('@/db/database', () => ({
  db: {
    books: { update: mocks.update },
    transaction: mocks.transaction,
  },
}))

import { setBooksCollection } from '@/db/collections'

describe('setBooksCollection (mover em lote)', () => {
  beforeEach(() => {
    mocks.update.mockClear()
    mocks.transaction.mockClear()
    vi.spyOn(Date, 'now').mockReturnValue(1_000)
  })

  it('grava a coleção em todos os livros, com collectionOrder crescente', async () => {
    await setBooksCollection([10, 20, 30], 7)

    expect(mocks.update.mock.calls).toEqual([
      [10, { collectionId: 7, collectionOrder: 1_000 }],
      [20, { collectionId: 7, collectionOrder: 1_001 }],
      [30, { collectionId: 7, collectionOrder: 1_002 }],
    ])
  })

  it('tudo numa única transação (ou todos mudam ou nenhum)', async () => {
    await setBooksCollection([1, 2], 7)

    expect(mocks.transaction).toHaveBeenCalledTimes(1)
  })

  it('com null ("Sem coleção") limpa collectionId e collectionOrder', async () => {
    await setBooksCollection([1, 2], null)

    expect(mocks.update.mock.calls).toEqual([
      [1, { collectionId: null, collectionOrder: undefined }],
      [2, { collectionId: null, collectionOrder: undefined }],
    ])
  })

  it('lista vazia não abre transação', async () => {
    await setBooksCollection([], 7)

    expect(mocks.transaction).not.toHaveBeenCalled()
    expect(mocks.update).not.toHaveBeenCalled()
  })
})
