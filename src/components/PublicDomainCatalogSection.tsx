import { PublicDomainBookCard } from './PublicDomainBookCard'
import { Skeleton } from './ui'
import { usePublicDomainCatalog } from '../hooks/usePublicDomainCatalog'
import { useI18n } from '../i18n'
import type { Book } from '../types/book'

interface PublicDomainCatalogSectionProps {
  onOpenBook: (book: Book) => void
}

export function PublicDomainCatalogSection({ onOpenBook }: PublicDomainCatalogSectionProps) {
  const { t } = useI18n()
  const { entries, loading, error, getState, download, openDownloaded } = usePublicDomainCatalog(onOpenBook)

  // Catalogo bundled falhando ao carregar nao deveria acontecer em produção
  // (e um asset local, nao rede) — se acontecer, a seção so some, sem
  // quebrar o resto de Descubra.
  if (error) return null

  return (
    <section className="mt-2">
      <div className="px-5 mb-3">
        <h2 className="text-[16px] font-semibold text-text-primary">{t('discover.publicDomain.title')}</h2>
        <p className="text-[11px] mt-[2px]" style={{ color: 'rgba(100,116,139,0.8)' }}>
          {t('discover.publicDomain.subtitle')}
        </p>
      </div>

      <div className="grid grid-cols-3 gap-3 px-5">
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
    </section>
  )
}
