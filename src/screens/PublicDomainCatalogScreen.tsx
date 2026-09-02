import { ArrowLeft, BookOpen } from 'lucide-react'
import { EmptyState, Skeleton } from '../components/ui'
import { PublicDomainBookCard } from '../components/PublicDomainBookCard'
import { useCapacitorBackButton } from '../hooks/useCapacitorAppListener'
import { usePublicDomainCatalog } from '../hooks/usePublicDomainCatalog'
import { useI18n } from '../i18n'
import type { Book } from '../types/book'

interface PublicDomainCatalogScreenProps {
  onBack: () => void
  onOpenBook: (book: Book) => void
}

// Destino do "ver mais" de "Clássicos em Inglês" — lista curada da feature
// 002 (não navegação OPDS ao vivo, ver PublicDomainCatalogSection.tsx).
export function PublicDomainCatalogScreen({ onBack, onOpenBook }: PublicDomainCatalogScreenProps) {
  const { t } = useI18n()
  useCapacitorBackButton(onBack)
  const { entries, loading, error, getState, download, openDownloaded } = usePublicDomainCatalog(onOpenBook)

  return (
    <div className="min-h-screen bg-bg-base text-text-primary pb-12">
      <header className="px-4 pt-10 pb-4 flex items-center gap-3">
        <button
          onClick={onBack}
          className="p-2 -ml-1 rounded-md text-text-secondary active:scale-90 transition-transform"
          aria-label={t('common.back')}
        >
          <ArrowLeft size={20} />
        </button>
        <div>
          <h1 className="text-xl font-serif font-bold text-purple-light">{t('discover.publicDomain.title')}</h1>
          <p className="text-xs text-text-muted">{t('discover.publicDomain.subtitle')}</p>
        </div>
      </header>

      {error ? (
        <EmptyState icon={<BookOpen size={40} />} title={t('opdsBrowse.error.title')} description={t('opdsBrowse.error.description')} />
      ) : (
        <div className="grid grid-cols-3 gap-3 px-4">
          {loading && Array.from({ length: 6 }).map((_, index) => (
            <div key={index}>
              <Skeleton variant="card" className="w-full" />
              <Skeleton variant="text" className="mt-2 w-4/5 h-3" />
            </div>
          ))}

          {!loading && entries.map((entry) => (
            <PublicDomainBookCard
              key={entry.id}
              entry={entry}
              state={getState(entry.id)}
              onDownload={download}
              onOpenDownloaded={openDownloaded}
            />
          ))}
        </div>
      )}
    </div>
  )
}
