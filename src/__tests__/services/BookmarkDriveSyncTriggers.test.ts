import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Bookmark } from '@/types/book'

// Feature 021: gatilhos de retry (cold start/resume/online), consentimento
// adiado pro "abrir o app" e o guard de permission-error. Arquivo separado do
// BookmarkDriveSyncService.test.ts porque precisa mockar Billing/Auth/App.

const mocks = vi.hoisted(() => {
  const state = {
    pendingBookmarks: [] as Array<Pick<Bookmark, 'bookId' | 'syncedAt'>>,
    appStateCallback: null as ((state: { isActive: boolean }) => void) | null,
  }
  return {
    state,
    booksGet: vi.fn(async () => undefined),
    bookmarksFilter: vi.fn((predicate: (bookmark: Pick<Bookmark, 'syncedAt'>) => boolean) => ({
      toArray: vi.fn(async () => state.pendingBookmarks.filter(predicate)),
    })),
    appStateRemove: vi.fn(async () => undefined),
    addListener: vi.fn(async (_event: string, callback: (state: { isActive: boolean }) => void) => {
      state.appStateCallback = callback
      return { remove: mocks.appStateRemove }
    }),
    waitForEntitlements: vi.fn(async () => ({ isPro: true })),
    getCachedStatus: vi.fn(() => ({ isPro: true as boolean | null })),
    isDriveConsentRequired: vi.fn(() => false),
    refreshDriveToken: vi.fn(async () => 'refreshed' as string),
  }
})

vi.mock('@/db/database', () => ({
  db: {
    books: { get: mocks.booksGet },
    bookmarks: {
      filter: mocks.bookmarksFilter,
      where: vi.fn(() => ({ equals: vi.fn(() => ({ toArray: vi.fn(async () => []) })) })),
      get: vi.fn(async () => undefined),
      update: vi.fn(async () => undefined),
    },
  },
}))

vi.mock('@capacitor/app', () => ({
  App: { addListener: mocks.addListener },
}))

vi.mock('@/services/BillingService', () => ({
  BillingService: {
    waitForEntitlements: mocks.waitForEntitlements,
    getCachedStatus: mocks.getCachedStatus,
  },
}))

vi.mock('@/services/FirebaseAuthService', () => ({
  GOOGLE_DRIVE_APPDATA_SCOPE: 'drive.appdata',
  getGoogleDriveAccessToken: vi.fn(() => null),
  renewDriveTokenSilently: vi.fn(async () => null),
  isDriveConsentRequired: mocks.isDriveConsentRequired,
  refreshDriveToken: mocks.refreshDriveToken,
}))

vi.mock('@/services/DiagnosticsLogger', () => ({
  createFlowId: vi.fn(() => 'flow'),
  getDiagnosticsNowMs: vi.fn(() => 0),
  logEvent: vi.fn(),
  logWarn: vi.fn(),
}))

import {
  initBookmarkSyncTriggers,
  retryPendingBookmarkSyncs,
  scheduleBookmarkDriveSync,
} from '@/services/BookmarkDriveSyncService'
import {
  getCachedBookmarkDriveSyncStatus,
  setBookmarkDriveSyncStatus,
} from '@/services/BookmarkDriveSyncStatus'

// Deixa os syncs agendados (fire-and-forget) terminarem, pra não vazarem
// estado de "em voo" pro próximo teste.
async function flushAsync() {
  for (let i = 0; i < 10; i += 1) await new Promise((resolve) => setTimeout(resolve, 0))
}

// syncBookBookmarks começa com db.books.get(bookId): é o sinal de que o sync
// daquele livro foi de fato agendado.
function scheduledBookIds(): number[] {
  return mocks.booksGet.mock.calls.map((call) => (call as unknown[])[0] as number)
}

describe('BookmarkDriveSync — gatilhos e consentimento (feature 021)', () => {
  beforeEach(async () => {
    await flushAsync()
    vi.clearAllMocks()
    mocks.state.pendingBookmarks = []
    mocks.state.appStateCallback = null
    mocks.getCachedStatus.mockReturnValue({ isPro: true })
    mocks.isDriveConsentRequired.mockReturnValue(false)
    mocks.refreshDriveToken.mockResolvedValue('refreshed')
    setBookmarkDriveSyncStatus('connected')
  })

  it('retry agenda sync so dos livros com bookmark pendente, uma vez por livro', async () => {
    mocks.state.pendingBookmarks = [
      { bookId: 1, syncedAt: null },
      { bookId: 1, syncedAt: null },
      { bookId: 2, syncedAt: new Date() },
      { bookId: 3, syncedAt: null },
    ]

    await retryPendingBookmarkSyncs()

    expect(scheduledBookIds().sort()).toEqual([1, 3])
    await flushAsync()
  })

  it('retry nao faz nada para usuario sem Pro', async () => {
    mocks.getCachedStatus.mockReturnValue({ isPro: false })
    mocks.state.pendingBookmarks = [{ bookId: 1, syncedAt: null }]

    await retryPendingBookmarkSyncs()

    expect(mocks.bookmarksFilter).not.toHaveBeenCalled()
    expect(mocks.booksGet).not.toHaveBeenCalled()
  })

  it('com consentimento pendente, pede o login respeitando o cooldown (userInitiated: false) e so entao sincroniza', async () => {
    mocks.isDriveConsentRequired.mockReturnValue(true)
    setBookmarkDriveSyncStatus('permission-error')
    mocks.state.pendingBookmarks = [{ bookId: 4, syncedAt: null }]

    await retryPendingBookmarkSyncs()

    expect(mocks.refreshDriveToken).toHaveBeenCalledWith({ userInitiated: false })
    expect(scheduledBookIds()).toEqual([4])
    await flushAsync()
  })

  it('com consentimento pendente e login cancelado/bloqueado, nao tenta sincronizar', async () => {
    mocks.isDriveConsentRequired.mockReturnValue(true)
    mocks.refreshDriveToken.mockResolvedValue('rate-limited')
    setBookmarkDriveSyncStatus('permission-error')
    mocks.state.pendingBookmarks = [{ bookId: 5, syncedAt: null }]

    await retryPendingBookmarkSyncs()

    expect(mocks.booksGet).not.toHaveBeenCalled()
    expect(getCachedBookmarkDriveSyncStatus().code).toBe('permission-error')
  })

  it('sem consentimento pendente, nunca abre a tela do Google', async () => {
    mocks.state.pendingBookmarks = [{ bookId: 6, syncedAt: null }]

    await retryPendingBookmarkSyncs()

    expect(mocks.refreshDriveToken).not.toHaveBeenCalled()
    await flushAsync()
  })

  it('initBookmarkSyncTriggers roda no cold start, no resume e quando a rede volta — nao ao ir pra background', async () => {
    mocks.state.pendingBookmarks = [{ bookId: 7, syncedAt: null }]

    const dispose = initBookmarkSyncTriggers()
    await flushAsync()
    expect(mocks.bookmarksFilter).toHaveBeenCalledTimes(1) // cold start

    mocks.state.appStateCallback?.({ isActive: false })
    await flushAsync()
    expect(mocks.bookmarksFilter).toHaveBeenCalledTimes(1)

    mocks.state.appStateCallback?.({ isActive: true })
    await flushAsync()
    expect(mocks.bookmarksFilter).toHaveBeenCalledTimes(2)

    window.dispatchEvent(new Event('online'))
    await flushAsync()
    expect(mocks.bookmarksFilter).toHaveBeenCalledTimes(3)

    dispose()
    await flushAsync()
    expect(mocks.appStateRemove).toHaveBeenCalledOnce()

    window.dispatchEvent(new Event('online'))
    mocks.state.appStateCallback?.({ isActive: true })
    await flushAsync()
    expect(mocks.bookmarksFilter).toHaveBeenCalledTimes(3)
  })

  it('guard: permission-error por token vencido NAO barra o sync (renovacao silenciosa resolve)', async () => {
    setBookmarkDriveSyncStatus('permission-error')

    void scheduleBookmarkDriveSync(8)

    expect(scheduledBookIds()).toEqual([8])
    await flushAsync()
  })

  it('guard: permission-error com consentimento pendente barra o sync', async () => {
    setBookmarkDriveSyncStatus('permission-error')
    mocks.isDriveConsentRequired.mockReturnValue(true)

    await scheduleBookmarkDriveSync(9)

    expect(mocks.booksGet).not.toHaveBeenCalled()
  })
})
