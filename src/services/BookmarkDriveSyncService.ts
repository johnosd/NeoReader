import { App as CapApp } from '@capacitor/app'
import { db } from '../db/database'
import { isDriveConsentRequired, refreshDriveToken } from './FirebaseAuthService'
import type { Bookmark } from '../types/book'
import { BillingService } from './BillingService'
import {
  createBookmarkSyncKey,
  createRemoteBookmarkFile,
  getBookmarkDriveFileName,
} from './BookmarkDriveSyncModel'
import {
  GoogleDriveAppDataError,
  GoogleDriveAppDataService,
  type GoogleDriveAppDataFile,
} from './GoogleDriveAppDataService'
import { createFlowId, getDiagnosticsNowMs, logEvent, logWarn } from './DiagnosticsLogger'
import {
  getCachedBookmarkDriveSyncStatus,
  hasBookmarkDriveSyncEntitlement,
  normalizeBookmarkDriveSyncError,
  setBookmarkDriveSyncStatus,
  setBookmarkDriveSyncStatusFromError,
} from './BookmarkDriveSyncStatus'

export interface BookmarkDriveSyncClient {
  list(options: { name?: string }): Promise<GoogleDriveAppDataFile[]>
  createJson<T>(name: string, data: T): Promise<GoogleDriveAppDataFile>
  updateJson<T>(fileId: string, data: T): Promise<GoogleDriveAppDataFile>
}

interface SyncBookBookmarksOptions {
  driveClient?: BookmarkDriveSyncClient
  now?: () => Date
  isPro?: () => boolean
}

interface BookmarkSnapshot {
  id: number
  syncKey: string
  effectiveTimestamp: string
}

const inFlightBookIds = new Set<number>()
const rerunBookIds = new Set<number>()

export function scheduleBookmarkDriveSync(bookId: number): Promise<void> {
  if (!Number.isFinite(bookId)) return Promise.resolve()
  // Só barra quando o Google disse que precisa de consentimento (UI): aí
  // tentar de novo é garantidamente inútil até o usuário reabrir o app. Um
  // 'permission-error' por token vencido se resolve sozinho com a renovação
  // silenciosa dentro do GoogleDriveAppDataService (feature 021).
  if (getCachedBookmarkDriveSyncStatus().code === 'permission-error' && isDriveConsentRequired()) {
    return Promise.resolve()
  }
  if (inFlightBookIds.has(bookId)) {
    rerunBookIds.add(bookId)
    return Promise.resolve()
  }
  return runScheduledBookmarkDriveSync(bookId)
}

export async function syncBookBookmarks(
  bookId: number,
  options: SyncBookBookmarksOptions = {},
): Promise<void> {
  const flowId = createFlowId('bookmark-sync')
  const startedAt = getDiagnosticsNowMs()
  const driveClient = options.driveClient ?? new GoogleDriveAppDataService()
  const now = options.now ?? (() => new Date())

  logEvent('bookmark.sync.start', {
    flowId,
    status: 'start',
    details: { bookId },
  })

  const book = await db.books.get(bookId)
  const bookmarks = await db.bookmarks.where('bookId').equals(bookId).toArray()
  const snapshots = snapshotsFromBookmarks(bookmarks)

  try {
    await BillingService.waitForEntitlements()

    if (!hasBookmarkDriveSyncEntitlement(options.isPro)) {
      setBookmarkDriveSyncStatus('pro-required')
      logEvent('bookmark.sync.skipped', {
        flowId,
        status: 'success',
        durationMs: getDiagnosticsNowMs() - startedAt,
        details: {
          bookId,
          reason: 'pro-required',
        },
      })
      return
    }

    setBookmarkDriveSyncStatus('pending-offline')
    if (!book) throw new Error('Book not found for bookmark sync.')
    if (!book.fileHash) throw new Error('Book fileHash is required for bookmark sync.')

    const normalizedBookmarks = await ensureBookmarkSyncKeys(bookmarks)
    const fileName = getBookmarkDriveFileName(book.fileHash)
    const payload = createRemoteBookmarkFile({
      book,
      bookmarks: normalizedBookmarks,
      updatedAt: now(),
    })
    const existingFile = (await driveClient.list({ name: fileName }))[0]

    if (existingFile) {
      await driveClient.updateJson(existingFile.id, payload)
    } else {
      await driveClient.createJson(fileName, payload)
    }

    await markSnapshotsSynced(snapshotsFromBookmarks(normalizedBookmarks), now())
    setBookmarkDriveSyncStatus('connected')
    logEvent('bookmark.sync.success', {
      flowId,
      status: 'success',
      durationMs: getDiagnosticsNowMs() - startedAt,
      details: {
        bookId,
        bookmarkCount: normalizedBookmarks.length,
        operation: existingFile ? 'update' : 'create',
      },
    })
  } catch (error) {
    const syncError = normalizeBookmarkSyncError(error)
    setBookmarkDriveSyncStatusFromError(error)
    await markSnapshotsFailed(snapshots, syncError)
    logWarn('bookmark.sync.failure', {
      flowId,
      status: 'failure',
      durationMs: getDiagnosticsNowMs() - startedAt,
      error,
      details: {
        bookId,
        bookmarkCount: bookmarks.length,
        syncError,
      },
    })
  }
}

async function runScheduledBookmarkDriveSync(bookId: number): Promise<void> {
  inFlightBookIds.add(bookId)

  try {
    await syncBookBookmarks(bookId)
  } catch {
    // syncBookBookmarks catches expected failures; this keeps background sync
    // from surfacing through bookmark UI flows if a new unexpected failure appears.
  } finally {
    inFlightBookIds.delete(bookId)
    if (rerunBookIds.delete(bookId)) scheduleBookmarkDriveSync(bookId)
  }
}

async function ensureBookmarkSyncKeys(bookmarks: Bookmark[]): Promise<Bookmark[]> {
  await Promise.all(
    bookmarks.map(async (bookmark) => {
      if (bookmark.syncKey || bookmark.id === undefined) return
      await db.bookmarks.update(bookmark.id, {
        syncKey: createBookmarkSyncKey(bookmark.cfi),
        syncError: null,
      })
    }),
  )

  return bookmarks.map((bookmark) => ({
    ...bookmark,
    syncKey: bookmark.syncKey || createBookmarkSyncKey(bookmark.cfi),
  }))
}

async function markSnapshotsSynced(snapshots: BookmarkSnapshot[], syncedAt: Date): Promise<void> {
  await Promise.all(snapshots.map(async (snapshot) => {
    const current = await db.bookmarks.get(snapshot.id)
    if (!current) return
    if (createEffectiveTimestamp(current) !== snapshot.effectiveTimestamp) return

    await db.bookmarks.update(snapshot.id, {
      syncKey: current.syncKey || snapshot.syncKey,
      syncedAt,
      syncError: null,
    })
  }))
}

async function markSnapshotsFailed(snapshots: BookmarkSnapshot[], syncError: string): Promise<void> {
  await Promise.all(snapshots.map(async (snapshot) => {
    const current = await db.bookmarks.get(snapshot.id)
    if (!current) return
    if (current.syncedAt && createEffectiveTimestamp(current) === snapshot.effectiveTimestamp) return

    await db.bookmarks.update(snapshot.id, {
      syncKey: current.syncKey || snapshot.syncKey,
      syncedAt: null,
      syncError,
    })
  }))
}

function snapshotsFromBookmarks(bookmarks: Bookmark[]): BookmarkSnapshot[] {
  return bookmarks
    .filter((bookmark): bookmark is Bookmark & { id: number } => bookmark.id !== undefined)
    .map((bookmark) => ({
      id: bookmark.id,
      syncKey: bookmark.syncKey || createBookmarkSyncKey(bookmark.cfi),
      effectiveTimestamp: createEffectiveTimestamp(bookmark),
    }))
}

function createEffectiveTimestamp(bookmark: Bookmark): string {
  return new Date(bookmark.deletedAt ?? bookmark.updatedAt ?? bookmark.createdAt).toISOString()
}

function normalizeBookmarkSyncError(error: unknown): string {
  if (error instanceof GoogleDriveAppDataError) {
    return error.status ? `${error.code}:${error.status}` : error.code
  }

  return normalizeBookmarkDriveSyncError(error)
}

// Gatilhos de retry dos bookmarks pendentes (feature 021): cold start (a
// própria chamada), app voltando ao foreground e rede voltando. Devolve o
// cleanup dos listeners — o chamador (App.tsx) remove no unmount.
export function initBookmarkSyncTriggers(): () => void {
  let disposed = false
  const runIfActive = () => {
    if (!disposed) void retryPendingBookmarkSyncs()
  }

  const appStateListener = CapApp.addListener('appStateChange', (state) => {
    if (state.isActive) runIfActive()
  })
  window.addEventListener('online', runIfActive)
  runIfActive()

  return () => {
    disposed = true
    window.removeEventListener('online', runIfActive)
    void appStateListener.then((listener) => listener.remove()).catch(() => undefined)
  }
}

export async function retryPendingBookmarkSyncs(): Promise<void> {
  try {
    // Sem Pro não há sync — evita varrer o banco e agendar à toa a cada resume.
    await BillingService.waitForEntitlements()
    if (!hasBookmarkDriveSyncEntitlement()) return

    // Caso residual (escopo revogado/conta trocada): a spec quer a tela do
    // Google só quando o usuário ABRE o app — que é exatamente quando este
    // retry roda (cold start/resume), nunca no meio da leitura.
    // userInitiated: false mantém o cooldown de 30min/teto por sessão do
    // refreshDriveToken: se o usuário cancelar, não reabrimos a cada resume.
    if (isDriveConsentRequired()) {
      const outcome = await refreshDriveToken({ userInitiated: false })
      if (outcome !== 'refreshed') return
      // Token novo: o guard de permission-error não pode mais barrar o retry.
      setBookmarkDriveSyncStatus('pending-offline')
    }

    const pendingBookmarks = await db.bookmarks.filter((bookmark) => !bookmark.syncedAt).toArray()
    const bookIds = new Set(pendingBookmarks.map((bookmark) => bookmark.bookId))
    for (const bookId of bookIds) void scheduleBookmarkDriveSync(bookId)
  } catch (error) {
    logWarn('bookmark.sync.retry-pending.failure', { status: 'failure', error })
  }
}
