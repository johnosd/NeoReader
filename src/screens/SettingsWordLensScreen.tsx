import { ArrowLeft } from 'lucide-react'
import { Spinner, Switch } from '../components/ui'
import { SettingsGroup, SettingBlock } from '../components/settings/SettingsLayout'
import { useCapacitorBackButton } from '../hooks/useCapacitorAppListener'
import { useUserSettings } from '../hooks/useUserSettings'
import { useI18n } from '../i18n'
import { CEFR_LEVELS, type CefrLevel } from '../types/wordLens'

interface SettingsWordLensScreenProps {
  onBack: () => void
}

export function SettingsWordLensScreen({ onBack }: SettingsWordLensScreenProps) {
  const { t } = useI18n()
  useCapacitorBackButton(onBack)
  const { settings, saveReaderDefaults } = useUserSettings()

  if (!settings) {
    return (
      <div className="fixed inset-0 flex items-center justify-center bg-bg-base">
        <Spinner tone="purple" />
      </div>
    )
  }

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
          <h1 className="text-lg font-extrabold tracking-[-0.02em] text-text-primary">{t('settings.wordLens.sectionLabel')}</h1>
          <p className="text-xs text-text-muted">{t('settings.wordLens.sectionDescription')}</p>
        </div>
      </header>

      <div className="flex flex-col gap-7 px-4 pt-5">
        <SettingsGroup>
          <SettingBlock
            label={t('settings.wordLens.enabled.label')}
            description={t('settings.wordLens.enabled.description')}
          >
            <Switch
              checked={settings.readerDefaults.wordLensEnabled}
              onChange={(checked) => void saveReaderDefaults({ wordLensEnabled: checked })}
              aria-label={t('settings.wordLens.enabled.aria')}
            />
          </SettingBlock>
          <SettingBlock
            label={t('settings.wordLens.level.label')}
            description={t('settings.wordLens.level.description')}
          >
            <select
              value={settings.readerDefaults.wordLensLevel}
              onChange={(event) => void saveReaderDefaults({ wordLensLevel: event.target.value as CefrLevel })}
              disabled={!settings.readerDefaults.wordLensEnabled}
              aria-label={t('settings.wordLens.level.aria')}
              className="w-full rounded-md border border-border bg-bg-base px-3 py-2 text-sm text-text-primary disabled:cursor-not-allowed disabled:opacity-50"
            >
              {CEFR_LEVELS.map((level) => <option key={level} value={level}>{level}</option>)}
            </select>
            <p className="mt-2 text-xs leading-snug text-text-muted">
              {t('settings.wordLens.approximationNote')}
            </p>
          </SettingBlock>
          <SettingBlock
            label={t('settings.wordLens.legend.label')}
            description={t('settings.wordLens.legend.description')}
          >
            <div className="flex items-center gap-3 text-xs text-text-secondary">
              <span
                aria-hidden="true"
                className="bg-warning/15 underline decoration-warning decoration-solid underline-offset-2"
              >
                {t('settings.wordLens.legend.sample')}
              </span>
              <span>{t('settings.wordLens.legend.meaning')}</span>
            </div>
          </SettingBlock>
          <SettingBlock
            label={t('settings.wordLens.sources.label')}
            description={t('settings.wordLens.sources.description')}
            divider={false}
          >
            <p className="text-xs leading-relaxed text-text-muted">
              {t('settings.wordLens.sources.limitations')}
            </p>
          </SettingBlock>
        </SettingsGroup>
      </div>
    </div>
  )
}
