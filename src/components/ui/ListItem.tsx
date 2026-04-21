import type { ReactNode } from 'react'
import { cn } from '../../utils/cn'

interface ListItemProps {
  leading?: ReactNode
  title: ReactNode
  meta?: ReactNode
  trailing?: ReactNode
  onClick?: () => void
  disabled?: boolean
  className?: string
  divider?: boolean
}

export function ListItem({
  leading,
  title,
  meta,
  trailing,
  onClick,
  disabled,
  className,
  divider = true,
}: ListItemProps) {
  const interactive = Boolean(onClick) && !disabled

  return (
    <div
      role={interactive ? 'button' : undefined}
      tabIndex={interactive ? 0 : undefined}
      onClick={interactive ? onClick : undefined}
      onKeyDown={
        interactive
          ? (e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault()
                onClick?.()
              }
            }
          : undefined
      }
      className={cn(
        'flex items-center gap-3 px-4 py-3 transition-colors duration-200',
        divider && 'border-b border-white/5',
        interactive && 'cursor-pointer active:bg-white/5',
        disabled && 'opacity-50 pointer-events-none',
        className,
      )}
    >
      {leading && <div className="shrink-0 text-text-secondary">{leading}</div>}
      <div className="flex-1 min-w-0">
        <div className="text-base font-semibold text-text-primary truncate">{title}</div>
        {meta && <div className="text-xs text-text-muted mt-0.5">{meta}</div>}
      </div>
      {trailing && <div className="shrink-0 text-text-muted">{trailing}</div>}
    </div>
  )
}
