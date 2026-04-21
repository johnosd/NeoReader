import type { ReactNode } from 'react'
import { cn } from '../../utils/cn'

interface EmptyStateProps {
  icon?: ReactNode
  title: string
  description?: string
  action?: ReactNode
  className?: string
}

export function EmptyState({ icon, title, description, action, className }: EmptyStateProps) {
  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center text-center px-4 py-12',
        className,
      )}
    >
      {icon && <div className="w-12 h-12 text-text-muted opacity-50 mb-4 flex items-center justify-center">{icon}</div>}
      <h3 className="text-lg font-semibold text-text-primary mb-2">{title}</h3>
      {description && (
        <p className="text-sm text-text-secondary leading-relaxed mb-6 max-w-xs">{description}</p>
      )}
      {action}
    </div>
  )
}
