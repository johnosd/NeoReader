import type { ReactNode } from 'react'
import { Badge } from './ui'
import { useI18n } from '../i18n'

interface IntegrationEducationCardProps {
  title: string
  description: string
  enables: string
  bestFor: string
  setup: string
  privacy: string
  statusLabel: string
  statusTone: 'success' | 'warning' | 'neutral'
  icon?: ReactNode
}

export function IntegrationEducationCard({
  title,
  description,
  enables,
  bestFor,
  setup,
  privacy,
  statusLabel,
  statusTone,
  icon,
}: IntegrationEducationCardProps) {
  const { t } = useI18n()

  return (
    <div className="rounded-md border border-white/8 bg-white/[0.03] p-3">
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-3">
          {icon && <div className="mt-0.5 shrink-0 text-purple-light">{icon}</div>}
          <div className="min-w-0">
            <p className="text-sm font-bold text-text-primary">{title}</p>
            <p className="mt-1 text-xs leading-relaxed text-text-muted">{description}</p>
          </div>
        </div>
        <Badge tone={statusTone}>{statusLabel}</Badge>
      </div>
      <dl className="mt-3 grid gap-2 text-xs leading-relaxed">
        <div>
          <dt className="font-semibold text-text-secondary">{t('integrationEducation.enables')}</dt>
          <dd className="text-text-muted">{enables}</dd>
        </div>
        <div>
          <dt className="font-semibold text-text-secondary">{t('integrationEducation.bestFor')}</dt>
          <dd className="text-text-muted">{bestFor}</dd>
        </div>
        <div>
          <dt className="font-semibold text-text-secondary">{t('integrationEducation.setup')}</dt>
          <dd className="text-text-muted">{setup}</dd>
        </div>
        <div>
          <dt className="font-semibold text-text-secondary">{t('integrationEducation.privacy')}</dt>
          <dd className="text-text-muted">{privacy}</dd>
        </div>
      </dl>
    </div>
  )
}
