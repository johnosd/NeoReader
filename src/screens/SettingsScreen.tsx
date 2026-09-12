import { ArrowLeft, ChevronRight, CloudUpload, Globe, KeyRound, Languages, Palette, Rss, ScanText, Sparkles, Volume2 } from 'lucide-react'
import { Badge, ListItem } from '../components/ui'
import { SettingsGroup } from '../components/settings/SettingsLayout'
import { useEntitlements } from '../hooks/useEntitlements'
import { useCapacitorBackButton } from '../hooks/useCapacitorAppListener'
import { useI18n } from '../i18n'

interface SettingsScreenProps {
  onBack: () => void
  onOpenPlan: () => void
  onOpenLanguage: () => void
  onOpenAppearance: () => void
  onOpenWordLens: () => void
  onOpenNarration: () => void
  onOpenTranslation: () => void
  onOpenIntegrations: () => void
  onOpenOpdsCatalogs: () => void
  onOpenSync: () => void
}

export function SettingsScreen({
  onBack,
  onOpenPlan,
  onOpenLanguage,
  onOpenAppearance,
  onOpenWordLens,
  onOpenNarration,
  onOpenTranslation,
  onOpenIntegrations,
  onOpenOpdsCatalogs,
  onOpenSync,
}: SettingsScreenProps) {
  const entitlements = useEntitlements()
  const { t } = useI18n()
  useCapacitorBackButton(onBack)

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
          <h1 className="text-lg font-extrabold tracking-[-0.02em] text-text-primary">{t('settings.header.title')}</h1>
          <p className="text-xs text-text-muted">{t('settings.header.subtitle')}</p>
        </div>
      </header>

      <div className="flex flex-col gap-7 px-4 pt-5">
        <SettingsGroup>
          <ListItem
            leading={<Sparkles size={20} className="text-purple-light" />}
            title={t('settings.plan.sectionLabel')}
            trailing={(
              <div className="flex items-center gap-2">
                <Badge tone={entitlements.isPro ? 'success' : 'neutral'}>
                  {entitlements.isPro ? t('settings.plan.tierPro') : t('settings.plan.tierFree')}
                </Badge>
                <ChevronRight size={18} />
              </div>
            )}
            onClick={onOpenPlan}
          />
          <ListItem
            leading={<Globe size={20} />}
            title={t('settings.appLanguage.sectionLabel')}
            meta={t('settings.language.sectionDescription')}
            trailing={<ChevronRight size={18} />}
            onClick={onOpenLanguage}
          />
          <ListItem
            leading={<Palette size={20} />}
            title={t('settings.appearance.sectionLabel')}
            meta={t('settings.appearance.sectionDescription')}
            trailing={<ChevronRight size={18} />}
            onClick={onOpenAppearance}
          />
          <ListItem
            leading={<ScanText size={20} />}
            title={t('settings.wordLens.sectionLabel')}
            meta={t('settings.wordLens.sectionDescription')}
            trailing={<ChevronRight size={18} />}
            onClick={onOpenWordLens}
          />
          <ListItem
            leading={<Volume2 size={20} />}
            title={t('settings.narration.sectionLabel')}
            meta={t('settings.narration.sectionDescription')}
            trailing={<ChevronRight size={18} />}
            onClick={onOpenNarration}
          />
          <ListItem
            leading={<Languages size={20} />}
            title={t('settings.translationProviders.sectionLabel')}
            meta={t('settings.translationProviders.sectionDescription')}
            trailing={<ChevronRight size={18} />}
            onClick={onOpenTranslation}
          />
          <ListItem
            leading={<KeyRound size={20} />}
            title={t('settings.integrations.sectionLabel')}
            meta={t('settings.integrations.description')}
            trailing={<ChevronRight size={18} />}
            onClick={onOpenIntegrations}
          />
          <ListItem
            leading={<Rss size={20} />}
            title={t('settings.opdsCatalogs.sectionLabel')}
            meta={t('settings.opdsCatalogs.sectionDescription')}
            trailing={<ChevronRight size={18} />}
            onClick={onOpenOpdsCatalogs}
          />
          <ListItem
            leading={<CloudUpload size={20} />}
            title={t('settings.cloudSync.sectionLabel')}
            meta={t('settings.cloudSync.sectionDescription')}
            trailing={<ChevronRight size={18} />}
            onClick={onOpenSync}
            divider={false}
          />
        </SettingsGroup>
      </div>
    </div>
  )
}
