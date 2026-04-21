import { cn } from '../../utils/cn'

interface SpinnerProps {
  size?: number
  tone?: 'purple' | 'indigo'
  label?: string
  className?: string
}

export function Spinner({ size = 24, tone = 'purple', label, className }: SpinnerProps) {
  const borderColor = tone === 'purple' ? 'border-t-purple-primary' : 'border-t-indigo-primary'

  return (
    <div className={cn('flex flex-col items-center gap-2', className)}>
      <div
        role="status"
        aria-label={label ?? 'Carregando'}
        className={cn('rounded-full border-[3px] border-white/10 animate-spin', borderColor)}
        style={{ width: size, height: size }}
      />
      {label && (
        <span className="text-[10px] font-bold uppercase tracking-widest text-text-muted">{label}</span>
      )}
    </div>
  )
}
