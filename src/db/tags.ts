import { db } from './database'
import type { BookTag } from '../types/book'

export async function createTag(name: string, color?: string | null): Promise<number> {
  const normalizedName = normalizeTagName(name)
  const existing = await db.tags.where('name').equalsIgnoreCase(normalizedName).first()
  if (existing?.id !== undefined) return existing.id

  const now = new Date()
  return db.tags.add({
    name: normalizedName,
    color: color ?? null,
    createdAt: now,
    updatedAt: now,
  })
}

export async function renameTag(id: number, name: string): Promise<void> {
  await db.tags.update(id, {
    name: normalizeTagName(name),
    updatedAt: new Date(),
  })
}

export async function deleteTag(id: number): Promise<void> {
  await db.transaction('rw', [db.tags, db.books], async () => {
    await db.books
      .where('tags')
      .equals(id)
      .modify((book) => {
        book.tags = (book.tags ?? []).filter((tagId) => tagId !== id)
      })
    await db.tags.delete(id)
  })
}

export async function getAllTags(): Promise<BookTag[]> {
  return db.tags.orderBy('name').toArray()
}

export function normalizeTagName(name: string): string {
  const normalized = name.trim().replace(/\s+/g, ' ')
  if (!normalized) throw new Error('Informe um nome de tag.')
  return normalized
}
