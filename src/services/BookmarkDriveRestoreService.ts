import { db } from '../db/database'
import type { Bookmark } from '../types/book'
import { BillingService } from './BillingService'
import {
  BOOKMARK_DRIVE_SYNC_SCHEMA_VERSION,
  createBookmarkSyncKey,
  getBookmarkDriveFileName,
  type RemoteBookmark,
  type RemoteBookmarkFile,
} from './BookmarkDriveSyncModel'
import { scheduleBookmarkDriveSync } from './BookmarkDriveSyncService'
import {
  GoogleDriveAppDataError,
  GoogleDriveAppDataService,
  type GoogleDriveAppDataFile,
} from './GoogleDriveAppDataService'
import { createFlowId, getDiagnosticsNowMs, logEvent, logWarn } from './DiagnosticsLogger'
import {
  hasBookmarkDriveSyncEntitlement,
  normalizeBookmarkDriveSyncError,
  setBookmarkDriveSyncStatus,
  setBookmarkDriveSyncStatusFromError,
} from './BookmarkDriveSyncStatus'

export interface BookmarkDriveRestoreClient {
  list(options: { name?: string }): Promise<GoogleDriveAppDataFile[]>
  getJson<T>(fileId: string): Promise<T>
}

export interface RestoreBookBookmarksResult {
  restoredCount: number
  mergedCount: number
  remoteBookmarkCount: number
  skipped?: boolean
  reason?: string
}

interface RestoreBookBookmarksOptions {
  driveClient?: BookmarkDriveRestoreClient
  now?: () => Date
  isPro?: () => boolean
}

interface MergeResult {
  restoredCount: number
  mergedCount: number
  shouldRewriteRemote: boolean
}

export async function restoreBookBookmarksFromDrive(
  bookId: number,
  options: RestoreBookBookmarksOptions = {},
): Promise<RestoreBookBookmarksResult> {
  const flowId = createFlowId('bookmark-restore')
  const startedAt = getDiagnosticsNowMs()
  const driveClient = options.driveClient ?? new GoogleDriveAppDataService()
  const now = options.now ?? (() => new Date())

  logEvent('bookmark.restore.start', {
    flowId,
    status: 'start',
    details: { bookId },
  })

  try {
    // Aguarda billing inicializar para evitar falso 'pro-required' logo apos login.
    await BillingService.waitForInit()

    if (!hasBookmarkDriveSyncEntitlement(options.isPro)) {
      setBookmarkDriveSyncStatus('pro-required')
      return finishSkipped(flowId, startedAt, bookId, 'pro-required')
    }

    setBookmarkDriveSyncStatus('pending-offline')
    const book = await db.books.get(bookId)
    if (!book) return finishSkipped(flowId, startedAt, bookId, 'book-not-found')
    if (!book.fileHash) return finishSkipped(flowId, startedAt, bookId, 'missing-file-hash')

    const localBookHash = book.fileHash.trim().toLowerCase()
    const fileName = getBookmarkDriveFileName(book.fileHash)
    const remoteFile = (await driveClient.list({ name: fileName }))[0]
    if (!remoteFile) return finishSkipped(flowId, startedAt, bookId, 'remote-file-not-found')

    const payload = await driveClient.getJson<RemoteBookmarkFile>(remoteFile.id)
    if (!isSupportedRemoteBookmarkFile(payload)) {
      return finishSkipped(flowId, startedAt, bookId, 'unsupported-schema')
    }
    if (payload.bookFileHash.trim().toLowerCase() !== localBookHash) {
      return finishSkipped(flowId, startedAt, bookId, 'file-hash-mismatch')
    }

    const remoteBookmarks = payload.bookmarks.filter(isRemoteBookmark)
    const localBookmarks = await db.bookmarks.where('bookId').equals(bookId).toArray()
    const mergeResult = await mergeBookmarks(bookId, localBookmarks, remoteBookmarks, now())

    if (mergeResult.shouldRewriteRemote) {
      scheduleBookmarkDriveSync(bookId)
    }
    setBookmarkDriveSyncStatus('connected')

    const result: RestoreBookBookmarksResult = {
      restoredCount: mergeResult.restoredCount,
      mergedCount: mergeResult.mergedCount,
      remoteBookmarkCount: remoteBookmarks.length,
    }

    logEvent('bookmark.restore.success', {
      flowId,
      status: 'success',
      durationMs: getDiagnosticsNowMs() - startedAt,
      details: {
        bookId,
        ...result,
        rewroteRemote: mergeResult.shouldRewriteRemote,
      },
    })

    return result
  } catch (error) {
    const reason = normalizeBookmarkRestoreError(error)
    setBookmarkDriveSyncStatusFromError(error)
    logWarn('bookmark.restore.failure', {
      flowId,
      status: 'failure',
      durationMs: getDiagnosticsNowMs() - startedAt,
      error,
      details: {
        bookId,
        reason,
      },
    })
    return {
      restoredCount: 0,
      mergedCount: 0,
      remoteBookmarkCount: 0,
      skipped: true,
      reason,
    }
  }
}

async function mergeBookmarks(
  bookId: number,
  localBookmarks: Bookmark[],
  remoteBookmarks: RemoteBookmark[],
  syncedAt: Date,
): Promise<MergeResult> {
  const localBySyncKey = new Map<string, Bookmark & { id: number; syncKey: string }>()
  let shouldRewriteRemote = false

  await Promise.all(localBookmarks.map(async (bookmark) => {
    if (bookmark.id === undefined) return
    const syncKey = bookmark.syncKey || createBookmarkSyncKey(bookmark.cfi)
    localBySyncKey.set(syncKey, { ...bookmark, id: bookmark.id, syncKey })

    if (!bookmark.syncKey) {
      shouldRewriteRemote = true
      await db.bookmarks.update(bookmark.id, {
        syncKey,
        syncError: null,
      })
    }
  }))

  let restoredCount = 0
  let mergedCount = 0
  const remoteSyncKeys = new Set<string>()

  for (const remoteBookmark of remoteBookmarks) {
    const remoteSyncKey = remoteBookmark.syncKey || createBookmarkSyncKey(remoteBookmark.cfi)
    const remote = { ...remoteBookmark, syncKey: remoteSyncKey }
    remoteSyncKeys.add(remoteSyncKey)

    const local = localBySyncKey.get(remoteSyncKey)
    if (!local) {
      await addRemoteBookmark(bookId, remote, syncedAt)
      shouldRewriteRemote = true
      mergedCount += 1
      if (!remote.deletedAt) restoredCount += 1
      continue
    }

    const localTimestamp = effectiveLocalTimestampMs(local)
    const remoteTimestamp = effectiveRemoteTimestampMs(remote)
    if (remoteTimestamp > localTimestamp) {
      await applyRemoteBookmark(local.id, remote, syncedAt)
      shouldRewriteRemote = true
      mergedCount += 1
      if (!remote.deletedAt) restoredCount += 1
      continue
    }

    if (localTimestamp > remoteTimestamp) {
      shouldRewriteRemote = true
    }
  }

  for (const syncKey of localBySyncKey.keys()) {
    if (!remoteSyncKeys.has(syncKey)) shouldRewriteRemote = true
  }

  return {
    restoredCount,
    mergedCount,
    shouldRewriteRemote,
  }
}

async function addRemoteBookmark(
  bookId: number,
  remote: RemoteBookmark,
  syncedAt: Date,
): Promise<void> {
  const createdAt = parseRemoteDate(remote.createdAt, syncedAt)
  const updatedAt = parseRemoteDate(remote.updatedAt, createdAt)

  await db.bookmarks.add({
    bookId,
    cfi: remote.cfi,
    label: remote.label,
    percentage: remote.percentage,
    snippet: remote.snippet,
    color: remote.color,
    syncKey: remote.syncKey,
    syncedAt,
    syncError: null,
    createdAt,
    updatedAt,
    deletedAt: remote.deletedAt ? parseRemoteDate(remote.deletedAt, syncedAt) : null,
  })
}

async function applyRemoteBookmark(
  localId: number,
  remote: RemoteBookmark,
  syncedAt: Date,
): Promise<void> {
  const createdAt = parseRemoteDate(remote.createdAt, syncedAt)
  const updatedAt = parseRemoteDate(remote.updatedAt, createdAt)

  await db.bookmarks.update(localId, {
    cfi: remote.cfi,
    label: remote.label,
    percentage: remote.percentage,
    snippet: remote.snippet,
    color: remote.color,
    syncKey: remote.syncKey,
    syncedAt,
    syncError: null,
    createdAt,
    updatedAt,
    deletedAt: remote.deletedAt ? parseRemoteDate(remote.deletedAt, syncedAt) : null,
  })
}

function finishSkipped(
  flowId: string,
  startedAt: number,
  bookId: number,
  reason: string,
): RestoreBookBookmarksResult {
  const result = {
    restoredCount: 0,
    mergedCount: 0,
    remoteBookmarkCount: 0,
    skipped: true,
    reason,
  }

  logEvent('bookmark.restore.success', {
    flowId,
    status: 'success',
    durationMs: getDiagnosticsNowMs() - startedAt,
    details: {
      bookId,
      ...result,
    },
  })

  return result
}

function isSupportedRemoteBookmarkFile(value: unknown): value is RemoteBookmarkFile {
  if (!value || typeof value !== 'object') return false
  const candidate = value as Partial<RemoteBookmarkFile>
  return candidate.schemaVersion === BOOKMARK_DRIVE_SYNC_SCHEMA_VERSION
    && typeof candidate.bookFileHash === 'string'
    && Array.isArray(candidate.bookmarks)
}

function isRemoteBookmark(value: unknown): value is RemoteBookmark {
  if (!value || typeof value !== 'object') return false
  const candidate = value as Partial<RemoteBookmark>
  return typeof candidate.cfi === 'string'
    && candidate.cfi.trim().length > 0
    && typeof candidate.label === 'string'
    && typeof candidate.percentage === 'number'
    && Number.isFinite(candidate.percentage)
    && typeof candidate.createdAt === 'string'
    && typeof candidate.updatedAt === 'string'
    && (candidate.deletedAt === null || typeof candidate.deletedAt === 'string')
    && (candidate.syncKey === undefined || typeof candidate.syncKey === 'string')
    && (candidate.snippet === undefined || typeof candidate.snippet === 'string')
    && (candidate.color === undefined || typeof candidate.color === 'string')
}

function effectiveLocalTimestampMs(bookmark: Bookmark): number {
  return parseTimestampMs(bookmark.deletedAt ?? bookmark.updatedAt ?? bookmark.createdAt)
}

function effectiveRemoteTimestampMs(bookmark: RemoteBookmark): number {
  return parseTimestampMs(bookmark.deletedAt ?? bookmark.updatedAt ?? bookmark.createdAt)
}

function parseTimestampMs(value: Date | string): number {
  const timestamp = value instanceof Date ? value.getTime() : Date.parse(value)
  return Number.isFinite(timestamp) ? timestamp : 0
}

function parseRemoteDate(value: string, fallback: Date): Date {
  const timestamp = Date.parse(value)
  return Number.isFinite(timestamp) ? new Date(timestamp) : fallback
}

function normalizeBookmarkRestoreError(error: unknown): string {
  if (error instanceof GoogleDriveAppDataError) {
    return error.status ? `${error.code}:${error.status}` : error.code
  }

  return normalizeBookmarkDriveSyncError(error)
}
