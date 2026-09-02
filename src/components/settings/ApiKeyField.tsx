import type { ReactNode } from 'react'
import { Check, ChevronDown, ChevronRight, Eye, EyeOff } from 'lucide-react'
import { Badge } from '../ui'
import { useI18n } from '../../i18n'
import type { KeyValidationState } from './apiKeyValidation'

// Componentes de UI compartilhados por qualquer subtela de Settings que
// gerencia campos de chave de API expansíveis (hoje: Narração — TTS — e
// Integrações — YouTube). Extraído porque as duas telas precisam do mesmo
// componente, não é abstração especulativa.

export function ValidationBadge({ state, emptyLabel }: { state: KeyValidationState; emptyLabel: string }) {
  const { t } = useI18n()

  if (state.status === 'validating') {
    return <Badge tone="neutral">{t('settings.status.validatingKey')}</Badge>
  }
  if (state.status === 'valid') {
    return (
      <Badge tone="success">
        <Check size={11} /> {t('settings.status.validKey')}
      </Badge>
    )
  }
  if (state.status === 'invalid') {
    return <Badge tone="error">{t('settings.status.invalidKey')}</Badge>
  }
  return <p className="text-xs text-text-muted">{emptyLabel}</p>
}

export function IntegrationStatus({ state }: { state: KeyValidationState }) {
  const { t } = useI18n()

  if (state.status === 'validating') return <Badge tone="neutral">{t('settings.status.validating')}</Badge>
  if (state.status === 'valid') return <Badge tone="success">{t('settings.status.connected')}</Badge>
  if (state.status === 'invalid') return <Badge tone="error">{t('settings.status.invalid')}</Badge>
  return <Badge tone="neutral">{t('settings.status.notConfigured')}</Badge>
}

export function KeyVisibilityButton({ shown, onClick }: { shown: boolean; onClick: () => void }) {
  const { t } = useI18n()

  return (
    <button
      type="button"
      onClick={onClick}
      className="p-2 text-text-muted active:opacity-60"
      aria-label={shown ? t('settings.apiKey.hide') : t('settings.apiKey.show')}
    >
      {shown ? <EyeOff size={16} /> : <Eye size={16} />}
    </button>
  )
}

export function ApiKeyField({
  label,
  description,
  icon,
  state,
  emptyLabel,
  expanded,
  onToggleExpanded,
  input,
  divider = true,
}: {
  label: string
  description: string
  icon: ReactNode
  state: KeyValidationState
  emptyLabel: string
  expanded: boolean
  onToggleExpanded: () => void
  input: ReactNode
  divider?: boolean
}) {
  return (
    <div className={divider ? 'border-b border-white/5' : ''}>
      <button
        type="button"
        onClick={onToggleExpanded}
        aria-expanded={expanded}
        className="flex w-full items-start justify-between gap-3 p-4 text-left transition-colors active:bg-white/[0.03]"
      >
        <span className="flex min-w-0 items-start gap-3">
          <span className="mt-0.5 text-text-secondary">{icon}</span>
          <span className="min-w-0">
            <span className="block text-sm font-semibold text-text-primary">{label}</span>
            <span className="mt-1 block text-xs leading-snug text-text-muted">{description}</span>
          </span>
        </span>
        <span className="flex shrink-0 items-center gap-2">
          <IntegrationStatus state={state} />
          <span className="text-text-muted">
            {expanded ? <ChevronDown size={17} /> : <ChevronRight size={17} />}
          </span>
        </span>
      </button>
      {expanded && (
        <div className="px-4 pb-4">
          {input}
          <div className="mt-3">
            <ValidationBadge state={state} emptyLabel={emptyLabel} />
          </div>
        </div>
      )}
    </div>
  )
}
