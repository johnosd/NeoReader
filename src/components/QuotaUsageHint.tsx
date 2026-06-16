import type { MessageKey } from '../i18n'
import { useI18n } from '../i18n'
import type { FeatureQuotaSnapshot } from '../services/FeatureQuotaService'
import { cn } from '../utils/cn'

interface QuotaUsageHintProps {
  quota?: FeatureQuotaSnapshot | null
  labelKey: MessageKey
  className?: string
}

export function QuotaUsageHint({ quota, labelKey, className }: QuotaUsageHintProps) {
  const { t } = useI18n()

  if (!quota || quota.isPro || quota.limit === null || quota.remaining === null) return null

  return (
    <p className={cn('text-[11px] font-medium leading-snug text-text-muted', className)}>
      {t(labelKey, { remaining: quota.remaining, limit: quota.limit })}
    </p>
  )
}
