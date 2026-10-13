import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => {
  // Tipos explícitos: a implementação ignora os argumentos, mas as asserções precisam deles.
  const modify = vi.fn<(changes: Record<string, unknown>) => Promise<number>>(async () => 0)
  return {
    get: vi.fn(),
    put: vi.fn(async () => 1),
    del: vi.fn(async () => undefined),
    update: vi.fn(async () => 1),
    modify,
    filter: vi.fn<(predicate: (book: { isProtected?: boolean }) => boolean) => { modify: typeof modify }>(
      () => ({ modify }),
    ),
  }
})

vi.mock('@/db/database', () => ({
  db: {
    bookProtection: { get: mocks.get, put: mocks.put, delete: mocks.del },
    books: { update: mocks.update, filter: mocks.filter },
  },
}))

import { clearBookProtection, getBookProtection, saveBookProtection } from '@/db/bookProtection'
import { clearAllBooksProtected, setBookProtected } from '@/db/books'
import { BOOK_PROTECTION_ID, type BookProtectionRecord } from '@/types/bookProtection'

const RECORD: BookProtectionRecord = {
  id: BOOK_PROTECTION_ID,
  pinHash: 'h',
  salt: 's',
  iterations: 1,
  failedAttempts: 0,
  lockRound: 0,
  lockedUntil: 0,
  createdAt: new Date(0),
  updatedAt: new Date(0),
}

describe('db/bookProtection', () => {
  beforeEach(() => {
    mocks.get.mockReset()
    mocks.put.mockClear()
    mocks.del.mockClear()
    mocks.update.mockClear()
    mocks.modify.mockClear()
    mocks.filter.mockClear()
  })

  it('getBookProtection lê o singleton de id 1', async () => {
    mocks.get.mockResolvedValue(RECORD)
    await expect(getBookProtection()).resolves.toBe(RECORD)
    expect(mocks.get).toHaveBeenCalledWith(1)
  })

  it('saveBookProtection grava sempre com id 1', async () => {
    await saveBookProtection(RECORD)
    expect(mocks.put).toHaveBeenCalledWith(expect.objectContaining({ id: 1, pinHash: 'h' }))
  })

  it('clearBookProtection apaga o singleton', async () => {
    await clearBookProtection()
    expect(mocks.del).toHaveBeenCalledWith(1)
  })

  it('setBookProtected atualiza só o campo do livro', async () => {
    await setBookProtected(7, true)
    expect(mocks.update).toHaveBeenCalledWith(7, { isProtected: true })
  })

  it('clearAllBooksProtected só toca os livros que estavam protegidos', async () => {
    await clearAllBooksProtected()
    const predicate = mocks.filter.mock.calls[0][0]
    expect(predicate({ isProtected: true })).toBe(true)
    expect(predicate({ isProtected: false })).toBe(false)
    expect(predicate({})).toBe(false)
    expect(mocks.modify).toHaveBeenCalledWith({ isProtected: false })
  })
})
