import { ArrowLeft, ChevronRight, Compass, Sparkles } from 'lucide-react'
import { Badge, ListItem } from '../components/ui'
import { SettingsGroup } from '../components/settings/SettingsLayout'
import { useEntitlements, useRefreshEntitlementsOnFocus } from '../hooks/useEntitlements'
import { FeatureQuotaService, type FeatureQuotaSnapshot } from '../services/FeatureQuotaService'
import { useCapacitorBackButton } from '../hooks/useCapacitorAppListener'
import { useI18n, type TranslateFn } from '../i18n'

interface SettingsPlanScreenProps {
  onBack: () => void
  onOpenPaywall: () => void
}

export function SettingsPlanScreen({ onBack, onOpenPaywall }: SettingsPlanScreenProps) {
  const entitlements = useEntitlements()
  useRefreshEntitlementsOnFocus()
  const { t } = useI18n()
  useCapacitorBackButton(onBack)

  const bookIntelligenceQuota = FeatureQuotaService.getSnapshot('book-intelligence', { isPro: entitlements.isPro })
  const nytDiscoveryQuota = FeatureQuotaService.getSnapshot('nyt-discovery', { isPro: entitlements.isPro })

  return (
    <div className="min-h-screen pb-12 bg-bg-base text-text-primary">
      <header className="sticky top-0 z-20 flex items-center gap-3 border-b border-white/5 bg-bg-base/95 px-4 pb-3 pt-10 backdrop-blur">
        <button
          onClick={onBack}
          className="-ml-1 rounded-md p-2 text-text-secondary transition-transform active:scale-90"
          aria-label={t('common.back')}
        >
          <ArrowLeft size={20} />
        </button>
        <div className="min-w-0">
          <h1 className="text-lg font-extrabold tracking-[-0.02em] text-text-primary">{t('settings.plan.sectionLabel')}</h1>
          <p className="text-xs text-text-muted">{t('settings.plan.sectionDescription')}</p>
        </div>
      </header>

      <div className="flex flex-col gap-7 px-4 pt-5">
        <SettingsGroup>
          <ListItem
            leading={<Sparkles size={20} className="text-purple-light" />}
            title="NeoReader Pro"
            meta={getPlanMeta(entitlements, t)}
            trailing={(
              <div className="flex items-center gap-2">
                {entitlements.isPro && <Badge tone="success">{t('settings.plan.active')}</Badge>}
                <ChevronRight size={18} />
              </div>
            )}
            onClick={onOpenPaywall}
          />
          <ListItem
            leading={<Sparkles size={20} className="text-purple-light" />}
            title={t('settings.quota.bookIntelligence.title')}
            meta={getQuotaMeta(bookIntelligenceQuota, 'book-intelligence', t)}
            trailing={<Badge tone={getQuotaTone(bookIntelligenceQuota)}>{getQuotaBadge(bookIntelligenceQuota, t)}</Badge>}
          />
          <ListItem
            leading={<Compass size={20} className="text-purple-light" />}
            title={t('settings.quota.nytDiscovery.title')}
            meta={getQuotaMeta(nytDiscoveryQuota, 'nyt-discovery', t)}
            trailing={<Badge tone={getQuotaTone(nytDiscoveryQuota)}>{getQuotaBadge(nytDiscoveryQuota, t)}</Badge>}
            divider={false}
          />
        </SettingsGroup>
      </div>
    </div>
  )
}

function getPlanMeta(
  entitlements: ReturnType<typeof useEntitlements>,
  t: TranslateFn,
): string {
  if (entitlements.isPro) {
    if (entitlements.expiresAt) {
      return t('settings.plan.renewsOn', { date: entitlements.expiresAt.toLocaleDateString('pt-BR') })
    }
    return t('settings.plan.lifetime')
  }
  return t('settings.plan.metaComingSoon')
}

function getQuotaMeta(
  quota: FeatureQuotaSnapshot,
  key: 'book-intelligence' | 'nyt-discovery',
  t: TranslateFn,
): string {
  if (quota.isPro) return t('settings.quota.unlimitedMeta')

  const remaining = quota.remaining ?? 0
  const limit = quota.limit ?? 0
  if (key === 'book-intelligence') {
    return t('settings.quota.bookIntelligence.meta', { remaining, limit })
  }
  return t('settings.quota.nytDiscovery.meta', { remaining, limit })
}

function getQuotaBadge(quota: FeatureQuotaSnapshot, t: TranslateFn): string {
  if (quota.isPro) return t('settings.quota.unlimitedBadge')
  return `${quota.remaining ?? 0}/${quota.limit ?? 0}`
}

function getQuotaTone(quota: FeatureQuotaSnapshot): 'success' | 'warning' | 'error' | 'purple' | 'neutral' {
  if (quota.isPro) return 'success'
  if ((quota.remaining ?? 0) <= 0) return 'warning'
  return 'neutral'
}
