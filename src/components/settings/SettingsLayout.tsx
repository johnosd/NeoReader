import type { ReactNode } from 'react'

// Primitivos de layout compartilhados entre o menu de Settings e todas as
// subtelas de categoria (extraídos de SettingsScreen.tsx, comportamento
// idêntico ao original).

export function SettingsSection({
  icon,
  label,
  description,
  children,
}: {
  icon: ReactNode
  label: string
  description?: string
  children: ReactNode
}) {
  return (
    <section>
      <div className="mb-3 flex items-start gap-2 px-1">
        <div className="mt-0.5 text-purple-light">{icon}</div>
        <div className="min-w-0">
          <h2 className="text-[11px] font-bold uppercase tracking-[0.1em] text-purple-light">
            {label}
          </h2>
          {description && (
            <p className="mt-0.5 text-xs leading-snug text-text-muted">{description}</p>
          )}
        </div>
      </div>
      {children}
    </section>
  )
}

export function SettingsGroup({ children }: { children: ReactNode }) {
  return (
    <div className="overflow-hidden rounded-md border border-border bg-bg-surface">
      {children}
    </div>
  )
}

export function SettingBlock({
  label,
  description,
  children,
  divider = true,
}: {
  label: string
  description?: string
  children: ReactNode
  divider?: boolean
}) {
  return (
    <div className={divider ? 'border-b border-white/5 p-4' : 'p-4'}>
      <div className="mb-3">
        <h3 className="text-sm font-semibold text-text-secondary">{label}</h3>
        {description && (
          <p className="mt-1 text-xs leading-snug text-text-muted">{description}</p>
        )}
      </div>
      {children}
    </div>
  )
}

export function InfoRow({
  icon,
  title,
  description,
  badge,
  divider = true,
}: {
  icon: ReactNode
  title: string
  description: string
  badge?: ReactNode
  divider?: boolean
}) {
  return (
    <div className={[
      'flex items-start gap-3 px-4 py-4',
      divider ? 'border-b border-white/5' : '',
    ].join(' ')}>
      <div className="mt-0.5 text-text-secondary">{icon}</div>
      <div className="min-w-0 flex-1">
        <div className="flex items-start justify-between gap-3">
          <h3 className="text-sm font-semibold text-text-primary">{title}</h3>
          {badge}
        </div>
        <p className="mt-1 text-xs leading-relaxed text-text-muted">{description}</p>
      </div>
    </div>
  )
}
