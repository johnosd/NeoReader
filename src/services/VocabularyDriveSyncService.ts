import { db } from '../db/database'
import { BillingService } from './BillingService'
import { GoogleDriveAppDataService, type GoogleDriveAppDataFile } from './GoogleDriveAppDataService'
import { createFlowId, getDiagnosticsNowMs, logEvent, logWarn } from './DiagnosticsLogger'
import {
  createDriveDataSyncStatusStore,
  hasDriveSyncEntitlement,
} from './DriveDataSyncStatus'
import {
  fromRemoteVocabItem,
  isRemoteVocabFile,
  selectRemoteItemsToRestore,
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
  if (vocabularySyncStatusStore.getCached().code === 'permission-error') return
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
    await BillingService.waitForEntitlements()

    if (!hasDriveSyncEntitlement(options.isPro)) {
      vocabularySyncStatusStore.set('pro-required')
      // Logar o skip: sem isto, o sync sumia sem deixar rastro nenhum — foi
      // o que escondeu a corrida de entitlement no cold start.
      logEvent('vocabulary.sync.skipped', {
        flowId,
        status: 'success',
        durationMs: getDiagnosticsNowMs() - startedAt,
        details: { reason: 'pro-required' },
      })
      return
    }

    vocabularySyncStatusStore.set('pending-offline')

    const existingFile = (await driveClient.list({ name: VOCABULARY_DRIVE_FILE_NAME }))[0]
    let restoredCount = 0

    if (existingFile) {
      // Lê e mescla o remoto ANTES de publicar: sem isso, um device com tabela
      // vazia (reinstalação, celular novo) apagava o backup no login (bug R01).
      // Se a leitura falhar, o erro sobe pro catch e nada é escrito.
      const remote = await driveClient.getJson<unknown>(existingFile.id)
      if (!isRemoteVocabFile(remote)) {
        throw new Error('vocabulary-remote-invalid-format')
      }
      const localBefore = await db.vocabulary.toArray()
      const toRestore = selectRemoteItemsToRestore(localBefore, remote.items, readPublishedKeys())
      if (toRestore.length > 0) {
        // bulkAdd direto (não addVocabItem) pra não reagendar outro sync.
        await db.vocabulary.bulkAdd(toRestore.map(fromRemoteVocabItem))
        restoredCount = toRestore.length
      }
    }

    // Publica a união (local + o que acabou de ser restaurado).
    const items = await db.vocabulary.orderBy('createdAt').toArray()
    const payload = toRemoteVocabFile(items)

    if (existingFile) {
      await driveClient.updateJson(existingFile.id, payload)
    } else {
      await driveClient.createJson(VOCABULARY_DRIVE_FILE_NAME, payload)
    }

    // Só grava a baseline depois da escrita confirmada no Drive.
    writePublishedKeys(items.map(vocabSyncKey))

    vocabularySyncStatusStore.set('connected')
    logEvent('vocabulary.sync.success', {
      flowId,
      status: 'success',
      durationMs: getDiagnosticsNowMs() - startedAt,
      details: { itemCount: items.length, restoredCount },
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

// Baseline do merge: chaves que este device publicou no último sync com
// sucesso. Fica no localStorage com o nome do banco (já é por conta). Se sumir
// ou falhar, o merge restaura tudo do remoto — lado seguro (nunca perde dados).
function publishedKeysStorageKey(): string {
  return `neoreader:vocab-drive-baseline:${db.name}`
}

function readPublishedKeys(): Set<string> {
  try {
    const raw = localStorage.getItem(publishedKeysStorageKey())
    const parsed: unknown = raw ? JSON.parse(raw) : []
    return new Set(Array.isArray(parsed) ? parsed.filter((k): k is string => typeof k === 'string') : [])
  } catch {
    return new Set()
  }
}

function writePublishedKeys(keys: string[]): void {
  try {
    localStorage.setItem(publishedKeysStorageKey(), JSON.stringify([...new Set(keys)]))
  } catch {
    // Sem baseline o próximo sync só restaura a mais (seguro); não falha o sync.
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
