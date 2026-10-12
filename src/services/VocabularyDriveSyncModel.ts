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

// Valida o formato mínimo do arquivo remoto. Formato desconhecido = não dá pra
// mesclar com segurança, então o sync aborta em vez de sobrescrever.
export function isRemoteVocabFile(value: unknown): value is RemoteVocabFile {
  if (typeof value !== 'object' || value === null) return false
  return Array.isArray((value as { items?: unknown }).items)
}

// Normaliza um item remoto: só `sourceText` é obrigatório (sem ele não há o que
// restaurar). Campos ausentes viram '' em vez de descartar o item — descartar
// faria o próximo publish apagá-lo do Drive. A chave é calculada sobre o item
// normalizado, igual ao que fica salvo no local, pra não restaurar em loop.
export function normalizeRemoteVocabItem(item: unknown): RemoteVocabItem | null {
  if (typeof item !== 'object' || item === null) return null
  const raw = item as Record<string, unknown>
  if (typeof raw.sourceText !== 'string' || raw.sourceText.length === 0) return null
  const text = (value: unknown) => (typeof value === 'string' ? value : '')
  return {
    bookTitle: text(raw.bookTitle),
    sourceText: raw.sourceText,
    translatedText: text(raw.translatedText),
    sourceLang: text(raw.sourceLang),
    targetLang: text(raw.targetLang),
    createdAt: text(raw.createdAt),
  }
}

export function fromRemoteVocabItem(item: RemoteVocabItem): Omit<VocabItem, 'id'> {
  const createdAt = new Date(item.createdAt)
  return {
    bookId: 0, // bookId é local de cada device; 0 = sem livro vinculado
    bookTitle: item.bookTitle,
    sourceText: item.sourceText,
    translatedText: item.translatedText,
    sourceLang: item.sourceLang,
    targetLang: item.targetLang,
    createdAt: Number.isNaN(createdAt.getTime()) ? new Date() : createdAt,
  }
}

// Merge de 3 vias (local × remoto × baseline) que decide o que restaurar no
// local antes de publicar. `baselineKeys` = chaves que ESTE device publicou no
// último sync bem-sucedido. Item remoto ausente no local:
//   - fora da baseline → veio de outro device (ou nunca sincronizamos) → restaura;
//   - dentro da baseline → este device publicou e depois excluiu → não restaura.
// Sem baseline (install novo/storage limpo) restaura tudo: pior caso é
// ressuscitar um item excluído, nunca perder dados.
export function selectRemoteItemsToRestore(
  localItems: Pick<VocabItem, 'bookTitle' | 'sourceText' | 'targetLang'>[],
  remoteItems: unknown[],
  baselineKeys: ReadonlySet<string>,
): RemoteVocabItem[] {
  const localKeys = new Set(localItems.map(vocabSyncKey))
  const seen = new Set<string>()
  const toRestore: RemoteVocabItem[] = []
  for (const rawItem of remoteItems) {
    const item = normalizeRemoteVocabItem(rawItem)
    if (!item) continue
    const key = vocabSyncKey(item)
    if (localKeys.has(key) || baselineKeys.has(key) || seen.has(key)) continue
    seen.add(key) // evita restaurar duplicatas do próprio arquivo remoto
    toRestore.push(item)
  }
  return toRestore
}
