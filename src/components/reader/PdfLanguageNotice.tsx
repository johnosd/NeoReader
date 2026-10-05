import { Languages, X } from 'lucide-react'
import { useI18n } from '@/i18n'

interface PdfLanguageNoticeProps {
  onChoose: () => void
  onDismiss: () => void
}

/**
 * Aviso único e não bloqueante de idioma indefinido (FR-020/DI-012): o PDF não declarou idioma e a detecção
 * por texto não teve confiança. Em vez de assumir "en" em silêncio, o leitor oferece escolher o idioma.
 */
export function PdfLanguageNotice({ onChoose, onDismiss }: PdfLanguageNoticeProps) {
  const { t } = useI18n()

  return (
    <div
      role="status"
      data-testid="pdf-language-notice"
      className="fixed left-3 right-3 top-16 z-[1400] flex items-start gap-3 rounded-md border border-border bg-bg-surface p-3 shadow-card"
    >
      <Languages size={20} className="mt-0.5 shrink-0 text-purple-light" />
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium text-text-primary">{t('pdf.language.warning.title')}</p>
        <p className="mt-0.5 text-xs text-text-secondary">{t('pdf.language.warning.body')}</p>
        <div className="mt-2 flex gap-2">
          <button
            type="button"
            onClick={onChoose}
            className="rounded-md bg-purple-primary px-3 py-1.5 text-xs font-medium text-white active:scale-95"
          >
            {t('pdf.language.warning.choose')}
          </button>
          <button type="button" onClick={onDismiss} className="px-2 py-1.5 text-xs text-text-muted">
            {t('pdf.language.warning.dismiss')}
          </button>
        </div>
      </div>
      <button
        type="button"
        onClick={onDismiss}
        aria-label={t('pdf.language.warning.dismiss')}
        className="shrink-0 rounded p-1 text-text-muted active:scale-95"
      >
        <X size={18} />
      </button>
    </div>
  )
}
