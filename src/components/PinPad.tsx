import { Delete } from 'lucide-react'
import { PIN_MAX_LENGTH, PIN_MIN_LENGTH } from '../utils/pinCrypto'
import { useI18n } from '../i18n'
import { cn } from '../utils/cn'

interface PinPadProps {
  value: string
  onChange: (next: string) => void
  maxLength?: number
  disabled?: boolean
}

const DIGIT_ROWS = [['1', '2', '3'], ['4', '5', '6'], ['7', '8', '9']]

// Teclado numérico + pontos mascarados (feature 024). Nunca mostra os dígitos; o
// leitor de tela só ouve "N dígitos digitados" (FR-012, FR-022).
export function PinPad({ value, onChange, maxLength = PIN_MAX_LENGTH, disabled = false }: PinPadProps) {
  const { t } = useI18n()
  const slots = Math.max(PIN_MIN_LENGTH, value.length)

  function append(digit: string) {
    if (disabled || value.length >= maxLength) return
    onChange(value + digit)
  }

  function removeLast() {
    if (disabled || value.length === 0) return
    onChange(value.slice(0, -1))
  }

  // Teclado físico (web/dev): os botões continuam sendo o caminho principal no celular.
  function handleKeyDown(event: React.KeyboardEvent<HTMLDivElement>) {
    if (/^\d$/.test(event.key)) {
      event.preventDefault()
      append(event.key)
    } else if (event.key === 'Backspace') {
      event.preventDefault()
      removeLast()
    }
  }

  const keyClass = cn(
    'flex h-16 items-center justify-center rounded-full bg-white/5 text-2xl font-semibold text-text-primary',
    'transition-transform duration-100 active:scale-95 active:bg-white/10 disabled:opacity-40 disabled:pointer-events-none',
  )

  return (
    <div
      role="group"
      aria-label={t('bookLock.pad.label')}
      onKeyDown={handleKeyDown}
      className="mx-auto flex w-full max-w-[280px] flex-col items-center gap-6 outline-none"
      tabIndex={-1}
    >
      <div className="flex h-4 items-center justify-center gap-3" aria-hidden="true">
        {Array.from({ length: slots }, (_, index) => (
          <span
            key={index}
            className={cn(
              'h-3 w-3 rounded-full border border-purple-light transition-colors',
              index < value.length ? 'bg-purple-light' : 'bg-transparent',
            )}
          />
        ))}
      </div>
      <p className="sr-only" role="status" aria-live="polite">
        {t(value.length === 1 ? 'bookLock.pad.status.one' : 'bookLock.pad.status.many', { count: value.length })}
      </p>

      <div className="grid w-full grid-cols-3 gap-3">
        {DIGIT_ROWS.flat().map((digit) => (
          <button
            key={digit}
            type="button"
            disabled={disabled}
            onClick={() => append(digit)}
            aria-label={t('bookLock.pad.digit', { digit })}
            className={keyClass}
          >
            {digit}
          </button>
        ))}
        <span aria-hidden="true" />
        <button
          type="button"
          disabled={disabled}
          onClick={() => append('0')}
          aria-label={t('bookLock.pad.digit', { digit: '0' })}
          className={keyClass}
        >
          0
        </button>
        <button
          type="button"
          disabled={disabled || value.length === 0}
          onClick={removeLast}
          aria-label={t('bookLock.pad.delete')}
          className={keyClass}
        >
          <Delete size={22} />
        </button>
      </div>
    </div>
  )
}
