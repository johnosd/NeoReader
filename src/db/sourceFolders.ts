import { db } from './database'
import type { SourceFolder } from '../types/book'

export async function saveSourceFolder(folder: Omit<SourceFolder, 'id'>): Promise<number> {
  const existing = await db.sourceFolders.where('uri').equals(folder.uri).first()
  if (existing?.id !== undefined) {
    await db.sourceFolders.update(existing.id, {
      ...folder,
      createdAt: existing.createdAt,
      lastScannedAt: folder.lastScannedAt ?? new Date(),
    })
    return existing.id
  }

  return db.sourceFolders.add(folder)
}

export async function updateSourceFolderScan(id: number, lastScannedAt = new Date()): Promise<void> {
  await db.sourceFolders.update(id, { lastScannedAt })
}
