import 'fake-indexeddb/auto'
import Dexie from 'dexie'
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { zipSync } from 'fflate'

const mocks = vi.hoisted(() => ({
  deleteFile: vi.fn(async () => true),
  request: vi.fn(),
  credential: { username: 'synthetic-user', password: 'synthetic-password' },
}))
vi.mock('@/services/BillingService', () => ({ BillingService: {
  waitForEntitlements: async () => undefined,
  waitForInit: async () => undefined,
  getCachedStatus: () => ({ isPro: true }),
}}))
vi.mock('@/services/NativeLibraryImportService', () => ({ deleteLocalBookFile: mocks.deleteFile }))
vi.mock('@/services/opds/OpdsCredentialStore', () => ({ OpdsCredentialStore: {
  get: async () => mocks.credential,
}}))
vi.mock('@capacitor/core', async (original) => {
  const actual = await original<typeof import('@capacitor/core')>()
  return { ...actual, Capacitor: { ...actual.Capacitor, isNativePlatform: () => true },
    CapacitorHttp: { request: mocks.request } }
})
vi.mock('@capacitor/preferences', () => ({ Preferences: {
  get: async ({ key }: { key: string }) => ({ value: key.endsWith('speechifyApiKey') ? 'synthetic-account-A-key' : '' }),
  set: async () => undefined,
}}))

import { db } from '@/db/database'
import { addBook, deleteBook } from '@/db/books'
import { recordDownload, findDownloadedBookId } from '@/db/opdsDownloadedEntries'
import { syncVocabulary } from '@/services/VocabularyDriveSyncService'
import { syncBookBookmarks } from '@/services/BookmarkDriveSyncService'
import { OpdsCatalogService } from '@/services/opds/OpdsCatalogService'
import { EpubService } from '@/services/EpubService'
import { getSettings } from '@/db/settings'

// These probes assert the observed faulty behavior. Passing is evidence of a bug,
// not a regression gate for a future fix. All data and credentials are synthetic.
describe('Review probes: persistence and network boundaries', () => {
  beforeEach(async () => {
    await db.open()
    await Promise.all(db.tables.map((table) => table.clear()))
    mocks.deleteFile.mockClear()
    mocks.request.mockReset()
  })
  afterAll(async () => { db.close(); await db.delete() })

  it('R01: an empty local vocabulary overwrites an existing remote vocabulary without reading it', async () => {
    let remote: unknown = { items: [{ sourceText: 'remote-only-term' }] }
    const getJson = vi.fn(async () => remote)
    await syncVocabulary({ isPro: () => true, driveClient: {
      list: async () => [{ id: 'remote-vocabulary', name: 'neoreader-vocabulary-v1.json' }],
      getJson,
      updateJson: async (id, data) => { remote = data; return { id, name: 'vocabulary' } },
      createJson: async (name) => ({ id: 'created', name }),
    } })
    expect(remote).toMatchObject({ items: [] })
    expect(getJson).not.toHaveBeenCalled()
  })

  it('R03: uploading bookmarks replaces remote-only bookmarks with the local snapshot', async () => {
    const bookId = await addBook({ title: 'Synthetic', author: 'Author', fileHash: 'a'.repeat(64), addedAt: new Date(), lastOpenedAt: null })
    await db.bookmarks.add({ bookId, cfi: 'epubcfi(/6/2!/4/2:0)', label: 'local', percentage: 10, createdAt: new Date(), deletedAt: null })
    let remote: unknown = { bookmarks: [{ label: 'remote-only' }] }
    await syncBookBookmarks(bookId, { isPro: () => true, driveClient: {
      list: async () => [{ id: 'remote-bookmarks', name: 'bookmarks' }],
      updateJson: async (id, data) => { remote = data; return { id, name: 'bookmarks' } },
      createJson: async (name) => ({ id: 'created', name }),
    } })
    expect(remote).toMatchObject({ bookmarks: [{ label: 'local' }] })
    expect(JSON.stringify(remote)).not.toContain('remote-only')
  })

  it('R04: deleting a local book calls native deletion while another account still references its URI', async () => {
    const uri = 'file:///data/user/0/com.johnny.neoreader/files/books/shared-hash.epub'
    const otherAccount = new Dexie('ReviewSyntheticAccountB')
    otherAccount.version(1).stores({ books: '++id, uri' })
    await otherAccount.table('books').add({ uri })
    try {
      const id = await addBook({ title: 'Shared', author: 'Author', storageMode: 'local', uri, addedAt: new Date(), lastOpenedAt: null })
      await deleteBook(id)
      expect(await otherAccount.table('books').count()).toBe(1)
      expect(mocks.deleteFile).toHaveBeenCalledWith(uri)
    } finally { otherAccount.close(); await otherAccount.delete() }
  })

  it('R06: downloading the same OPDS entry after book deletion hits the unique index', async () => {
    const firstId = await addBook({ title: 'First', author: 'Author', addedAt: new Date(), lastOpenedAt: null })
    await recordDownload(5, 'same-entry', firstId)
    await deleteBook(firstId)
    expect(await findDownloadedBookId(5, 'same-entry')).toBeNull()
    const secondId = await addBook({ title: 'Second', author: 'Author', addedAt: new Date(), lastOpenedAt: null })
    await expect(recordDownload(5, 'same-entry', secondId)).rejects.toMatchObject({ name: 'ConstraintError' })
  })

  it('R07: catalog credentials are sent to a feed link on another origin', async () => {
    mocks.request.mockResolvedValue({ status: 200, headers: { 'content-type': 'application/opds+json' }, data: '{"metadata":{"title":"Synthetic"},"publications":[]}' })
    await OpdsCatalogService.fetchPage({ id: 5, name: 'Private', baseUrl: 'https://private.example/opds', hasCredential: true, isDefault: false, createdAt: new Date(), updatedAt: new Date() }, 'https://external.example/feed')
    expect(mocks.request).toHaveBeenCalledWith(expect.objectContaining({
      url: 'https://external.example/feed',
      headers: expect.objectContaining({ Authorization: `Basic ${btoa('synthetic-user:synthetic-password')}` }),
    }))
  })

  it('R11: decompressed packages remain retained for every visited book', async () => {
    const cache = (EpubService as unknown as { packageCache: Map<number, Promise<{ files: Record<string, Uint8Array> }>> }).packageCache
    cache.clear()
    let inputBytes = 0
    for (let id = 100; id < 108; id++) {
      const zip = zipSync({ 'synthetic-image.bin': new Uint8Array(1024 * 1024).fill(65) })
      inputBytes += zip.byteLength
      const arrayBuffer = zip.buffer.slice(zip.byteOffset, zip.byteOffset + zip.byteLength) as ArrayBuffer
      await EpubService.getEpubPackage({ arrayBuffer: async () => arrayBuffer } as Blob, id)
    }
    let retainedBytes = 0
    for (const pkg of cache.values()) for (const data of Object.values((await pkg).files)) retainedBytes += data.byteLength
    expect(cache.size).toBe(8)
    expect(retainedBytes).toBe(8 * 1024 * 1024)
    console.info('REVIEW_PACKAGE_CACHE', JSON.stringify({ packages: cache.size, inputBytes, retainedBytes }))
    cache.clear()
  })

  it('R12: a different account with empty settings restores the unscoped API key backup', async () => {
    expect(await db.settings.count()).toBe(0)
    const settings = await getSettings()
    expect(settings.appSettings.speechifyApiKey).toBe('synthetic-account-A-key')
  })
})

