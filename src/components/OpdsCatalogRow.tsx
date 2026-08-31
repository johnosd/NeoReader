import { RotateCcw, WifiOff } from 'lucide-react'
import { OpdsEntryCard } from './OpdsEntryCard'
import { Skeleton } from './ui'
import { useI18n } from '../i18n'
import type { OpdsDownloadState, OpdsFeedEntry } from '../types/opds'

interface OpdsCatalogRowProps {
  catalogName: string
  entries: OpdsFeedEntry[]
  loading: boolean
  error?: boolean
  offline?: boolean
  onRetry?: () => void
  getState: (entry: OpdsFeedEntry) => OpdsDownloadState
  onDownload: (entry: OpdsFeedEntry) => void
  onOpenDownloaded: (entry: OpdsFeedEntry) => void
  onOpenFolder?: (entry: OpdsFeedEntry) => void
  onSeeMore?: () => void
}

export function OpdsCatalogRow({
  catalogName,
  entries,
  loading,
  error,
  offline,
  onRetry,
  getState,
  onDownload,
  onOpenDownloaded,
  onOpenFolder,
  onSeeMore,
}: OpdsCatalogRowProps) {
  const { t } = useI18n()

  return (
    <section className="mt-6">
      <div className="flex items-center justify-between gap-2 px-5 mb-3">
        <h2 className="text-[15px] font-semibold truncate" style={{ color: '#f1f5f9' }}>
          {loading ? ' ' : catalogName}
        </h2>
        {onSeeMore && !error && (
          <button
            type="button"
            onClick={onSeeMore}
            className="shrink-0 text-[12px] font-semibold text-purple-light active:opacity-70"
          >
            {t('discover.opds.seeMore')}
          </button>
        )}
      </div>

      {/* Erro fica isolado nesta row — as demais continuam normais (US5, AC3). */}
      {!loading && error ? (
        <button
          type="button"
          onClick={onRetry}
          className="mx-5 flex items-center gap-2 rounded-md border border-white/10 bg-white/5 px-3 py-2 text-left active:opacity-70"
        >
          <WifiOff size={16} className="text-text-muted shrink-0" />
          <span className="text-[12px] text-text-secondary flex-1">
            {offline ? t('opdsBrowse.error.description') : t('opdsBrowse.error.title')}
          </span>
          <RotateCcw size={14} className="text-purple-light shrink-0" />
        </button>
      ) : (
        <div className="flex gap-3 overflow-x-auto scrollbar-hide px-5 pb-1">
          {loading && Array.from({ length: 5 }).map((_, index) => (
            <div key={index} className="shrink-0 w-[100px]">
              <Skeleton variant="card" className="w-full" />
              <Skeleton variant="text" className="mt-2 w-4/5 h-3" />
            </div>
          ))}

          {!loading && entries.map((entry) => (
            <div key={entry.id} className="shrink-0 w-[100px]">
              <OpdsEntryCard
                entry={entry}
                state={getState(entry)}
                onDownload={onDownload}
                onOpenDownloaded={onOpenDownloaded}
                onOpenFolder={onOpenFolder}
              />
            </div>
          ))}
        </div>
      )}
    </section>
  )
}
