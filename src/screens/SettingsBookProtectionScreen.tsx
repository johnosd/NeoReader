import { useCallback, useEffect, useState } from 'react'
import { ArrowLeft, KeyRound, Lock, ShieldOff } from 'lucide-react'
import { Button, ListItem, Toast } from '../components/ui'
import { SettingsGroup } from '../components/settings/SettingsLayout'
import { BookProtectionService } from '../services/BookProtectionService'
import { useCapacitorBackButton } from '../hooks/useCapacitorAppListener'
import { useBookLockStore } from '../store/bookLockStore'
import { useI18n, type MessageKey } from '../i18n'

interface SettingsBookProtectionScreenProps {
  onBack: () => void
}

// Configurações > Livros protegidos (feature 024): alterar o PIN e desativar a proteção.
// Alterar e desativar pedem o PIN atual SEMPRE, mesmo com o app já desbloqueado (FR-014).
export function SettingsBookProtectionScreen({ onBack }: SettingsBookProtectionScreenProps) {
  const { t } = useI18n()
  const [hasPin, setHasPin] = useState<boolean | null>(null)
  const [confirmingDisable, setConfirmingDisable] = useState(false)
  const [toast, setToast] = useState<MessageKey | null>(null)
  const [busy, setBusy] = useState(false)
  const unlocked = useBookLockStore((state) => state.unlocked)

  useCapacitorBackButton(() => {
    if (confirmingDisable) { setConfirmingDisable(false); return }
    onBack()
  })

  const refresh = useCallback(async () => {
    setHasPin(await BookProtectionService.hasPin())
  }, [])

  useEffect(() => {
    let active = true
    void BookProtectionService.hasPin().then((value) => { if (active) setHasPin(value) })
    return () => { active = false }
  }, [])

  async function handleChange() {
    if (busy) return
    setBusy(true)
    try {
      // force: pede o PIN atual mesmo desbloqueado.
      if (!(await useBookLockStore.getState().requestUnlock({ force: true }))) return
      if (await useBookLockStore.getState().requestPinSetup('change')) setToast('bookLock.settings.changed')
    } finally {
      setBusy(false)
    }
  }

  async function handleAskDisable() {
    if (busy) return
    setBusy(true)
    try {
      if (await useBookLockStore.getState().requestUnlock({ force: true })) setConfirmingDisable(true)
    } finally {
      setBusy(false)
    }
  }

  async function handleDisable() {
    if (busy) return
    setBusy(true)
    try {
      await BookProtectionService.disable()
      setConfirmingDisable(false)
      setToast('bookLock.settings.disabled')
      await refresh()
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="min-h-screen bg-bg-base pb-12 text-text-primary">
      <header className="sticky top-0 z-20 flex items-center gap-3 border-b border-white/5 bg-bg-base/95 px-4 pb-3 pt-10 backdrop-blur">
        <button
          onClick={onBack}
          className="-ml-1 rounded-md p-2 text-text-secondary transition-transform active:scale-90"
          aria-label={t('common.back')}
        >
          <ArrowLeft size={20} />
        </button>
        <h1 className="text-lg font-extrabold tracking-[-0.02em]">{t('bookLock.settings.title')}</h1>
      </header>

      <div className="flex flex-col gap-5 px-4 pt-5">
        <p className="px-1 text-sm text-text-muted">
          {hasPin ? t('bookLock.settings.hasPin') : t('bookLock.settings.noPin')}
        </p>

        {hasPin && (
          <SettingsGroup>
            <ListItem
              leading={<KeyRound size={20} className="text-purple-light" />}
              title={t('bookLock.settings.change')}
              onClick={() => void handleChange()}
              disabled={busy}
            />
            {unlocked && (
              <ListItem
                leading={<Lock size={20} className="text-purple-light" />}
                title={t('bookLock.action.lockNow')}
                meta={t('bookLock.action.lockNow.description')}
                onClick={() => useBookLockStore.getState().lock()}
              />
            )}
            <ListItem
              leading={<ShieldOff size={20} className="text-error" />}
              title={<span className="text-error">{t('bookLock.settings.disable')}</span>}
              meta={t('bookLock.settings.disable.description')}
              onClick={() => void handleAskDisable()}
              disabled={busy}
              divider={false}
            />
          </SettingsGroup>
        )}

        {confirmingDisable && (
          <div className="rounded-md border border-error/30 bg-error/15 px-4 py-3">
            <p className="text-sm font-semibold text-error">{t('bookLock.settings.disable.confirmTitle')}</p>
            <p className="mt-1 text-xs text-error/75">{t('bookLock.settings.disable.confirmBody')}</p>
            <div className="mt-3 flex gap-2">
              <Button variant="ghost" size="sm" onClick={() => setConfirmingDisable(false)} disabled={busy}>
                {t('common.cancel')}
              </Button>
              <Button variant="danger" size="sm" onClick={() => void handleDisable()} disabled={busy}>
                {t('bookLock.settings.disable.confirm')}
              </Button>
            </div>
          </div>
        )}
      </div>

      {toast && (
        <Toast tone="success" onDismiss={() => setToast(null)}>
          {t(toast)}
        </Toast>
      )}
    </div>
  )
}
