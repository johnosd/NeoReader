import { beforeEach, describe, expect, it, vi } from 'vitest'

// Backup das API keys em Capacitor Preferences precisa ser por conta
// (sdd/bugs/backup-api-keys-atravessa-contas). O "dono" é o nome do banco Dexie.
const mocks = vi.hoisted(() => {
  const prefs = new Map<string, string>()
  let stored: unknown = undefined
  const db = {
    name: 'NeoReaderDB-account-B',
    settings: {
      toCollection: () => ({ first: async () => stored }),
      put: vi.fn(async (next: unknown) => { stored = next }),
    },
    transaction: async (_mode: string, _table: unknown, callback: () => Promise<unknown>) => callback(),
  }
  return {
    prefs,
    db,
    reset: () => { prefs.clear(); stored = undefined; db.settings.put.mockClear() },
  }
})

vi.mock('@/db/database', () => ({ db: mocks.db }))
vi.mock('@capacitor/core', () => ({ Capacitor: { isNativePlatform: () => true } }))
vi.mock('@capacitor/preferences', () => ({ Preferences: {
  get: async ({ key }: { key: string }) => ({ value: mocks.prefs.has(key) ? mocks.prefs.get(key)! : null }),
  set: async ({ key, value }: { key: string; value: string }) => { mocks.prefs.set(key, value) },
  remove: async ({ key }: { key: string }) => { mocks.prefs.delete(key) },
}}))

import { getSettings, updateAppSettings } from '@/db/settings'

describe('backup de API keys por conta', () => {
  beforeEach(() => {
    mocks.reset()
    mocks.db.name = 'NeoReaderDB-account-B'
  })

  it('conta nova não herda o backup legado nem o de outra conta', async () => {
    mocks.prefs.set('neoreader:settings:speechifyApiKey', 'key-of-account-A')
    mocks.prefs.set('neoreader:settings:NeoReaderDB-account-A:speechifyApiKey', 'key-of-account-A')

    const settings = await getSettings()

    expect(settings.appSettings.speechifyApiKey).toBe('')
    expect(mocks.db.settings.put).not.toHaveBeenCalled()
  })

  it('restaura o backup namespaced da própria conta', async () => {
    mocks.prefs.set('neoreader:settings:NeoReaderDB-account-B:speechifyApiKey', 'key-of-account-B')

    const settings = await getSettings()

    expect(settings.appSettings.speechifyApiKey).toBe('key-of-account-B')
  })

  it('banco legado migra a chave antiga sem namespace', async () => {
    mocks.db.name = 'NeoReaderDB'
    mocks.prefs.set('neoreader:settings:fishAudioApiKey', 'legacy-owner-key')

    const settings = await getSettings()

    expect(settings.appSettings.fishAudioApiKey).toBe('legacy-owner-key')
  })

  it('banco legado não ressuscita a chave antiga depois que o backup namespaced existe', async () => {
    mocks.db.name = 'NeoReaderDB'
    mocks.prefs.set('neoreader:settings:fishAudioApiKey', 'legacy-owner-key')
    mocks.prefs.set('neoreader:settings:NeoReaderDB:fishAudioApiKey', '')

    const settings = await getSettings()

    expect(settings.appSettings.fishAudioApiKey).toBe('')
  })

  it('updateAppSettings grava na chave da conta e remove a legada no banco legado', async () => {
    mocks.db.name = 'NeoReaderDB'
    mocks.prefs.set('neoreader:settings:speechifyApiKey', 'legacy-owner-key')

    await updateAppSettings({ speechifyApiKey: '' })
    // backupApiKeys é fire-and-forget; espera as promises pendentes.
    await vi.waitFor(() => expect(mocks.prefs.has('neoreader:settings:speechifyApiKey')).toBe(false))

    expect(mocks.prefs.get('neoreader:settings:NeoReaderDB:speechifyApiKey')).toBe('')
    expect((await getSettings()).appSettings.speechifyApiKey).toBe('')
  })

  it('updateAppSettings em outra conta não toca no backup legado', async () => {
    mocks.prefs.set('neoreader:settings:speechifyApiKey', 'legacy-owner-key')

    await updateAppSettings({ speechifyApiKey: 'key-of-account-B' })
    await vi.waitFor(() =>
      expect(mocks.prefs.get('neoreader:settings:NeoReaderDB-account-B:speechifyApiKey')).toBe('key-of-account-B'))

    expect(mocks.prefs.get('neoreader:settings:speechifyApiKey')).toBe('legacy-owner-key')
  })
})
