import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  add: vi.fn(async () => 11),
  get: vi.fn(async () => ({ id: 7, bookId: 42 })),
  update: vi.fn(async () => undefined),
  scheduleBookmarkDriveSync: vi.fn(),
}))

vi.mock('@/db/database', () => ({
  db: {
    bookmarks: {
      add: mocks.add,
      get: mocks.get,
      update: mocks.update,
    },
  },
}))

vi.mock('@/services/BookmarkDriveSyncService', () => ({
  scheduleBookmarkDriveSync: mocks.scheduleBookmarkDriveSync,
}))

import {
  addBookmark,
  restoreBookmark,
  softDeleteBookmark,
  updateBookmarkColor,
} from '@/db/bookmarks'
import { createBookmarkSyncKey } from '@/services/BookmarkDriveSyncModel'
import { FeatureQuotaService } from '@/services/FeatureQuotaService'

describe('bookmarks repository', () => {
  beforeEach(() => {
    mocks.add.mockClear()
    mocks.get.mockClear()
    mocks.update.mockClear()
    mocks.scheduleBookmarkDriveSync.mockClear()
    FeatureQuotaService.reset()
  })

  it('cria bookmark com syncKey deterministico e status pendente', async () => {
    const cfi = 'epubcfi(/6/8!/4/2/10/2,/1:0,/1:20)'

    await expect(addBookmark(42, cfi, 'Chapter 1', 32, {
      snippet: 'Saved text',
      color: 'indigo',
    })).resolves.toBe(11)

    expect(mocks.add).toHaveBeenCalledWith(expect.objectContaining({
      bookId: 42,
      cfi,
      label: 'Chapter 1',
      percentage: 32,
      snippet: 'Saved text',
      color: 'indigo',
      syncKey: createBookmarkSyncKey(cfi),
      syncedAt: null,
      syncError: null,
      deletedAt: null,
    }))
    expect(mocks.scheduleBookmarkDriveSync).toHaveBeenCalledWith(42)
  })

  it('mantem bookmark local gratuito sem consumir quotas Pro', async () => {
    await addBookmark(42, 'epubcfi(/6/10!/4/2/1:0)', 'Chapter Free', 12, {
      snippet: 'Free local bookmark',
      color: 'emerald',
    })

    expect(FeatureQuotaService.getSnapshot('book-intelligence', { isPro: false }).used).toBe(0)
    expect(FeatureQuotaService.getSnapshot('nyt-discovery', { isPro: false }).used).toBe(0)
    expect(mocks.scheduleBookmarkDriveSync).toHaveBeenCalledWith(42)
  })

  it('marca restauracao como pendente de sync', async () => {
    await restoreBookmark(7, { label: 'Chapter 2' })

    expect(mocks.update).toHaveBeenCalledWith(7, expect.objectContaining({
      label: 'Chapter 2',
      syncedAt: null,
      syncError: null,
      deletedAt: null,
    }))
    expect(mocks.scheduleBookmarkDriveSync).toHaveBeenCalledWith(42)
  })

  it('marca soft delete como pendente de sync', async () => {
    await softDeleteBookmark(7)

    expect(mocks.update).toHaveBeenCalledWith(7, expect.objectContaining({
      syncedAt: null,
      syncError: null,
    }))
    expect(mocks.scheduleBookmarkDriveSync).toHaveBeenCalledWith(42)
  })

  it('marca mudanca de cor como pendente de sync', async () => {
    await updateBookmarkColor(7, 'rose')

    expect(mocks.update).toHaveBeenCalledWith(7, expect.objectContaining({
      color: 'rose',
      syncedAt: null,
      syncError: null,
    }))
    expect(mocks.scheduleBookmarkDriveSync).toHaveBeenCalledWith(42)
  })
})
