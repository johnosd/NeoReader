import { AlertTriangle, FileWarning, X } from 'lucide-react'
import { useI18n } from '@/i18n'

export type PdfNoticeVariant = 'noText' | 'partialText' | 'large'

interface PdfTextLayerNoticeProps {
  variant: PdfNoticeVariant
  onDismiss: () => void
}

const META: Record<PdfNoticeVariant, { Icon: typeof FileWarning; titleKey: 'pdf.notice.noText.title' | 'pdf.notice.partialText.title' | 'pdf.notice.large.title'; bodyKey: 'pdf.notice.noText.body' | 'pdf.notice.partialText.body' | 'pdf.notice.large.body' }> = {
  noText: { Icon: FileWarning, titleKey: 'pdf.notice.noText.title', bodyKey: 'pdf.notice.noText.body' },
  partialText: { Icon: FileWarning, titleKey: 'pdf.notice.partialText.title', bodyKey: 'pdf.notice.partialText.body' },
  large: { Icon: AlertTriangle, titleKey: 'pdf.notice.large.title', bodyKey: 'pdf.notice.large.body' },
}

/**
 * Aviso não bloqueante de PDF: sem camada de texto (FR-014/SC-007), texto só em parte das páginas, ou PDF
 * grande (FR-016). O leitor continua usável por trás; o usuário dispensa quando quiser.
 */
export function PdfTextLayerNotice({ variant, onDismiss }: PdfTextLayerNoticeProps) {
  const { t } = useI18n()
  const { Icon, titleKey, bodyKey } = META[variant]

  return (
    <div
      role="status"
      data-testid={`pdf-notice-${variant}`}
      className="fixed left-3 right-3 top-16 z-[1400] flex items-start gap-3 rounded-md border border-border bg-bg-surface p-3 shadow-card"
    >
      <Icon size={20} className="mt-0.5 shrink-0 text-warning" />
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium text-text-primary">{t(titleKey)}</p>
        <p className="mt-0.5 text-xs text-text-secondary">{t(bodyKey)}</p>
      </div>
      <button
        type="button"
        onClick={onDismiss}
        aria-label={t('pdf.notice.dismiss')}
        className="shrink-0 rounded p-1 text-text-muted active:scale-95"
      >
        <X size={18} />
      </button>
    </div>
  )
}
