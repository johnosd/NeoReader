import { db } from '../db/database'
import { BillingService } from './BillingService'
import { GoogleDriveAppDataService, type GoogleDriveAppDataFile } from './GoogleDriveAppDataService'
import { createFlowId, getDiagnosticsNowMs, logEvent, logWarn } from './DiagnosticsLogger'
import {
  createDriveDataSyncStatusStore,
  hasDriveSyncEntitlement,
} from './DriveDataSyncStatus'
import {
  toRemoteVocabFile,
  vocabSyncKey,
  VOCABULARY_DRIVE_FILE_NAME,
  type RemoteVocabFile,
} from './VocabularyDriveSyncModel'
import type { VocabItem } from '../types/vocabulary'

export interface VocabularyDriveSyncClient {
  list(options: { name?: string }): Promise<GoogleDriveAppDataFile[]>
  createJson<T>(name: string, data: T): Promise<GoogleDriveAppDataFile>
  updateJson<T>(fileId: string, data: T): Promise<GoogleDriveAppDataFile>
  getJson<T>(fileId: string): Promise<T>
}

interface SyncOptions {
  driveClient?: VocabularyDriveSyncClient
  isPro?: () => boolean
}

export const vocabularySyncStatusStore = createDriveDataSyncStatusStore()

let inFlight = false
let pendingRerun = false

export function scheduleVocabularyDriveSync(): void {
  if (inFlight) {
    pendingRerun = true
    return
  }
  void runScheduled()
}

export async function syncVocabulary(options: SyncOptions = {}): Promise<void> {
  const flowId = createFlowId('vocabulary-sync')
  const startedAt = getDiagnosticsNowMs()
  const driveClient = options.driveClient ?? new GoogleDriveAppDataService()

  logEvent('vocabulary.sync.start', { flowId, status: 'start' })

  try {
    await BillingService.waitForInit()

    if (!hasDriveSyncEntitlement(options.isPro)) {
      vocabularySyncStatusStore.set('pro-required')
      return
    }

    vocabularySyncStatusStore.set('pending-offline')

    const items = await db.vocabulary.orderBy('createdAt').toArray()
    const payload = toRemoteVocabFile(items)
    const existingFile = (await driveClient.list({ name: VOCABULARY_DRIVE_FILE_NAME }))[0]

    if (existingFile) {
      await driveClient.updateJson(existingFile.id, payload)
    } else {
      await driveClient.createJson(VOCABULARY_DRIVE_FILE_NAME, payload)
    }

    vocabularySyncStatusStore.set('connected')
    logEvent('vocabulary.sync.success', {
      flowId,
      status: 'success',
      durationMs: getDiagnosticsNowMs() - startedAt,
      details: { itemCount: items.length },
    })
  } catch (error) {
    vocabularySyncStatusStore.setFromError(error)
    logWarn('vocabulary.sync.failure', {
      flowId,
      status: 'failure',
      durationMs: getDiagnosticsNowMs() - startedAt,
      error,
    })
  }
}

export async function restoreVocabularyFromDrive(
  options: SyncOptions = {},
): Promise<{ addedCount: number }> {
  const driveClient = options.driveClient ?? new GoogleDriveAppDataService()

  await BillingService.waitForInit()
  if (!hasDriveSyncEntitlement(options.isPro)) return { addedCount: 0 }

  try {
    const files = await driveClient.list({ name: VOCABULARY_DRIVE_FILE_NAME })
    if (!files[0]) return { addedCount: 0 }

    const remote = await driveClient.getJson<RemoteVocabFile>(files[0].id)
    if (!remote?.items?.length) return { addedCount: 0 }

    const local = await db.vocabulary.orderBy('createdAt').toArray()
    const localKeys = new Set(local.map(vocabSyncKey))

    // Adiciona apenas itens que não existem localmente (identidade por syncKey)
    const toAdd: Omit<VocabItem, 'id'>[] = remote.items
      .filter((remoteItem) => !localKeys.has(vocabSyncKey(remoteItem)))
      .map((remoteItem) => ({
        bookId: 0, // bookId desconhecido em dispositivos diferentes; 0 = sem livro vinculado
        bookTitle: remoteItem.bookTitle,
        sourceText: remoteItem.sourceText,
        translatedText: remoteItem.translatedText,
        sourceLang: remoteItem.sourceLang,
        targetLang: remoteItem.targetLang,
        createdAt: new Date(remoteItem.createdAt),
      }))

    if (toAdd.length > 0) await db.vocabulary.bulkAdd(toAdd)

    return { addedCount: toAdd.length }
  } catch {
    // Falha silenciosa — não bloqueia o app
    return { addedCount: 0 }
  }
}

async function runScheduled(): Promise<void> {
  inFlight = true
  try {
    await syncVocabulary()
  } catch {
    // syncVocabulary captura erros esperados
  } finally {
    inFlight = false
    if (pendingRerun) {
      pendingRerun = false
      scheduleVocabularyDriveSync()
    }
  }
}
