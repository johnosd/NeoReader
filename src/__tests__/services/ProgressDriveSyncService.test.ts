import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ReadingProgress } from '@/types/book'

// R02 (sdd/bugs/progresso-no-drive-nao-restaurado-pelo): restauração do
// progresso remoto antes da abertura, com prazo e LWW por updatedAt.
const mocks = vi.hoisted(() => {
  const state: { local: ReadingProgress | undefined } = { local: undefined }
  return {
    state,
    booksGet: vi.fn(async () => ({ id: 7, fileHash: 'A'.repeat(64) })),
    progressPut: vi.fn(async (record: ReadingProgress) => { state.local = record }),
    progressAdd: vi.fn(async (record: ReadingProgress) => { state.local = record }),
  }
})

vi.mock('@/db/database', () => ({
  db: {
    books: { get: mocks.booksGet },
    progress: {
      where: () => ({ equals: () => ({ first: async () => mocks.state.local }) }),
      put: mocks.progressPut,
      add: mocks.progressAdd,
    },
  },
}))
vi.mock('@/services/BillingService', () => ({ BillingService: {
  waitForEntitlements: async () => undefined,
  getCachedStatus: () => ({ isPro: true }),
}}))

import {
  progressSyncStatusStore,
  restoreBookProgressBeforeOpen,
} from '@/services/ProgressDriveSyncService'

const HASH = 'a'.repeat(64)
const PRO = { isPro: () => true }

function remoteAt(updatedAt: string, cfi = 'epubcfi(/6/20!/4/2/1:0)') {
  return { schemaVersion: 1, bookFileHash: HASH, cfi, percentage: 70, fraction: 0.7, updatedAt }
}

function driveWith(remote: unknown) {
  return {
    list: vi.fn(async () => [{ id: 'file-1', name: 'progress' }]),
    getJson: vi.fn(async () => remote) as never,
    createJson: vi.fn() as never,
    updateJson: vi.fn() as never,
  }
}

describe('restoreBookProgressBeforeOpen', () => {
  beforeEach(() => {
    mocks.state.local = undefined
    mocks.progressPut.mockClear()
    mocks.progressAdd.mockClear()
    progressSyncStatusStore.set('connected')
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  it('aplica a posição remota quando não há progresso local', async () => {
    const result = await restoreBookProgressBeforeOpen(7, { ...PRO, driveClient: driveWith(remoteAt('2026-10-01T00:00:00Z')) })

    expect(result).toEqual({ restored: true })
    expect(mocks.state.local).toMatchObject({ bookId: 7, cfi: 'epubcfi(/6/20!/4/2/1:0)', fraction: 0.7 })
    // Guarda o timestamp remoto: a próxima publicação não vira "mais nova" à toa.
    expect(mocks.state.local?.updatedAt).toEqual(new Date('2026-10-01T00:00:00Z'))
  })

  it('posição local mais recente vence', async () => {
    mocks.state.local = { id: 1, bookId: 7, cfi: 'epubcfi(/6/30!/4/2/1:0)', percentage: 90, updatedAt: new Date('2026-10-05T00:00:00Z') }

    const result = await restoreBookProgressBeforeOpen(7, { ...PRO, driveClient: driveWith(remoteAt('2026-10-01T00:00:00Z')) })

    expect(result).toEqual({ restored: false })
    expect(mocks.progressPut).not.toHaveBeenCalled()
    expect(mocks.state.local?.cfi).toBe('epubcfi(/6/30!/4/2/1:0)')
  })

  it('remoto mais recente substitui o local', async () => {
    mocks.state.local = { id: 1, bookId: 7, cfi: 'epubcfi(/6/2!/4/2/1:0)', percentage: 0, updatedAt: new Date('2026-09-01T00:00:00Z') }

    const result = await restoreBookProgressBeforeOpen(7, { ...PRO, driveClient: driveWith(remoteAt('2026-10-01T00:00:00Z')) })

    expect(result).toEqual({ restored: true })
    expect(mocks.progressPut).toHaveBeenCalledWith(expect.objectContaining({ id: 1, cfi: 'epubcfi(/6/20!/4/2/1:0)' }))
  })

  it('respeita o prazo quando o Drive não responde (offline/rede lenta)', async () => {
    vi.useFakeTimers()
    const drive = driveWith(null)
    drive.list = vi.fn(() => new Promise<never>(() => undefined))

    const pending = restoreBookProgressBeforeOpen(7, { ...PRO, driveClient: drive, timeoutMs: 1000 })
    await vi.advanceTimersByTimeAsync(1000)

    await expect(pending).resolves.toEqual({ restored: false })
  })

  it('erro inesperado não lança', async () => {
    mocks.booksGet.mockRejectedValueOnce(new Error('db closed'))

    await expect(restoreBookProgressBeforeOpen(7, { ...PRO, driveClient: driveWith(null) })).resolves.toEqual({ restored: false })
  })

  it('não tenta sem token válido (permission-error)', async () => {
    progressSyncStatusStore.set('permission-error')
    const drive = driveWith(remoteAt('2026-10-01T00:00:00Z'))

    const result = await restoreBookProgressBeforeOpen(7, { ...PRO, driveClient: drive })

    expect(result).toEqual({ restored: false })
    expect(drive.list).not.toHaveBeenCalled()
  })
})
