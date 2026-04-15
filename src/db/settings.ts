import { db } from './database'
import { DEFAULT_SETTINGS, type UserSettings } from '../types/settings'

// Retorna as configurações do usuário. Se não existir ainda, retorna os defaults
// (sem salvar — lazy initialization).
export async function getSettings(): Promise<UserSettings> {
  const record = await db.settings.toCollection().first()
  return record ?? { ...DEFAULT_SETTINGS }
}

// Upsert parcial: atualiza campos específicos sem sobrescrever o restante.
// Se não existir registro, cria um novo com defaults + patch.
export async function updateSettings(patch: Partial<Omit<UserSettings, 'id'>>): Promise<void> {
  const existing = await db.settings.toCollection().first()
  const now = new Date()

  if (existing?.id !== undefined) {
    await db.settings.update(existing.id, { ...patch, updatedAt: now })
  } else {
    await db.settings.add({ ...DEFAULT_SETTINGS, ...patch, updatedAt: now })
  }
}
