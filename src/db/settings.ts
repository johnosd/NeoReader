import { db } from './database'
import {
  normalizeUserSettings,
  type AppSettings,
  type ReaderDefaults,
  type UserSettings,
} from '../types/settings'

// Retorna as configurações do usuário. Se não existir ainda, devolve os defaults
// em memória. Registros legados são normalizados no formato novo.
export async function getSettings(): Promise<UserSettings> {
  const record = await db.settings.toCollection().first()
  return normalizeUserSettings(record)
}

async function upsertSettings(patch: {
  appSettings?: Partial<AppSettings>
  readerDefaults?: Partial<ReaderDefaults>
}): Promise<void> {
  const existing = await db.settings.toCollection().first()
  const normalized = normalizeUserSettings(existing)
  const nextSettings: UserSettings = {
    ...(existing?.id !== undefined ? { id: existing.id } : {}),
    appSettings: {
      ...normalized.appSettings,
      ...patch.appSettings,
    },
    readerDefaults: {
      ...normalized.readerDefaults,
      ...patch.readerDefaults,
    },
    updatedAt: new Date(),
  }

  await db.settings.put(nextSettings)
}

export async function updateAppSettings(patch: Partial<AppSettings>): Promise<void> {
  await upsertSettings({ appSettings: patch })
}

export async function updateReaderDefaults(patch: Partial<ReaderDefaults>): Promise<void> {
  await upsertSettings({ readerDefaults: patch })
}
