import { Capacitor } from '@capacitor/core'
import { Preferences } from '@capacitor/preferences'
import { db } from './database'
import {
  normalizeUserSettings,
  type AppSettings,
  type ReaderDefaults,
  type UserSettings,
} from '../types/settings'

// Chaves de API salvas no SharedPreferences do Android (sobrevive a updates e
// limpeza de cache da WebView, ao contrário do IndexedDB/localStorage).
const API_KEY_FIELDS = ['speechifyApiKey', 'elevenLabsApiKey', 'fishAudioApiKey', 'youtubeApiKey'] as const
type ApiKeyField = typeof API_KEY_FIELDS[number]

function prefKey(field: ApiKeyField) {
  return `neoreader:settings:${field}`
}

async function backupApiKeys(appSettings: AppSettings): Promise<void> {
  if (!Capacitor.isNativePlatform()) return
  await Promise.all(
    API_KEY_FIELDS.map(field => Preferences.set({ key: prefKey(field), value: appSettings[field] }))
  )
}

async function restoreApiKeysFromPreferences(): Promise<Partial<AppSettings> | null> {
  if (!Capacitor.isNativePlatform()) return null
  const entries = await Promise.all(
    API_KEY_FIELDS.map(async field => {
      const { value } = await Preferences.get({ key: prefKey(field) })
      return [field, value ?? ''] as const
    })
  )
  const restored = Object.fromEntries(entries) as Pick<AppSettings, ApiKeyField>
  return API_KEY_FIELDS.some(f => restored[f] !== '') ? restored : null
}

// Retorna as configurações do usuário. Se não existir ainda, devolve os defaults
// em memória. Registros legados são normalizados no formato novo.
export async function getSettings(): Promise<UserSettings> {
  const record = await db.settings.toCollection().first()
  const normalized = normalizeUserSettings(record)

  // Restauração após perda de dados (ex: WebView limpa o IndexedDB em update/reinstall).
  // Só tenta se todas as API keys estiverem vazias — não sobrescreve se o usuário
  // limpou as chaves intencionalmente (nesse caso o backup também estaria vazio).
  const allKeysEmpty = API_KEY_FIELDS.every(f => !normalized.appSettings[f])
  if (allKeysEmpty) {
    const restored = await restoreApiKeysFromPreferences()
    if (restored) {
      await upsertSettings({ appSettings: restored })
      return normalizeUserSettings({ ...record, appSettings: { ...normalized.appSettings, ...restored } })
    }
  }

  return normalized
}

async function upsertSettings(patch: {
  appSettings?: Partial<AppSettings>
  readerDefaults?: Partial<ReaderDefaults>
}): Promise<UserSettings> {
  let nextSettings!: UserSettings
  await db.transaction('rw', db.settings, async () => {
    const existing = await db.settings.toCollection().first()
    const normalized = normalizeUserSettings(existing)
    nextSettings = {
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
  })
  return nextSettings
}

export async function updateAppSettings(patch: Partial<AppSettings>): Promise<void> {
  const saved = await upsertSettings({ appSettings: patch })
  // Backup no SharedPreferences — fire-and-forget, falha não bloqueia o fluxo
  void backupApiKeys(saved.appSettings)
}

export async function updateReaderDefaults(patch: Partial<ReaderDefaults>): Promise<void> {
  await upsertSettings({ readerDefaults: patch })
}
