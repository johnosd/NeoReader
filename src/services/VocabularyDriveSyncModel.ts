import type { VocabItem } from '../types/vocabulary'

export const VOCABULARY_DRIVE_SYNC_SCHEMA_VERSION = 1
export const VOCABULARY_DRIVE_FILE_NAME = 'neoreader-vocabulary-v1.json'

export interface RemoteVocabItem {
  // Identidade estável: bookTitle em vez de bookId (ID local, varia entre devices)
  bookTitle: string
  sourceText: string
  translatedText: string
  sourceLang: string
  targetLang: string
  createdAt: string // ISO
}

export interface RemoteVocabFile {
  schemaVersion: typeof VOCABULARY_DRIVE_SYNC_SCHEMA_VERSION
  updatedAt: string // ISO do item mais recente
  items: RemoteVocabItem[]
}

// Chave de deduplicação estável entre dispositivos
export function vocabSyncKey(item: Pick<VocabItem | RemoteVocabItem, 'bookTitle' | 'sourceText' | 'targetLang'>): string {
  return `${item.bookTitle}::${item.sourceText}::${item.targetLang}`
}

export function toRemoteVocabItem(item: VocabItem): RemoteVocabItem {
  return {
    bookTitle: item.bookTitle,
    sourceText: item.sourceText,
    translatedText: item.translatedText,
    sourceLang: item.sourceLang,
    targetLang: item.targetLang,
    createdAt: new Date(item.createdAt).toISOString(),
  }
}

export function toRemoteVocabFile(items: VocabItem[]): RemoteVocabFile {
  const remoteItems = items.map(toRemoteVocabItem)
  const latestDate = items.reduce(
    (max, item) => Math.max(max, new Date(item.createdAt).getTime()),
    0,
  )
  return {
    schemaVersion: VOCABULARY_DRIVE_SYNC_SCHEMA_VERSION,
    updatedAt: latestDate > 0 ? new Date(latestDate).toISOString() : new Date().toISOString(),
    items: remoteItems,
  }
}
