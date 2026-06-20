import { db } from './database'
import type { VocabItem } from '../types/vocabulary'
import { scheduleVocabularyDriveSync } from '../services/VocabularyDriveSyncService'

export async function addVocabItem(item: Omit<VocabItem, 'id'>): Promise<number> {
  const id = await db.vocabulary.add(item)
  scheduleVocabularyDriveSync()
  return id
}

export async function deleteVocabItem(id: number): Promise<void> {
  await db.vocabulary.delete(id)
  scheduleVocabularyDriveSync()
}

// Retorna todos os itens do vocabulário, do mais recente ao mais antigo
export async function getAllVocabItems(): Promise<VocabItem[]> {
  return db.vocabulary.orderBy('createdAt').reverse().toArray()
}

// Retorna as frases originais salvas para um livro específico (para highlight no leitor)
export async function getVocabSourceTextsByBookId(bookId: number): Promise<string[]> {
  const items = await db.vocabulary.where('bookId').equals(bookId).toArray()
  return items.map((item) => item.sourceText).filter((t): t is string => Boolean(t))
}
