import { Check } from 'lucide-react'
import { cn } from '../../utils/cn'

interface CheckboxProps {
  checked: boolean
  onChange: (value: boolean) => void
  disabled?: boolean
  tone?: 'purple' | 'indigo'
  label?: string
}

export function Checkbox({ checked, onChange, disabled, tone = 'purple', label }: CheckboxProps) {
  const accent = tone === 'purple' ? 'bg-purple-primary border-purple-primary' : 'bg-indigo-primary border-indigo-primary'

  return (
    <label
      className={cn(
        'inline-flex items-center gap-3 cursor-pointer select-none',
        disabled && 'opacity-50 pointer-events-none',
      )}
    >
      <span
        className={cn(
          'w-5 h-5 rounded-sm border-2 flex items-center justify-center transition-all duration-200',
          checked ? accent : 'border-white/20 bg-transparent',
        )}
      >
        {checked && <Check size={14} strokeWidth={3} className="text-white" />}
      </span>
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        disabled={disabled}
        className="sr-only"
      />
      {label && <span className="text-sm text-text-primary">{label}</span>}
    </label>
  )
}
