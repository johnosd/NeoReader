import { useState, type ReactNode } from 'react'
import { X } from 'lucide-react'
import { useI18n } from '../i18n'

type IntegrationHelpBannerTone = 'info' | 'warning'

interface IntegrationHelpBannerProps {
  title: string
  description: string
  actionLabel?: string
  dismissId?: string
  icon?: ReactNode
  tone?: IntegrationHelpBannerTone
  onAction?: () => void
}

function getDismissedBanner(dismissId?: string): boolean {
  if (!dismissId) return false
  try {
    return window.localStorage.getItem(`neoreader:integration-banner:${dismissId}`) === '1'
  } catch {
    return false
  }
}

function setDismissedBanner(dismissId: string): void {
  try {
    window.localStorage.setItem(`neoreader:integration-banner:${dismissId}`, '1')
  } catch {
    // Dismiss persistence is best-effort; unavailable storage should not block the flow.
  }
}

export function IntegrationHelpBanner({
  title,
  description,
  actionLabel,
  dismissId,
  icon,
  tone = 'info',
  onAction,
}: IntegrationHelpBannerProps) {
  const { t } = useI18n()
  const [dismissed, setDismissed] = useState(() => getDismissedBanner(dismissId))

  if (dismissed) return null

  const toneClasses = tone === 'warning'
    ? 'border-warning/30 bg-warning/10 text-warning'
    : 'border-purple-primary/30 bg-purple-primary/10 text-purple-light'

  const dismiss = () => {
    if (dismissId) setDismissedBanner(dismissId)
    setDismissed(true)
  }

  return (
    <div className={`rounded-md border ${toneClasses} p-4`}>
      <div className="flex items-start gap-3">
        {icon && <div className="mt-0.5 shrink-0">{icon}</div>}
        <div className="min-w-0 flex-1">
          <p className="text-sm font-bold text-text-primary">{title}</p>
          <p className="mt-1 text-xs leading-relaxed text-text-secondary">{description}</p>
          {actionLabel && onAction && (
            <button
              type="button"
              onClick={onAction}
              className="mt-3 rounded-md bg-white/8 px-3 py-1.5 text-xs font-semibold text-text-primary transition-colors active:bg-white/12"
            >
              {actionLabel}
            </button>
          )}
        </div>
        {dismissId && (
          <button
            type="button"
            onClick={dismiss}
            aria-label={t('common.dismiss')}
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-text-muted transition-colors active:bg-white/10"
          >
            <X size={15} />
          </button>
        )}
      </div>
    </div>
  )
}
