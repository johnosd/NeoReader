import { useSyncExternalStore } from 'react'
import { isImportInProgress, subscribeImportActivity } from '../services/ImportCoordinator'

export function useIsImportActive(): boolean {
  return useSyncExternalStore(subscribeImportActivity, isImportInProgress, () => false)
}
