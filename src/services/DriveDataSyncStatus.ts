// Store genérico de status de sync com Google Drive.
// Cada tipo de dado (progress, vocabulary) cria sua própria instância.
// Segue o mesmo padrão de BookmarkDriveSyncStatus mas sem duplicação.

import { BillingService } from './BillingService'
import { GoogleDriveAppDataError } from './GoogleDriveAppDataService'

export type DriveDataSyncStatusCode =
  | 'pro-required'
  | 'pending-offline'
  | 'permission-error'
  | 'connected'

export interface DriveDataSyncStatus {
  code: DriveDataSyncStatusCode
  updatedAt?: Date
  detail?: string
}

type Listener = (status: DriveDataSyncStatus) => void

export function createDriveDataSyncStatusStore() {
  const listeners = new Set<Listener>()
  let cached: DriveDataSyncStatus = { code: 'pro-required' }

  return {
    getCached: () => cached,

    subscribe: (listener: Listener): (() => void) => {
      listeners.add(listener)
      return () => { listeners.delete(listener) }
    },

    set: (code: DriveDataSyncStatusCode, detail?: string) => {
      cached = { code, detail, updatedAt: new Date() }
      for (const l of listeners) l(cached)
    },

    setFromError: (error: unknown): DriveDataSyncStatusCode => {
      const code = classifyDriveSyncError(error)
      const detail = normalizeDriveSyncError(error)
      cached = { code, detail, updatedAt: new Date() }
      for (const l of listeners) l(cached)
      return code
    },
  }
}

export function hasDriveSyncEntitlement(
  isPro: () => boolean = () => BillingService.getCachedStatus().isPro === true,
): boolean {
  return isPro()
}

export function classifyDriveSyncError(error: unknown): DriveDataSyncStatusCode {
  if (error instanceof GoogleDriveAppDataError) {
    if (error.code === 'missing-token' || error.code === 'permission-denied') {
      return 'permission-error'
    }
  }
  return 'pending-offline'
}

export function normalizeDriveSyncError(error: unknown): string {
  if (error instanceof GoogleDriveAppDataError) {
    return error.status ? `${error.code}:${error.status}` : error.code
  }
  if (error instanceof Error) return error.message
  return 'unknown'
}
