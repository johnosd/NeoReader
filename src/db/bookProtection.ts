import { db } from './database'
import { BOOK_PROTECTION_ID, type BookProtectionRecord } from '../types/bookProtection'

// Repositório "burro" do singleton do PIN (feature 024): só lê/grava/apaga.
// Hash, espera por erros e orquestração ficam em BookProtectionService.

export async function getBookProtection(): Promise<BookProtectionRecord | undefined> {
  return db.bookProtection.get(BOOK_PROTECTION_ID)
}

// `put` cria ou substitui o registro inteiro (a chave é sempre o id fixo 1).
export async function saveBookProtection(record: BookProtectionRecord): Promise<void> {
  await db.bookProtection.put({ ...record, id: BOOK_PROTECTION_ID })
}

export async function clearBookProtection(): Promise<void> {
  await db.bookProtection.delete(BOOK_PROTECTION_ID)
}
