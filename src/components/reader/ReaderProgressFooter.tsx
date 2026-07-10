import { useI18n } from '../../i18n'

export const READER_PROGRESS_FOOTER_HEIGHT_PX = 22

interface ReaderProgressFooterProps {
  sectionLabel?: string | null
  chapterPercentage?: number | null
}

export function ReaderProgressFooter({
  sectionLabel,
  chapterPercentage,
}: ReaderProgressFooterProps) {
  const { t } = useI18n()
  const visibleSectionLabel = sectionLabel?.trim() || t('readerProgressFooter.currentChapter')
  const progressLabel = chapterPercentage == null
    ? t('readerProgressFooter.unavailableProgress')
    : t('readerProgressFooter.chapterPercent', { percent: chapterPercentage })

  return (
    <div
      className="pointer-events-none absolute bottom-0 left-0 right-0 z-[12] border-t border-black/10 bg-[rgba(15,7,24,0.82)] px-3 text-[11px] font-medium text-text-muted shadow-[0_-8px_22px_rgba(0,0,0,0.2)] backdrop-blur-md"
      data-testid="reader-progress-footer"
      style={{ height: `${READER_PROGRESS_FOOTER_HEIGHT_PX}px` }}
    >
      <div className="flex h-full min-w-0 items-center justify-between gap-3">
        <span className="min-w-0 flex-1 truncate">{visibleSectionLabel}</span>
        <span className="shrink-0 tabular-nums text-text-secondary">{progressLabel}</span>
      </div>
    </div>
  )
}
