import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { SettingsSyncScreen } from '@/screens/SettingsSyncScreen'

const mocks = vi.hoisted(() => ({
  useEntitlements: vi.fn(),
  bookmarksToArray: vi.fn(),
  progressToArray: vi.fn(),
  refreshDriveToken: vi.fn(),
  scheduleBookmarkDriveSync: vi.fn(),
  scheduleProgressDriveSync: vi.fn(),
  scheduleVocabularyDriveSync: vi.fn(),
}))

vi.mock('@capacitor/app', () => ({
  App: {
    addListener: vi.fn(async () => ({ remove: vi.fn() })),
  },
}))

vi.mock('@/hooks/useEntitlements', () => ({
  useEntitlements: mocks.useEntitlements,
  useRefreshEntitlementsOnFocus: () => undefined,
}))

// handleReconnectDrive toca em db/rede real — mockado pra isolar só a lógica
// de quais bookIds são re-agendados (o que este bug é sobre).
vi.mock('@/db/database', () => ({
  db: {
    bookmarks: { toArray: mocks.bookmarksToArray },
    progress: { toArray: mocks.progressToArray },
  },
}))

vi.mock('@/services/FirebaseAuthService', () => ({
  refreshDriveToken: mocks.refreshDriveToken,
}))

vi.mock('@/services/BookmarkDriveSyncService', () => ({
  scheduleBookmarkDriveSync: mocks.scheduleBookmarkDriveSync,
}))

// progressSyncStatusStore/vocabularySyncStatusStore precisam continuar reais
// (useProgressDriveSyncStatus/useVocabularyDriveSyncStatus dependem deles via
// useSyncExternalStore) — só as funções de agendar sync são substituídas.
vi.mock('@/services/ProgressDriveSyncService', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/services/ProgressDriveSyncService')>()),
  scheduleProgressDriveSync: mocks.scheduleProgressDriveSync,
}))

vi.mock('@/services/VocabularyDriveSyncService', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/services/VocabularyDriveSyncService')>()),
  scheduleVocabularyDriveSync: mocks.scheduleVocabularyDriveSync,
}))

function freeEntitlements() {
  return {
    isPro: false,
    isLoading: false,
    expiresAt: undefined,
    activeProductId: undefined,
    refresh: vi.fn(),
  }
}

function proEntitlements() {
  return {
    isPro: true,
    isLoading: false,
    expiresAt: undefined,
    activeProductId: 'pro-lifetime',
    refresh: vi.fn(),
  }
}

describe('SettingsSyncScreen', () => {
  beforeEach(() => {
    mocks.useEntitlements.mockReturnValue(freeEntitlements())
    mocks.bookmarksToArray.mockResolvedValue([])
    mocks.progressToArray.mockResolvedValue([])
    mocks.refreshDriveToken.mockResolvedValue('refreshed')
  })

  it('mostra sync de bookmarks como recurso Pro nas configuracoes', async () => {
    render(<SettingsSyncScreen onBack={vi.fn()} />)

    await screen.findByText('Backup de bookmarks')

    expect(screen.getByText('Backup de bookmarks')).toBeTruthy()
    // Os três itens de sync (bookmarks, progress, vocabulary) mostram "Recurso Pro" quando isPro=false
    expect(screen.getAllByText('Recurso Pro').length).toBeGreaterThan(0)
    // getDataSyncMeta reutiliza a mesma descrição pro-required para os três tipos de sync
    expect(screen.getAllByText(/Bookmarks locais continuam disponiveis/).length).toBeGreaterThan(0)
    // Sem nada pra conectar quando o usuário nem é Pro
    expect(screen.queryByText('Conectar Google Drive')).toBeNull()
  })

  it('mostra acao de conectar Google Drive pra usuario Pro que nunca sincronizou (pending-offline)', async () => {
    mocks.useEntitlements.mockReturnValue(proEntitlements())

    render(<SettingsSyncScreen onBack={vi.fn()} />)

    await screen.findByText('Backup de bookmarks')

    expect(screen.getByText('Conectar Google Drive')).toBeTruthy()
    expect(screen.getByText('Toque para autorizar o acesso ao Google Drive.')).toBeTruthy()
  })

  it('reconectar re-agenda bookmarks de todos os livros, mesmo sem syncError registrado', async () => {
    mocks.useEntitlements.mockReturnValue(proEntitlements())
    // Livro 42: bookmark nunca tentou sincronizar (syncError null) — nasceu
    // assim porque scheduleBookmarkDriveSync descarta chamadas enquanto o
    // status é permission-error, sem nunca gravar erro nenhum.
    // Livro 7: bookmark com erro já registrado (caso que já funcionava).
    mocks.bookmarksToArray.mockResolvedValue([
      { id: 1, bookId: 42, syncError: null },
      { id: 2, bookId: 7, syncError: 'permission-denied:403' },
    ])

    render(<SettingsSyncScreen onBack={vi.fn()} />)

    fireEvent.click(await screen.findByText('Conectar Google Drive'))

    await waitFor(() => {
      expect(mocks.scheduleBookmarkDriveSync).toHaveBeenCalledWith(42)
    })
    expect(mocks.scheduleBookmarkDriveSync).toHaveBeenCalledWith(7)
    expect(mocks.refreshDriveToken).toHaveBeenCalledWith({ userInitiated: true })
  })

  it('reconectar cancelado nao reseta status nem re-agenda sync', async () => {
    mocks.useEntitlements.mockReturnValue(proEntitlements())
    // Usuário cancelou a tela do Google: reagendar tudo faria os syncs
    // falharem de novo e piscarem "sincronizando" antes do erro.
    mocks.refreshDriveToken.mockResolvedValue('failed')
    mocks.bookmarksToArray.mockResolvedValue([{ id: 1, bookId: 42, syncError: null }])

    render(<SettingsSyncScreen onBack={vi.fn()} />)

    fireEvent.click(await screen.findByText('Conectar Google Drive'))

    await waitFor(() => {
      expect(mocks.refreshDriveToken).toHaveBeenCalled()
    })
    expect(mocks.scheduleBookmarkDriveSync).not.toHaveBeenCalled()
    expect(mocks.scheduleProgressDriveSync).not.toHaveBeenCalled()
    expect(mocks.scheduleVocabularyDriveSync).not.toHaveBeenCalled()
  })
})
