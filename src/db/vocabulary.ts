import { db } from './database'
import type { VocabItem } from '../types/vocabulary'

export async function addVocabItem(item: Omit<VocabItem, 'id'>): Promise<number> {
  return db.vocabulary.add(item)
}

export async function deleteVocabItem(id: number): Promise<void> {
  return db.vocabulary.delete(id)
}

// Retorna todos os itens do vocabulário, do mais recente ao mais antigo
export async function getAllVocabItems(): Promise<VocabItem[]> {
  return db.vocabulary.orderBy('createdAt').reverse().toArray()
}
