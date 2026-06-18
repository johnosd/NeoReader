import { useState } from 'react'
import { Compass, Sparkles } from 'lucide-react'
import { AdBannerSlot } from '../components/AdBannerSlot'
import { BottomNav } from '../components/BottomNav'
import { NytBooksRow } from '../components/NytBooksRow'
import { QuotaUsageHint } from '../components/QuotaUsageHint'
import { Button, EmptyState } from '../components/ui'
import { useCapacitorBackButton } from '../hooks/useCapacitorAppListener'
import { useI18n } from '../i18n'
import { FeatureQuotaService, type FeatureQuotaConsumeResult } from '../services/FeatureQuotaService'
import { NytBooksService } from '../services/NytBooksService'

const TRENDING_LISTS = [
  'advice-how-to-and-miscellaneous',
  'hardcover-fiction',
  'business-books',
]
const CHILDREN_LISTS = [
  'childrens-middle-grade-hardcover',
  'series-books',
  'graphic-books-and-manga',
]
const ALL_NYT_LISTS = [...TRENDING_LISTS, ...CHILDREN_LISTS]

interface DiscoverScreenProps {
  onBack: () => void
  onOpenHome?: () => void
  onOpenLibrary: () => void
  onOpenProfile: () => void
  onOpenPaywall?: () => void
}

export function DiscoverScreen({ onBack, onOpenHome, onOpenLibrary, onOpenProfile, onOpenPaywall }: DiscoverScreenProps) {
  const { t } = useI18n()
  useCapacitorBackButton(onBack)
  const hasNytApiKey = Boolean(import.meta.env.VITE_NYT_API_KEY)
  const [quotaState] = useState<FeatureQuotaConsumeResult | null>(() => {
    if (!hasNytApiKey) return null

    return FeatureQuotaService.consume('nyt-discovery', {
      hasValidCache: ALL_NYT_LISTS.every((listName) => NytBooksService.hasValidCache(listName)),
    })
  })
  const hasAnyNytCache = hasNytApiKey && ALL_NYT_LISTS.some((listName) => NytBooksService.hasValidCache(listName))
  const quotaBlocked = quotaState?.blockedReason === 'quota-exhausted'
  const allowNytNetwork = hasNytApiKey && quotaState?.allowed !== false

  return (
    <div className="min-h-screen pb-[90px] bg-bg-base text-text-primary">
      <header className="px-5 pt-10 pb-4">
        <div className="flex items-center gap-3">
          <div
            className="w-11 h-11 rounded-md flex items-center justify-center border border-white/10"
            style={{ background: 'rgba(123,44,191,0.16)', color: '#c084fc' }}
          >
            <Compass size={22} />
          </div>
          <div>
            <h1 className="text-2xl font-serif font-bold text-purple-light">{t('discover.title')}</h1>
            <p className="text-sm text-text-secondary mt-1">{t('discover.subtitle')}</p>
          </div>
        </div>
      </header>

      <main>
        {hasNytApiKey ? (
          <>
            {quotaBlocked && !hasAnyNytCache ? (
              <EmptyState
                icon={<Sparkles size={48} />}
                title={t('discover.quota.title')}
                description={t('discover.quota.description')}
                action={(
                  <div className="flex flex-col items-center gap-3">
                    <QuotaUsageHint quota={quotaState} labelKey="quota.remaining.nytDiscovery" />
                    {onOpenPaywall && (
                      <Button size="sm" fullWidth={false} onClick={onOpenPaywall}>
                        {t('bookDetails.quota.action')}
                      </Button>
                    )}
                  </div>
                )}
              />
            ) : (
              <>
                <div className="mt-2 mb-1 border-t border-white/5" />
                {!quotaBlocked && (
                  <QuotaUsageHint
                    quota={quotaState}
                    labelKey="quota.remaining.nytDiscovery"
                    className="mx-5 mt-3"
                  />
                )}
                {quotaBlocked && (
                  <div className="mx-5 mt-5 rounded-md border border-purple-primary/25 bg-purple-primary/10 p-3">
                    <p className="text-sm font-semibold text-text-primary">{t('discover.quota.title')}</p>
                    <p className="mt-1 text-xs leading-relaxed text-text-muted">{t('discover.quota.cachedDescription')}</p>
                    <QuotaUsageHint quota={quotaState} labelKey="quota.remaining.nytDiscovery" className="mt-2" />
                    {onOpenPaywall && (
                      <button
                        type="button"
                        onClick={onOpenPaywall}
                        className="mt-2 text-xs font-semibold text-purple-light active:opacity-70"
                      >
                        {t('bookDetails.quota.action')}
                      </button>
                    )}
                  </div>
                )}

                <div className="px-5 mt-5">
                  <p className="text-[16px] font-semibold text-text-primary">{t('discover.trending.title')}</p>
                  <p className="text-[11px] mt-[2px]" style={{ color: 'rgba(100,116,139,0.8)' }}>
                    {t('discover.trending.subtitle')}
                  </p>
                </div>

                {TRENDING_LISTS.map((listName) => (
                  <NytBooksRow key={listName} listName={listName} allowNetwork={allowNytNetwork} />
                ))}

                <div className="px-5 mt-8">
                  <p className="text-[16px] font-semibold text-text-primary">{t('discover.children.title')}</p>
                  <p className="text-[11px] mt-[2px]" style={{ color: 'rgba(100,116,139,0.8)' }}>
                    {t('discover.children.subtitle')}
                  </p>
                </div>

                {CHILDREN_LISTS.map((listName) => (
                  <NytBooksRow key={listName} listName={listName} allowNetwork={allowNytNetwork} />
                ))}

                <div className="h-4" />
              </>
            )}
          </>
        ) : (
          <EmptyState
            icon={<Compass size={48} />}
            title={t('discover.unavailable.title')}
            description={t('discover.unavailable.description')}
          />
        )}
      </main>

      <AdBannerSlot marginAboveBottomDp={64} />

      <BottomNav
        activeTab="discover"
        onTabChange={(tab) => {
          if (tab === 'home') (onOpenHome ?? onOpenLibrary)()
          if (tab === 'biblioteca') onOpenLibrary()
          if (tab === 'profile') onOpenProfile()
        }}
      />
    </div>
  )
}
