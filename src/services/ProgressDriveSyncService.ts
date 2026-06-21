import { db } from '../db/database'
import { BillingService } from './BillingService'
import { GoogleDriveAppDataService, type GoogleDriveAppDataFile } from './GoogleDriveAppDataService'
import { createFlowId, getDiagnosticsNowMs, logEvent, logWarn } from './DiagnosticsLogger'
import {
  createDriveDataSyncStatusStore,
  hasDriveSyncEntitlement,
} from './DriveDataSyncStatus'
import { getProgressDriveFileName, toRemoteProgress, type RemoteProgress } from './ProgressDriveSyncModel'

export interface ProgressDriveSyncClient {
  list(options: { name?: string }): Promise<GoogleDriveAppDataFile[]>
  createJson<T>(name: string, data: T): Promise<GoogleDriveAppDataFile>
  updateJson<T>(fileId: string, data: T): Promise<GoogleDriveAppDataFile>
  getJson<T>(fileId: string): Promise<T>
}

interface SyncOptions {
  driveClient?: ProgressDriveSyncClient
  isPro?: () => boolean
}

// Store de status compartilhado com a UI via hook useProgressDriveSyncStatus
export const progressSyncStatusStore = createDriveDataSyncStatusStore()

const inFlightBookIds = new Set<number>()
const rerunBookIds = new Set<number>()

export function scheduleProgressDriveSync(bookId: number): void {
  if (!Number.isFinite(bookId)) return
  // Não tenta sync se o token está ausente/expirado — evita flood de falhas até reconexão
  if (progressSyncStatusStore.getCached().code === 'permission-error') return
  if (inFlightBookIds.has(bookId)) {
    rerunBookIds.add(bookId)
    return
  }
  void runScheduled(bookId)
}

export async function syncBookProgress(
  bookId: number,
  options: SyncOptions = {},
): Promise<void> {
  const flowId = createFlowId('progress-sync')
  const startedAt = getDiagnosticsNowMs()
  const driveClient = options.driveClient ?? new GoogleDriveAppDataService()

  logEvent('progress.sync.start', { flowId, status: 'start', details: { bookId } })

  try {
    await BillingService.waitForInit()

    if (!hasDriveSyncEntitlement(options.isPro)) {
      progressSyncStatusStore.set('pro-required')
      return
    }

    progressSyncStatusStore.set('pending-offline')

    const book = await db.books.get(bookId)
    if (!book?.fileHash) throw new Error('Book or fileHash not found for progress sync.')

    const progress = await db.progress.where('bookId').equals(bookId).first()
    if (!progress) return // Nada para sincronizar ainda

    const fileName = getProgressDriveFileName(book.fileHash)
    const payload = toRemoteProgress(book.fileHash, progress)
    const existingFile = (await driveClient.list({ name: fileName }))[0]

    if (existingFile) {
      // Conflito: last-write-wins. Só sobrescreve se o local for mais recente.
      const remote = await driveClient.getJson<RemoteProgress>(existingFile.id)
      const remoteUpdatedAt = remote?.updatedAt ? new Date(remote.updatedAt).getTime() : 0
      const localUpdatedAt = new Date(progress.updatedAt).getTime()
      if (localUpdatedAt >= remoteUpdatedAt) {
        await driveClient.updateJson(existingFile.id, payload)
      }
    } else {
      await driveClient.createJson(fileName, payload)
    }

    progressSyncStatusStore.set('connected')
    logEvent('progress.sync.success', {
      flowId,
      status: 'success',
      durationMs: getDiagnosticsNowMs() - startedAt,
      details: { bookId },
    })
  } catch (error) {
    progressSyncStatusStore.setFromError(error)
    logWarn('progress.sync.failure', {
      flowId,
      status: 'failure',
      durationMs: getDiagnosticsNowMs() - startedAt,
      error,
      details: { bookId },
    })
  }
}

export async function restoreBookProgressFromDrive(
  bookId: number,
  options: SyncOptions = {},
): Promise<{ restored: boolean }> {
  const driveClient = options.driveClient ?? new GoogleDriveAppDataService()

  await BillingService.waitForInit()
  if (!hasDriveSyncEntitlement(options.isPro)) return { restored: false }

  const book = await db.books.get(bookId)
  if (!book?.fileHash) return { restored: false }

  try {
    const fileName = getProgressDriveFileName(book.fileHash)
    const files = await driveClient.list({ name: fileName })
    if (!files[0]) return { restored: false }

    const remote = await driveClient.getJson<RemoteProgress>(files[0].id)
    if (!remote?.cfi || remote.bookFileHash !== book.fileHash.trim().toLowerCase()) {
      return { restored: false }
    }

    const local = await db.progress.where('bookId').equals(bookId).first()
    const remoteTs = new Date(remote.updatedAt).getTime()
    const localTs = local ? new Date(local.updatedAt).getTime() : 0

    if (remoteTs > localTs) {
      const record = {
        bookId,
        cfi: remote.cfi,
        percentage: remote.percentage,
        fraction: remote.fraction,
        sectionHref: remote.sectionHref,
        sectionLabel: remote.sectionLabel,
        updatedAt: new Date(remote.updatedAt),
      }
      if (local?.id !== undefined) {
        await db.progress.put({ ...record, id: local.id })
      } else {
        await db.progress.add(record)
      }
      return { restored: true }
    }
  } catch {
    // Falha silenciosa na restauração — não bloqueia abertura do livro
  }

  return { restored: false }
}

async function runScheduled(bookId: number): Promise<void> {
  inFlightBookIds.add(bookId)
  try {
    await syncBookProgress(bookId)
  } catch {
    // syncBookProgress captura erros esperados; isto protege contra falhas inesperadas
  } finally {
    inFlightBookIds.delete(bookId)
    if (rerunBookIds.delete(bookId)) scheduleProgressDriveSync(bookId)
  }
}
