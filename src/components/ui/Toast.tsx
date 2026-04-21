import { useEffect, type ReactNode } from 'react'
import { Check, AlertCircle, Info, AlertTriangle } from 'lucide-react'
import { cn } from '../../utils/cn'

type ToastTone = 'success' | 'error' | 'warning' | 'info'

interface ToastProps {
  tone?: ToastTone
  children: ReactNode
  onDismiss?: () => void
  durationMs?: number
  className?: string
}

const TONE_META: Record<ToastTone, { color: string; Icon: typeof Check }> = {
  success: { color: 'text-success', Icon: Check },
  error: { color: 'text-error', Icon: AlertCircle },
  warning: { color: 'text-warning', Icon: AlertTriangle },
  info: { color: 'text-indigo-primary', Icon: Info },
}

export function Toast({ tone = 'info', children, onDismiss, durationMs = 3000, className }: ToastProps) {
  useEffect(() => {
    if (!onDismiss || !durationMs) return
    const id = setTimeout(onDismiss, durationMs)
    return () => clearTimeout(id)
  }, [onDismiss, durationMs])

  const { color, Icon } = TONE_META[tone]

  return (
    <div
      role="status"
      className={cn(
        'fixed left-4 right-4 bottom-4 z-[1500] flex items-center gap-3',
        'bg-bg-elevated border border-border rounded-md p-4 shadow-card',
        'animate-[slideUp_300ms_ease-out]',
        className,
      )}
    >
      <Icon size={20} className={cn('shrink-0', color)} />
      <span className="text-sm font-medium text-text-primary flex-1">{children}</span>
    </div>
  )
}
