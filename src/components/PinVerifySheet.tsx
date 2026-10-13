import { useEffect, useId, useState } from 'react'
import { Lock } from 'lucide-react'
import { PinPad } from './PinPad'
import { Button } from './ui'
import { BookProtectionService } from '../services/BookProtectionService'
import { useCapacitorBackButton } from '../hooks/useCapacitorAppListener'
import { useBookLockStore } from '../store/bookLockStore'
import type { OwnershipResult } from '../services/BookProtectionService'
import { PIN_MIN_LENGTH } from '../utils/pinCrypto'
import { useI18n, type MessageKey } from '../i18n'

// Mensagem de cada desfecho da confirmação que não leva ao PIN novo.
const RECOVERY_NOTICE: Record<Exclude<OwnershipResult, 'confirmed' | 'no-device-lock'>, MessageKey> = {
  cancelled: 'bookLock.recovery.cancelled',
  'different-account': 'bookLock.recovery.differentAccount',
  offline: 'bookLock.recovery.offline',
  failed: 'bookLock.recovery.failed',
}

// "mm:ss" da espera restante. 30 s vira "0:30"; o teto de 1 h vira "60:00".
function formatWait(remainingMs: number): string {
  const totalSeconds = Math.ceil(remainingMs / 1000)
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60
  return `${minutes}:${String(seconds).padStart(2, '0')}`
}

// Pedido de PIN em tela cheia e opaca (feature 024). Opaca de propósito: o conteúdo do
// livro por baixo não pode aparecer (FR-010). Fica acima dos BottomSheets (z-2000/2001)
// e do cobertor do BookLockGate (z-2050).
export function PinVerifySheet() {
  const { t } = useI18n()
  const titleId = useId()
  const settlePrompt = useBookLockStore((state) => state.settlePrompt)
  const [pin, setPin] = useState('')
  const [error, setError] = useState<'wrong' | 'failed' | null>(null)
  const [busy, setBusy] = useState(false)
  const [lockedUntil, setLockedUntil] = useState(0)
  const [now, setNow] = useState(() => Date.now())
  const [notice, setNotice] = useState<MessageKey | null>(null)
  const [confirmNoLock, setConfirmNoLock] = useState(false)

  // Carrega a espera persistida (fechar e reabrir o app não zera a contagem, FR-011).
  // Sem registro de PIN (ex.: banco restaurado em parte) não há o que pedir.
  useEffect(() => {
    let active = true
    void (async () => {
      if (!(await BookProtectionService.hasPin())) {
        if (active) settlePrompt(true)
        return
      }
      const status = await BookProtectionService.getLockoutStatus()
      if (active) {
        // max: se uma verificação já registrou uma espera mais nova, esta leitura (mais
        // antiga) não pode sobrescrevê-la.
        setLockedUntil((current) => Math.max(current, status.lockedUntil))
        setNow(Date.now())
      }
    })()
    return () => { active = false }
  }, [settlePrompt])

  const remainingMs = Math.max(0, lockedUntil - now)
  const waiting = remainingMs > 0

  // Relógio da contagem regressiva; para sozinho quando a espera acaba.
  useEffect(() => {
    if (!waiting) return
    const id = window.setInterval(() => setNow(Date.now()), 500)
    return () => window.clearInterval(id)
  }, [waiting])

  // setTimeout(0): os demais listeners de `backButton` do MESMO evento (telas por baixo)
  // ainda precisam ver o prompt aberto para se ignorarem — ver useCapacitorAppListener.
  useCapacitorBackButton(() => {
    // Com a criação do PIN novo aberta por cima (recuperação), o voltar é dela, não deste.
    if (useBookLockStore.getState().setup !== null) return
    window.setTimeout(() => settlePrompt(false), 0)
  }, { ignoreLockPromptGuard: true })

  // "Esqueci o PIN": prova de que é o dono do aparelho e, se confirmada, define um PIN
  // novo (os livros seguem protegidos). Nunca troca a sessão do Firebase (D-09).
  async function startRecovery() {
    if (busy) return
    setBusy(true)
    setNotice(null)
    try {
      const result = await BookProtectionService.confirmOwnership({
        title: t('bookLock.recovery.deviceTitle'),
        description: t('bookLock.recovery.deviceDescription'),
      })
      if (result === 'confirmed') await resetPin()
      else if (result === 'no-device-lock') setConfirmNoLock(true)
      else setNotice(RECOVERY_NOTICE[result])
    } finally {
      setBusy(false)
    }
  }

  async function resetPin() {
    setConfirmNoLock(false)
    const done = await useBookLockStore.getState().requestPinSetup('reset')
    if (done) settlePrompt(true)
  }

  async function submit() {
    if (busy || waiting || pin.length < PIN_MIN_LENGTH) return
    setBusy(true)
    setError(null)
    try {
      const result = await BookProtectionService.verify(pin)
      if (result.ok) {
        settlePrompt(true)
        return
      }
      setPin('')
      setError('wrong')
      if (result.lockedUntil > Date.now()) {
        setLockedUntil(result.lockedUntil)
        setNow(Date.now())
      }
    } catch {
      setError('failed')
    } finally {
      setBusy(false)
    }
  }

  const message = waiting
    ? t('bookLock.verify.waiting', { time: formatWait(remainingMs) })
    : error === 'wrong'
      ? t('bookLock.verify.wrong')
      : error === 'failed'
        ? t('bookLock.verify.error')
        : ''

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      className="fixed inset-0 z-[2100] flex flex-col overflow-y-auto bg-bg-base text-text-primary"
      style={{ paddingTop: 'env(safe-area-inset-top, 0px)', paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}
    >
      <div className="flex flex-1 flex-col items-center justify-center gap-5 px-6 py-8">
        <span className="flex h-14 w-14 items-center justify-center rounded-full bg-purple-primary/20 text-purple-light">
          <Lock size={26} aria-hidden="true" />
        </span>
        <div className="text-center">
          <h2 id={titleId} className="text-xl font-extrabold">{t('bookLock.verify.title')}</h2>
          <p className="mt-1 text-sm text-text-muted">{t('bookLock.verify.subtitle')}</p>
        </div>

        <PinPad
          value={pin}
          onChange={(next) => { setPin(next); setError(null) }}
          disabled={busy || waiting}
        />

        <p role="alert" className="min-h-5 text-center text-sm text-error">
          {notice ? t(notice) : message}
        </p>

        {confirmNoLock && (
          <div className="w-full max-w-[320px] rounded-md border border-warning/40 bg-warning/10 p-4">
            <p className="text-sm font-semibold text-text-primary">{t('bookLock.recovery.noDeviceLock.title')}</p>
            <p className="mt-1 text-xs text-text-secondary">{t('bookLock.recovery.noDeviceLock.body')}</p>
            <div className="mt-3 flex gap-2">
              <Button variant="ghost" size="sm" onClick={() => setConfirmNoLock(false)}>
                {t('common.cancel')}
              </Button>
              <Button variant="danger" size="sm" onClick={() => void resetPin()}>
                {t('bookLock.recovery.noDeviceLock.confirm')}
              </Button>
            </div>
          </div>
        )}
      </div>

      <div className="flex flex-col gap-2 px-6 pb-8">
        <Button onClick={() => void submit()} disabled={busy || waiting || pin.length < PIN_MIN_LENGTH}>
          {t('bookLock.action.unlock')}
        </Button>
        <Button variant="ghost" onClick={() => void startRecovery()} disabled={busy}>
          {t('bookLock.verify.forgot')}
        </Button>
        <Button variant="ghost" onClick={() => settlePrompt(false)} disabled={busy}>
          {t('common.cancel')}
        </Button>
      </div>
    </div>
  )
}
