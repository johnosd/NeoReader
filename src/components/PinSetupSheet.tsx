import { useId, useState } from 'react'
import { KeyRound } from 'lucide-react'
import { PinPad } from './PinPad'
import { Button } from './ui'
import { BookProtectionService } from '../services/BookProtectionService'
import { useCapacitorBackButton } from '../hooks/useCapacitorAppListener'
import { useBookLockStore, type PinSetupMode } from '../store/bookLockStore'
import { PIN_MIN_LENGTH, isValidPinFormat } from '../utils/pinCrypto'
import { useI18n } from '../i18n'
import type { MessageKey } from '../i18n'

const TITLE_KEY: Record<PinSetupMode, MessageKey> = {
  create: 'bookLock.setup.createTitle',
  change: 'bookLock.setup.changeTitle',
  reset: 'bookLock.setup.resetTitle',
}

// Criar / alterar / redefinir o PIN: digita duas vezes (FR-002). Em tela cheia e
// opaca, no mesmo nível do PinVerifySheet.
export function PinSetupSheet({ mode }: { mode: PinSetupMode }) {
  const { t } = useI18n()
  const titleId = useId()
  const settleSetup = useBookLockStore((state) => state.settleSetup)
  const [step, setStep] = useState<'enter' | 'confirm'>('enter')
  const [first, setFirst] = useState('')
  const [pin, setPin] = useState('')
  const [error, setError] = useState<'mismatch' | 'tooShort' | 'failed' | null>(null)
  const [busy, setBusy] = useState(false)

  // Mesmo motivo do PinVerifySheet: adia o fechamento para o próximo macrotask.
  useCapacitorBackButton(() => {
    window.setTimeout(() => settleSetup(false), 0)
  }, { ignoreLockPromptGuard: true })

  function restart(nextError: typeof error) {
    setFirst('')
    setPin('')
    setStep('enter')
    setError(nextError)
  }

  async function advance() {
    if (busy) return
    if (!isValidPinFormat(pin)) {
      setError('tooShort')
      return
    }
    if (step === 'enter') {
      setFirst(pin)
      setPin('')
      setStep('confirm')
      setError(null)
      return
    }
    if (pin !== first) {
      restart('mismatch')
      return
    }

    setBusy(true)
    try {
      if (mode === 'create') await BookProtectionService.createPin(pin)
      else await BookProtectionService.replacePin(pin)
      // Quem acabou de definir o PIN o conhece: fica desbloqueado até sair do app.
      useBookLockStore.getState().unlock()
      settleSetup(true)
    } catch {
      restart('failed')
    } finally {
      setBusy(false)
    }
  }

  const message = error === 'mismatch'
    ? t('bookLock.setup.mismatch')
    : error === 'tooShort'
      ? t('bookLock.setup.tooShort')
      : error === 'failed'
        ? t('bookLock.setup.failed')
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
          <KeyRound size={26} aria-hidden="true" />
        </span>
        <div className="text-center">
          <h2 id={titleId} className="text-xl font-extrabold">{t(TITLE_KEY[mode])}</h2>
          <p className="mt-1 text-sm text-text-muted">
            {step === 'enter' ? t('bookLock.setup.enterHint') : t('bookLock.setup.confirmHint')}
          </p>
        </div>

        <PinPad
          value={pin}
          onChange={(next) => { setPin(next); setError(null) }}
          disabled={busy}
        />

        <p role="alert" className="min-h-5 text-center text-sm text-error">{message}</p>
      </div>

      <div className="flex flex-col gap-2 px-6 pb-8">
        <Button onClick={() => void advance()} disabled={busy || pin.length < PIN_MIN_LENGTH}>
          {step === 'enter' ? t('bookLock.setup.next') : t('bookLock.setup.confirm')}
        </Button>
        <Button variant="ghost" onClick={() => settleSetup(false)} disabled={busy}>
          {t('common.cancel')}
        </Button>
      </div>
    </div>
  )
}
