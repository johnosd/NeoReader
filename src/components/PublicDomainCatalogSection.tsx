import { PublicDomainBookCard } from './PublicDomainBookCard'
import { Skeleton } from './ui'
import { usePublicDomainCatalog } from '../hooks/usePublicDomainCatalog'
import { useI18n } from '../i18n'
import type { Book } from '../types/book'

interface PublicDomainCatalogSectionProps {
  onOpenBook: (book: Book) => void
  onSeeMore: () => void
}

// Row-amostra + "ver mais", mesmo layout das rows de catálogo OPDS
// (OpdsCatalogRow) — unificação decidida na assessment desta feature (US4).
// A amostra vem ao vivo do feed de novidades do Standard Ebooks; "ver mais"
// continua abrindo a lista curada existente (feature 002), não uma navegação
// OPDS ao vivo — o feed completo do Standard Ebooks exige conta paga.
export function PublicDomainCatalogSection({ onOpenBook, onSeeMore }: PublicDomainCatalogSectionProps) {
  const { t } = useI18n()
  const { sampleEntries, sampleLoading, getState, download, openDownloaded } = usePublicDomainCatalog(onOpenBook)

  return (
    <section className="mt-6">
      <div className="flex items-center justify-between gap-2 px-5 mb-3">
        <div className="min-w-0">
          <h2 className="text-[15px] font-semibold truncate" style={{ color: '#f1f5f9' }}>
            {t('discover.publicDomain.title')}
          </h2>
          <p className="text-[11px] mt-[2px] truncate" style={{ color: 'rgba(100,116,139,0.8)' }}>
            {t('discover.publicDomain.subtitle')}
          </p>
        </div>
        <button
          type="button"
          onClick={onSeeMore}
          className="shrink-0 text-[12px] font-semibold text-purple-light active:opacity-70"
        >
          {t('discover.opds.seeMore')}
        </button>
      </div>

      <div className="flex gap-3 overflow-x-auto scrollbar-hide px-5 pb-1">
        {sampleLoading && Array.from({ length: 5 }).map((_, index) => (
          <div key={index} className="shrink-0 w-[100px]">
            <Skeleton variant="card" className="w-full" />
            <Skeleton variant="text" className="mt-2 w-4/5 h-3" />
          </div>
        ))}

        {!sampleLoading && sampleEntries.map((entry) => (
          <div key={entry.id} className="shrink-0 w-[100px]">
            <PublicDomainBookCard
              entry={entry}
              state={getState(entry.id)}
              onDownload={download}
              onOpenDownloaded={openDownloaded}
            />
          </div>
        ))}
      </div>
    </section>
  )
}
