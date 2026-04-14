import { db } from './database'
import type { VocabItem } from '../types/vocabulary'

export async function addVocabItem(item: Omit<VocabItem, 'id'>): Promise<number> {
  return db.vocabulary.add(item)
}

export async function deleteVocabItem(id: number): Promise<void> {
  return db.vocabulary.delete(id)
}
