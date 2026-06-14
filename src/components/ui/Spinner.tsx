import { cn } from '../../utils/cn'
import { useI18n } from '../../i18n'

interface SpinnerProps {
  size?: number
  tone?: 'purple' | 'indigo'
  label?: string
  className?: string
}

export function Spinner({ size = 24, tone = 'purple', label, className }: SpinnerProps) {
  const { t } = useI18n()
  const borderColor = tone === 'purple' ? 'border-t-purple-primary' : 'border-t-indigo-primary'

  return (
    <div className={cn('flex flex-col items-center gap-2', className)}>
      <div
        role="status"
        aria-label={label ?? t('common.loading')}
        className={cn('rounded-full border-[3px] border-white/10 animate-spin', borderColor)}
        style={{ width: size, height: size }}
      />
      {label && (
        <span className="text-[10px] font-bold uppercase tracking-widest text-text-muted">{label}</span>
      )}
    </div>
  )
}
