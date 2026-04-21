import type { ReactNode } from 'react'
import { cn } from '../../utils/cn'

type BadgeTone = 'success' | 'warning' | 'error' | 'purple' | 'indigo' | 'neutral'

interface BadgeProps {
  tone?: BadgeTone
  children: ReactNode
  className?: string
}

const TONE_CLASSES: Record<BadgeTone, string> = {
  success: 'bg-success/15 text-success border-success/30',
  warning: 'bg-warning/15 text-warning border-warning/30',
  error: 'bg-error/15 text-error border-error/30',
  purple: 'bg-purple-primary/15 text-purple-light border-purple-primary/30',
  indigo: 'bg-indigo-primary/15 text-indigo-primary border-indigo-primary/30',
  neutral: 'bg-white/5 text-text-muted border-border',
}

export function Badge({ tone = 'neutral', children, className }: BadgeProps) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 px-3 py-1 rounded-pill border',
        'text-[11px] font-bold uppercase tracking-wider',
        TONE_CLASSES[tone],
        className,
      )}
    >
      {children}
    </span>
  )
}
