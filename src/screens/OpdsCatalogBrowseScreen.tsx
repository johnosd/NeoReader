import { useEffect, useRef, useState } from 'react'
import { ArrowLeft, ChevronRight, Rss, Search, Wifi } from 'lucide-react'
import { EmptyState, Input, Spinner } from '../components/ui'
import { OpdsEntryCard, OpdsFolderListRow } from '../components/OpdsEntryCard'
import { useCapacitorBackButton } from '../hooks/useCapacitorAppListener'
import { useOpdsCatalogBrowse, type BreadcrumbItem } from '../hooks/useOpdsCatalogBrowse'
import { useI18n } from '../i18n'
import { getCatalog } from '../db/opdsCatalogs'
import type { Book } from '../types/book'
import type { MessageKey } from '../i18n'
import type { OpdsCatalog, OpdsSortOrder } from '../types/opds'

// Convenção do Gutenberg (`?sort_order=...`), não padrão OPDS — ver
// OpdsCatalogService.ts. Mostrado só na raiz do catálogo (sem pasta aberta);
// servidor que não reconhece o parâmetro ignora, então oferecer isso pra
// qualquer catálogo é inofensivo mesmo quando não faz nada.
const SORT_OPTIONS: { id: OpdsSortOrder; labelKey: MessageKey }[] = [
  { id: 'default', labelKey: 'opdsBrowse.sort.default' },
  { id: 'downloads', labelKey: 'opdsBrowse.sort.popular' },
  { id: 'release_date', labelKey: 'opdsBrowse.sort.latest' },
  { id: 'random', labelKey: 'opdsBrowse.sort.random' },
]

interface OpdsCatalogBrowseScreenProps {
  catalogId: number
  onBack: () => void
  onOpenBook: (book: Book) => void
  initialFolder?: BreadcrumbItem
}

export function OpdsCatalogBrowseScreen({ catalogId, onBack, onOpenBook, initialFolder }: OpdsCatalogBrowseScreenProps) {
  const { t } = useI18n()
  useCapacitorBackButton(onBack)
  // undefined = carregando; null = catálogo não encontrado (ex: removido em
  // Settings entre a amostra carregar e o usuário tocar em "ver mais").
  const [catalog, setCatalog] = useState<OpdsCatalog | null | undefined>(undefined)

  useEffect(() => {
    let cancelled = false
    void getCatalog(catalogId).then((found) => {
      if (!cancelled) setCatalog(found ?? null)
    })
    return () => {
      cancelled = true
    }
  }, [catalogId])

  if (catalog === undefined) {
    return (
      <div className="min-h-screen bg-bg-base flex items-center justify-center">
        <Spinner />
      </div>
    )
  }

  if (catalog === null) {
    return (
      <div className="min-h-screen bg-bg-base text-text-primary">
        <BrowseHeader title="" onBack={onBack} />
        <EmptyState icon={<Rss size={40} />} title={t('opdsBrowse.notFound.title')} />
      </div>
    )
  }

  return <OpdsCatalogBrowseContent catalog={catalog} onBack={onBack} onOpenBook={onOpenBook} initialFolder={initialFolder} />
}

function BrowseHeader({ title, onBack }: { title: string; onBack: () => void }) {
  const { t } = useI18n()
  return (
    <header className="px-4 pt-10 pb-4 flex items-center gap-3">
      <button
        onClick={onBack}
        className="p-2 -ml-1 rounded-md text-text-secondary active:scale-90 transition-transform"
        aria-label={t('common.back')}
      >
        <ArrowLeft size={20} />
      </button>
      <h1 className="text-xl font-serif font-bold text-purple-light truncate">{title}</h1>
    </header>
  )
}

function OpdsCatalogBrowseContent({
  catalog,
  onBack,
  onOpenBook,
  initialFolder,
}: {
  catalog: OpdsCatalog
  onBack: () => void
  onOpenBook: (book: Book) => void
  initialFolder?: BreadcrumbItem
}) {
  const { t } = useI18n()
  const browse = useOpdsCatalogBrowse(catalog, catalog.name, onOpenBook, initialFolder)
  const sentinelRef = useRef<HTMLDivElement | null>(null)

  // "Carregar mais" automático ao rolar até o fim (FR-009, User Story 3
  // Acceptance Scenario 3) — IntersectionObserver no sentinel no fim da lista.
  useEffect(() => {
    const node = sentinelRef.current
    if (!node || !browse.hasMore) return

    const observer = new IntersectionObserver((entriesList) => {
      if (entriesList.some((e) => e.isIntersecting)) browse.loadMore()
    })
    observer.observe(node)
    return () => observer.disconnect()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [browse.hasMore, browse.entries])

  return (
    <div className="min-h-screen bg-bg-base text-text-primary pb-12">
      <BrowseHeader title={catalog.name} onBack={onBack} />

      {browse.breadcrumb.length > 1 && (
        <div className="px-4 mb-3 flex items-center gap-1 flex-wrap text-xs text-text-muted">
          {browse.breadcrumb.map((item, index) => (
            <span key={item.url} className="flex items-center gap-1">
              {index > 0 && <ChevronRight size={12} />}
              <button
                type="button"
                onClick={() => browse.navigateToBreadcrumb(index)}
                className={index === browse.breadcrumb.length - 1 ? 'text-text-primary font-semibold' : 'active:opacity-70'}
              >
                {item.title}
              </button>
            </span>
          ))}
        </div>
      )}

      {browse.canSearch && (
        <div className="px-4 mb-4">
          <Input
            leftIcon={<Search size={18} />}
            placeholder={t('opdsBrowse.searchPlaceholder')}
            value={browse.searchQuery}
            onChange={(event) => browse.setSearchQuery(event.target.value)}
          />
        </div>
      )}

      {browse.breadcrumb.length === 1 && (
        <div className="px-4 mb-4 flex items-center gap-2 overflow-x-auto scrollbar-hide">
          {SORT_OPTIONS.map((option) => (
            <button
              key={option.id}
              type="button"
              onClick={() => browse.setSortOrder(option.id)}
              className={[
                'h-8 shrink-0 rounded-pill border px-3 text-xs font-semibold transition-colors',
                browse.sortOrder === option.id
                  ? 'border-purple-primary bg-purple-primary text-white'
                  : 'border-white/10 bg-white/5 text-text-secondary active:bg-white/10',
              ].join(' ')}
            >
              {t(option.labelKey)}
            </button>
          ))}
        </div>
      )}

      {browse.loading && (
        <div className="flex justify-center py-12"><Spinner /></div>
      )}

      {!browse.loading && browse.error && (
        <EmptyState
          icon={<Wifi size={40} />}
          title={t('opdsBrowse.error.title')}
          description={t('opdsBrowse.error.description')}
        />
      )}

      {!browse.loading && !browse.error && browse.entries.length === 0 && (
        <EmptyState
          icon={<Rss size={40} />}
          title={t('opdsBrowse.empty.title')}
          description={t('opdsBrowse.empty.description')}
        />
      )}

      {!browse.loading && !browse.error && browse.entries.length > 0 && (
        <>
          {browse.entries.every((entry) => entry.kind === 'navigation') ? (
            // Página só de pastas (ex: resultado de busca do Gutenberg, cada
            // entry é um livro diferente sem capa) — lista compacta em vez de
            // grid de cards vazios lado a lado (ver OpdsFolderListRow).
            <div className="flex flex-col px-2">
              {browse.entries.map((entry) => (
                <OpdsFolderListRow key={entry.id} entry={entry} onOpenFolder={browse.navigateTo} />
              ))}
            </div>
          ) : (
            <div className="grid grid-cols-3 gap-3 px-4">
              {browse.entries.map((entry) => (
                <OpdsEntryCard
                  key={entry.id}
                  entry={entry}
                  state={browse.getState(entry)}
                  onDownload={browse.download}
                  onOpenDownloaded={browse.openDownloaded}
                  onOpenFolder={browse.navigateTo}
                />
              ))}
            </div>
          )}
          {browse.hasMore && (
            <div ref={sentinelRef} className="flex justify-center py-6">
              {browse.loadingMore && <Spinner size={20} label={t('opdsBrowse.loadingMore')} />}
            </div>
          )}
        </>
      )}
    </div>
  )
}
