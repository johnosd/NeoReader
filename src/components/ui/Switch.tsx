import { cn } from '../../utils/cn'

interface SwitchProps {
  checked: boolean
  onChange: (value: boolean) => void
  disabled?: boolean
  tone?: 'purple' | 'indigo'
  'aria-label'?: string
}

export function Switch({ checked, onChange, disabled, tone = 'purple', ...rest }: SwitchProps) {
  const accent = tone === 'purple' ? 'bg-purple-primary' : 'bg-indigo-primary'

  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={cn(
        'relative inline-flex w-12 h-7 rounded-pill transition-colors duration-200 shrink-0',
        'disabled:opacity-50 disabled:pointer-events-none',
        checked ? accent : 'bg-white/15',
      )}
      {...rest}
    >
      <span
        className={cn(
          'absolute top-0.5 left-0.5 w-6 h-6 bg-white rounded-full shadow-card transition-transform duration-200',
          checked && 'translate-x-5',
        )}
      />
    </button>
  )
}
