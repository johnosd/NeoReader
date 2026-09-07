import { useState } from 'react'
import { ArrowLeft, ChevronRight, CloudUpload } from 'lucide-react'
import { Badge, ListItem, Spinner } from '../components/ui'
import { SettingsGroup } from '../components/settings/SettingsLayout'
import { useCapacitorBackButton } from '../hooks/useCapacitorAppListener'
import { useEntitlements, useRefreshEntitlementsOnFocus } from '../hooks/useEntitlements'
import { useBookmarkDriveSyncStatus } from '../hooks/useBookmarkDriveSyncStatus'
import { useProgressDriveSyncStatus } from '../hooks/useProgressDriveSyncStatus'
import { useVocabularyDriveSyncStatus } from '../hooks/useVocabularyDriveSyncStatus'
import type { DriveDataSyncStatusCode } from '../services/DriveDataSyncStatus'
import { refreshDriveToken } from '../services/FirebaseAuthService'
import { scheduleVocabularyDriveSync, vocabularySyncStatusStore } from '../services/VocabularyDriveSyncService'
import { progressSyncStatusStore, scheduleProgressDriveSync } from '../services/ProgressDriveSyncService'
import { setBookmarkDriveSyncStatus } from '../services/BookmarkDriveSyncStatus'
import { scheduleBookmarkDriveSync } from '../services/BookmarkDriveSyncService'
import { db } from '../db/database'
import { useI18n, type TranslateFn } from '../i18n'

interface SettingsSyncScreenProps {
  onBack: () => void
}

const DATA_SYNC_CONNECTED_DESC = {
  progress: 'settings.progressSync.description.connected',
  vocabulary: 'settings.vocabularySync.description.connected',
} as const satisfies Record<string, Parameters<TranslateFn>[0]>

const DATA_SYNC_PENDING_DESC = {
  progress: 'settings.progressSync.description.pendingOffline',
  vocabulary: 'settings.vocabularySync.description.pendingOffline',
} as const satisfies Record<string, Parameters<TranslateFn>[0]>

function getDataSyncMeta(
  code: DriveDataSyncStatusCode,
  t: TranslateFn,
  type: 'progress' | 'vocabulary',
): {
  label: string
  description: string
  tone: 'success' | 'warning' | 'error' | 'purple' | 'neutral'
} {
  if (code === 'connected') {
    return {
      label: t('settings.bookmarkSync.status.connected'),
      description: t(DATA_SYNC_CONNECTED_DESC[type]),
      tone: 'success',
    }
  }
  if (code === 'permission-error') {
    return {
      label: t('settings.bookmarkSync.status.permissionError'),
      description: t('settings.bookmarkSync.description.permissionError'),
      tone: 'error',
    }
  }
  if (code === 'pro-required') {
    return {
      label: t('settings.bookmarkSync.status.proRequired'),
      description: t('settings.bookmarkSync.description.proRequired'),
      tone: 'purple',
    }
  }
  return {
    label: t('settings.dataSync.status.pendingOffline'),
    description: t(DATA_SYNC_PENDING_DESC[type]),
    tone: 'neutral',
  }
}

function getBookmarkSyncMeta(
  code: ReturnType<typeof useBookmarkDriveSyncStatus>['code'],
  t: TranslateFn,
): {
  label: string
  description: string
  tone: 'success' | 'warning' | 'error' | 'purple' | 'neutral'
} {
  if (code === 'connected') {
    return {
      label: t('settings.bookmarkSync.status.connected'),
      description: t('settings.bookmarkSync.description.connected'),
      tone: 'success',
    }
  }
  if (code === 'permission-error') {
    return {
      label: t('settings.bookmarkSync.status.permissionError'),
      description: t('settings.bookmarkSync.description.permissionError'),
      tone: 'error',
    }
  }
  if (code === 'pro-required') {
    return {
      label: t('settings.bookmarkSync.status.proRequired'),
      description: t('settings.bookmarkSync.description.proRequired'),
      tone: 'purple',
    }
  }
  return {
    label: t('settings.bookmarkSync.status.pendingOffline'),
    description: t('settings.bookmarkSync.description.pendingOffline'),
    tone: 'warning',
  }
}

export function SettingsSyncScreen({ onBack }: SettingsSyncScreenProps) {
  const { t } = useI18n()
  useCapacitorBackButton(onBack)
  const entitlements = useEntitlements()
  const bookmarkSyncStatus = useBookmarkDriveSyncStatus(entitlements.isPro)
  const progressSyncStatus = useProgressDriveSyncStatus(entitlements.isPro)
  const vocabularySyncStatus = useVocabularyDriveSyncStatus(entitlements.isPro)
  useRefreshEntitlementsOnFocus()
  const [driveReconnecting, setDriveReconnecting] = useState(false)

  // 'pending-offline' cobre tanto "nunca tentou sincronizar" quanto "falhou
  // por um motivo não classificado como permissão" — só existe pra usuário
  // Pro (hooks retornam 'pro-required' direto pra quem não é), então alargar
  // esta condição não expõe a ação de conectar pra usuário Free.
  const needsDriveConnect =
    bookmarkSyncStatus.code === 'permission-error' ||
    progressSyncStatus.code === 'permission-error' ||
    vocabularySyncStatus.code === 'permission-error' ||
    bookmarkSyncStatus.code === 'pending-offline' ||
    progressSyncStatus.code === 'pending-offline' ||
    vocabularySyncStatus.code === 'pending-offline'

  async function handleReconnectDrive() {
    setDriveReconnecting(true)
    // Único ponto do app autorizado a abrir a tela de login/consentimento do
    // Google para o Drive — por isso `userInitiated: true`.
    const outcome = await refreshDriveToken({ userInitiated: true })

    // Sem token novo (usuário cancelou, ou o provedor respondeu sem token),
    // não adianta resetar os status e reagendar tudo: os syncs falhariam de
    // novo e o usuário veria "sincronizando" seguido de erro.
    if (outcome !== 'refreshed') {
      setDriveReconnecting(false)
      return
    }

    // Reseta os 3 status stores para que os guards de permission-error não bloqueiem
    // as novas tentativas de sync após o token ser renovado.
    progressSyncStatusStore.set('pending-offline')
    vocabularySyncStatusStore.set('pending-offline')
    setBookmarkDriveSyncStatus('pending-offline')
    scheduleVocabularyDriveSync()

    // Retry de todos os livros com bookmark local — não só os com syncError
    // gravado. Bookmarks criados/editados enquanto o status era
    // permission-error nunca chegam a tentar sync (scheduleBookmarkDriveSync
    // sai cedo nesse caso), então nunca ganham um syncError pra aparecer aqui
    // — sem esse retry incondicional, ficavam presos em pending-offline pra
    // sempre depois do reconnect.
    const bookmarks = await db.bookmarks.toArray()
    const bookmarkBookIds = [...new Set(bookmarks.map((b) => b.bookId))]
    for (const bookId of bookmarkBookIds) scheduleBookmarkDriveSync(bookId)

    // Retry progress de todos os livros — não há rastreamento de falha por registro
    const progressRecords = await db.progress.toArray()
    const progressBookIds = [...new Set(progressRecords.map((p) => p.bookId))]
    for (const bookId of progressBookIds) scheduleProgressDriveSync(bookId)

    setDriveReconnecting(false)
  }

  const bookmarkSyncMeta = getBookmarkSyncMeta(bookmarkSyncStatus.code, t)
  const progressSyncMeta = getDataSyncMeta(progressSyncStatus.code, t, 'progress')
  const vocabularySyncMeta = getDataSyncMeta(vocabularySyncStatus.code, t, 'vocabulary')

  return (
    <div className="min-h-screen pb-12 bg-bg-base text-text-primary">
      <header className="sticky top-0 z-20 flex items-center gap-3 border-b border-white/5 bg-bg-base/95 px-4 pb-3 pt-10 backdrop-blur">
        <button
          onClick={onBack}
          className="-ml-1 rounded-md p-2 text-text-secondary transition-transform active:scale-90"
          aria-label={t('common.back')}
        >
          <ArrowLeft size={20} />
        </button>
        <div className="min-w-0">
          <h1 className="text-lg font-extrabold tracking-[-0.02em] text-text-primary">{t('settings.cloudSync.sectionLabel')}</h1>
          <p className="text-xs text-text-muted">{t('settings.cloudSync.sectionDescription')}</p>
        </div>
      </header>

      <div className="flex flex-col gap-7 px-4 pt-5">
        <SettingsGroup>
          <ListItem
            leading={<CloudUpload size={20} />}
            title={t('settings.bookmarkSync.title')}
            meta={bookmarkSyncMeta.description}
            trailing={<Badge tone={bookmarkSyncMeta.tone}>{bookmarkSyncMeta.label}</Badge>}
          />
          <ListItem
            leading={<CloudUpload size={20} />}
            title={t('settings.progressSync.title')}
            meta={progressSyncMeta.description}
            trailing={<Badge tone={progressSyncMeta.tone}>{progressSyncMeta.label}</Badge>}
          />
          <ListItem
            leading={<CloudUpload size={20} />}
            title={t('settings.vocabularySync.title')}
            meta={vocabularySyncMeta.description}
            trailing={<Badge tone={vocabularySyncMeta.tone}>{vocabularySyncMeta.label}</Badge>}
            divider={needsDriveConnect}
          />
          {needsDriveConnect && (
            <ListItem
              leading={driveReconnecting ? <Spinner tone="purple" label="" /> : <CloudUpload size={20} />}
              title={t('settings.cloudSync.reconnect.title')}
              meta={t('settings.cloudSync.reconnect.description')}
              trailing={<ChevronRight size={18} className="text-text-subtle" />}
              divider={false}
              onClick={driveReconnecting ? undefined : () => { void handleReconnectDrive() }}
            />
          )}
        </SettingsGroup>
      </div>
    </div>
  )
}
