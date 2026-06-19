import { useSyncExternalStore } from 'react'
import { vocabularySyncStatusStore } from '../services/VocabularyDriveSyncService'
import type { DriveDataSyncStatus } from '../services/DriveDataSyncStatus'

export function useVocabularyDriveSyncStatus(isPro: boolean | null): DriveDataSyncStatus {
  const status = useSyncExternalStore(
    vocabularySyncStatusStore.subscribe,
    vocabularySyncStatusStore.getCached,
    vocabularySyncStatusStore.getCached,
  )

  if (isPro !== true) {
    return { code: 'pro-required', updatedAt: status.updatedAt }
  }

  if (status.code === 'pro-required') {
    return { code: 'pending-offline', updatedAt: status.updatedAt }
  }

  return status
}
