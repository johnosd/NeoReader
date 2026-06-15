import { useSyncExternalStore } from 'react'
import {
  getCachedBookmarkDriveSyncStatus,
  subscribeBookmarkDriveSyncStatus,
  type BookmarkDriveSyncStatus,
} from '../services/BookmarkDriveSyncStatus'

export function useBookmarkDriveSyncStatus(isPro: boolean | null): BookmarkDriveSyncStatus {
  const status = useSyncExternalStore(
    subscribeBookmarkDriveSyncStatus,
    getCachedBookmarkDriveSyncStatus,
    getCachedBookmarkDriveSyncStatus,
  )

  if (isPro !== true) {
    return {
      code: 'pro-required',
      updatedAt: status.updatedAt,
      detail: status.detail,
    }
  }

  if (status.code === 'pro-required') {
    return {
      code: 'pending-offline',
      updatedAt: status.updatedAt,
      detail: status.detail,
    }
  }

  return status
}
