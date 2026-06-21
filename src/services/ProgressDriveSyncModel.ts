import type { ReadingProgress } from '../types/book'

export const PROGRESS_DRIVE_SYNC_SCHEMA_VERSION = 1
export const PROGRESS_DRIVE_FILE_PREFIX = 'neoreader-progress-v1'

export interface RemoteProgress {
  schemaVersion: typeof PROGRESS_DRIVE_SYNC_SCHEMA_VERSION
  bookFileHash: string
  cfi: string
  percentage: number
  fraction?: number
  sectionHref?: string
  sectionLabel?: string
  updatedAt: string // ISO
}

export function getProgressDriveFileName(bookFileHash: string): string {
  const normalized = bookFileHash.trim().toLowerCase()
  return `${PROGRESS_DRIVE_FILE_PREFIX}-${normalized}.json`
}

export function toRemoteProgress(
  bookFileHash: string,
  progress: ReadingProgress,
): RemoteProgress {
  return {
    schemaVersion: PROGRESS_DRIVE_SYNC_SCHEMA_VERSION,
    bookFileHash: bookFileHash.trim().toLowerCase(),
    cfi: progress.cfi,
    percentage: progress.percentage,
    ...(progress.fraction !== undefined ? { fraction: progress.fraction } : {}),
    ...(progress.sectionHref ? { sectionHref: progress.sectionHref } : {}),
    ...(progress.sectionLabel ? { sectionLabel: progress.sectionLabel } : {}),
    updatedAt: new Date(progress.updatedAt).toISOString(),
  }
}
