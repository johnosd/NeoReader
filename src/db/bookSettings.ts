import { db } from './database'
import type { BookSettings } from '../types/book'

function getSettingsTimestamp(settings: BookSettings): number {
  if (!settings.updatedAt) return 0
  return new Date(settings.updatedAt).getTime()
}

function sortSettingsRowsForMerge(rows: BookSettings[]): BookSettings[] {
  return [...rows].sort((a, b) => (
    getSettingsTimestamp(a) - getSettingsTimestamp(b)
    || (a.id ?? 0) - (b.id ?? 0)
  ))
}

function getPrimarySettingsRow(rows: BookSettings[]): BookSettings {
  return [...rows].sort((a, b) => (a.id ?? 0) - (b.id ?? 0))[0]
}

function mergeSettingsRows(bookId: number, rows: BookSettings[]): BookSettings {
  return sortSettingsRowsForMerge(rows).reduce<BookSettings>((merged, row) => {
    const { id, bookId: _rowBookId, ...values } = row
    void id
    void _rowBookId

    for (const [key, value] of Object.entries(values) as Array<[keyof Omit<BookSettings, 'id' | 'bookId'>, unknown]>) {
      if (value !== undefined) {
        Object.assign(merged, { [key]: value })
      }
    }

    return merged
  }, { bookId })
}

async function compactDuplicateSettingsRows(
  rows: BookSettings[],
  merged: BookSettings,
): Promise<BookSettings> {
  const primary = getPrimarySettingsRow(rows)
  if (primary.id === undefined) return merged

  const normalized: BookSettings = {
    ...merged,
    id: primary.id,
    bookId: primary.bookId,
  }
  const { id, ...updatePatch } = normalized
  void id

  await db.bookSettings.update(primary.id, updatePatch)

  const duplicateIds = rows
    .map((row) => row.id)
    .filter((rowId): rowId is number => rowId !== undefined && rowId !== primary.id)

  if (duplicateIds.length > 0) {
    await db.bookSettings.bulkDelete(duplicateIds)
  }

  return normalized
}

export async function getBookSettings(bookId: number): Promise<BookSettings> {
  const rows = await db.bookSettings.where('bookId').equals(bookId).toArray()
  if (rows.length === 0) return { bookId }

  const merged = mergeSettingsRows(bookId, rows)
  if (rows.length === 1) return { ...rows[0], ...merged }

  return compactDuplicateSettingsRows(rows, merged)
}

export async function updateBookSettings(
  bookId: number,
  patch: Partial<Omit<BookSettings, 'id' | 'bookId'>>,
): Promise<void> {
  await db.transaction('rw', db.bookSettings, async () => {
    const rows = await db.bookSettings.where('bookId').equals(bookId).toArray()
    const updatedAt = new Date()
    const merged = rows.length > 0 ? mergeSettingsRows(bookId, rows) : { bookId }
    const next: BookSettings = {
      ...merged,
      ...patch,
      bookId,
      updatedAt,
    }

    if (rows.length === 0) {
      await db.bookSettings.add(next)
      return
    }

    await compactDuplicateSettingsRows(rows, next)
  })
}
