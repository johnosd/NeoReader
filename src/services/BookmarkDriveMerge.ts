import { db } from '../db/database'
import type { Bookmark } from '../types/book'
import {
  BOOKMARK_DRIVE_SYNC_SCHEMA_VERSION,
  createBookmarkSyncKey,
  type RemoteBookmark,
  type RemoteBookmarkFile,
} from './BookmarkDriveSyncModel'

// Reconciliação local × Drive compartilhada pelo restore (importação) e pelo
// sync (upload). Vive num módulo próprio porque o restore já importa o sync
// (scheduleBookmarkDriveSync) — importar o restore dentro do sync criaria ciclo.

export interface BookmarkMergeResult {
  restoredCount: number
  mergedCount: number
  shouldRewriteRemote: boolean
}

// Aplica no banco local o que o remoto tem de novo ou mais recente, comparando
// por syncKey e pelo timestamp efetivo (deletedAt ?? updatedAt ?? createdAt).
// Tombstones (deletedAt) entram como qualquer outra versão, então uma exclusão
// mais recente vence uma edição mais antiga e não ressuscita depois.
export async function mergeRemoteBookmarksIntoLocal(
  bookId: number,
  localBookmarks: Bookmark[],
  remoteBookmarks: RemoteBookmark[],
  syncedAt: Date,
): Promise<BookmarkMergeResult> {
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

export function isSupportedRemoteBookmarkFile(value: unknown): value is RemoteBookmarkFile {
  if (!value || typeof value !== 'object') return false
  const candidate = value as Partial<RemoteBookmarkFile>
  return candidate.schemaVersion === BOOKMARK_DRIVE_SYNC_SCHEMA_VERSION
    && typeof candidate.bookFileHash === 'string'
    && Array.isArray(candidate.bookmarks)
}

export function isRemoteBookmark(value: unknown): value is RemoteBookmark {
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
