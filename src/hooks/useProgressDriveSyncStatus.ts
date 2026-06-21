import { useSyncExternalStore } from 'react'
import { progressSyncStatusStore } from '../services/ProgressDriveSyncService'
import type { DriveDataSyncStatus } from '../services/DriveDataSyncStatus'

export function useProgressDriveSyncStatus(isPro: boolean | null): DriveDataSyncStatus {
  const status = useSyncExternalStore(
    progressSyncStatusStore.subscribe,
    progressSyncStatusStore.getCached,
    progressSyncStatusStore.getCached,
  )

  if (isPro !== true) {
    return { code: 'pro-required', updatedAt: status.updatedAt }
  }

  if (status.code === 'pro-required') {
    return { code: 'pending-offline', updatedAt: status.updatedAt }
  }

  return status
}
