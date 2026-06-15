import { BillingService } from './BillingService'
import { GoogleDriveAppDataError } from './GoogleDriveAppDataService'

export type BookmarkDriveSyncStatusCode =
  | 'pro-required'
  | 'pending-offline'
  | 'permission-error'
  | 'connected'

export interface BookmarkDriveSyncStatus {
  code: BookmarkDriveSyncStatusCode
  updatedAt?: Date
  detail?: string
}

type Listener = (status: BookmarkDriveSyncStatus) => void

const listeners = new Set<Listener>()
let cachedStatus: BookmarkDriveSyncStatus = {
  code: 'pro-required',
  updatedAt: undefined,
  detail: undefined,
}

export function hasBookmarkDriveSyncEntitlement(
  isPro: () => boolean = () => BillingService.getCachedStatus().isPro === true,
): boolean {
  return isPro()
}

export function getCachedBookmarkDriveSyncStatus(): BookmarkDriveSyncStatus {
  return cachedStatus
}

export function subscribeBookmarkDriveSyncStatus(listener: Listener): () => void {
  listeners.add(listener)
  return () => { listeners.delete(listener) }
}

export function setBookmarkDriveSyncStatus(
  code: BookmarkDriveSyncStatusCode,
  detail?: string,
): void {
  cachedStatus = {
    code,
    detail,
    updatedAt: new Date(),
  }

  for (const listener of listeners) listener(cachedStatus)
}

export function setBookmarkDriveSyncStatusFromError(error: unknown): BookmarkDriveSyncStatusCode {
  const code = classifyBookmarkDriveSyncError(error)
  const detail = normalizeBookmarkDriveSyncError(error)
  setBookmarkDriveSyncStatus(code, detail)
  return code
}

export function classifyBookmarkDriveSyncError(error: unknown): BookmarkDriveSyncStatusCode {
  if (error instanceof GoogleDriveAppDataError) {
    if (error.code === 'missing-token' || error.code === 'permission-denied') {
      return 'permission-error'
    }
  }
  return 'pending-offline'
}

export function normalizeBookmarkDriveSyncError(error: unknown): string {
  if (error instanceof GoogleDriveAppDataError) {
    return error.status ? `${error.code}:${error.status}` : error.code
  }

  if (error instanceof Error) return error.message
  return 'unknown'
}
