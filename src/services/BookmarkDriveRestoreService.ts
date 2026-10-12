import { db } from '../db/database'
import { BillingService } from './BillingService'
import {
  getBookmarkDriveFileName,
  type RemoteBookmarkFile,
} from './BookmarkDriveSyncModel'
import {
  isRemoteBookmark,
  isSupportedRemoteBookmarkFile,
  mergeRemoteBookmarksIntoLocal,
} from './BookmarkDriveMerge'
import { scheduleBookmarkDriveSync } from './BookmarkDriveSyncService'
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
    // Aguarda o entitlement ser conhecido — não só o SDK configurado — para
    // evitar falso 'pro-required' logo apos login. waitForInit() não bastava:
    // resolve antes de isPro existir.
    await BillingService.waitForEntitlements()

    if (!hasBookmarkDriveSyncEntitlement(options.isPro)) {
      setBookmarkDriveSyncStatus('pro-required')
      return finishSkipped(flowId, startedAt, bookId, 'pro-required')
    }

    // Guard de permissão: sem ele, cada livro importado tentava ir ao Drive de
    // novo. E NÃO resetamos o status para 'pending-offline' aqui — esse reset
    // apagava justamente o 'permission-error' que segura os schedule*Sync.
    if (getCachedBookmarkDriveSyncStatus().code === 'permission-error') {
      return finishSkipped(flowId, startedAt, bookId, 'permission-error')
    }

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
    const mergeResult = await mergeRemoteBookmarksIntoLocal(bookId, localBookmarks, remoteBookmarks, now())

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

function normalizeBookmarkRestoreError(error: unknown): string {
  if (error instanceof GoogleDriveAppDataError) {
    return error.status ? `${error.code}:${error.status}` : error.code
  }

  return normalizeBookmarkDriveSyncError(error)
}
