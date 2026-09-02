import { ArrowLeft } from 'lucide-react'
import { Spinner } from '../components/ui'
import { SettingsGroup, SettingBlock } from '../components/settings/SettingsLayout'
import {
  ReaderFontControl,
  ReaderFontSizeControl,
  ReaderLineHeightControl,
  ReaderModeControl,
  ReaderPreviewPanel,
  ReaderThemeControl,
  type ReaderStyleMode,
} from '../components/reader/ReaderAppearanceControls'
import { useCapacitorBackButton } from '../hooks/useCapacitorAppListener'
import { useUserSettings } from '../hooks/useUserSettings'
import { useI18n } from '../i18n'

interface SettingsAppearanceScreenProps {
  onBack: () => void
}

export function SettingsAppearanceScreen({ onBack }: SettingsAppearanceScreenProps) {
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

  const readerStyleMode: ReaderStyleMode = !settings.readerDefaults.overrideBookFont && !settings.readerDefaults.overrideBookColors
    ? 'original'
    : 'comfortable'

  function applyComfortableDefaults() {
    const currentFontFamily = settings?.readerDefaults.fontFamily ?? 'classic'

    void saveReaderDefaults({
      fontFamily: currentFontFamily === 'publisher' ? 'classic' : currentFontFamily,
      overrideBookFont: true,
      overrideBookColors: true,
    })
  }

  function handleReaderStyleModeChange(mode: ReaderStyleMode) {
    if (mode === 'original') {
      void saveReaderDefaults({
        fontFamily: 'publisher',
        overrideBookFont: false,
        overrideBookColors: false,
      })
      return
    }

    applyComfortableDefaults()
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
          <h1 className="text-lg font-extrabold tracking-[-0.02em] text-text-primary">{t('settings.appearance.sectionLabel')}</h1>
          <p className="text-xs text-text-muted">{t('settings.appearance.sectionDescription')}</p>
        </div>
      </header>

      <div className="flex flex-col gap-7 px-4 pt-5">
        <SettingsGroup>
          <SettingBlock label={t('settings.appearance.preview.label')} description={t('settings.appearance.preview.description')}>
            <ReaderPreviewPanel
              theme={settings.readerDefaults.readerTheme}
              fontFamily={settings.readerDefaults.fontFamily}
              fontSize={settings.readerDefaults.defaultFontSize}
              lineHeight={settings.readerDefaults.lineHeight}
            >
              {t('settings.appearance.previewText')}
            </ReaderPreviewPanel>
          </SettingBlock>

          <SettingBlock label={t('settings.appearance.theme.label')} description={t('settings.appearance.theme.description')}>
            <ReaderThemeControl
              value={settings.readerDefaults.readerTheme}
              onChange={(value) => void saveReaderDefaults({ readerTheme: value, overrideBookColors: true })}
              surface="base"
            />
          </SettingBlock>

          <SettingBlock label={t('settings.appearance.font.label')} description={t('settings.appearance.font.description')}>
            <ReaderFontControl
              value={settings.readerDefaults.fontFamily}
              onChange={(value) => void saveReaderDefaults({
                fontFamily: value,
                overrideBookFont: value !== 'publisher',
              })}
              surface="base"
            />
          </SettingBlock>

          <SettingBlock label={t('settings.appearance.fontSize.label')} description={t('settings.appearance.fontSize.description')}>
            <ReaderFontSizeControl
              value={settings.readerDefaults.defaultFontSize}
              onChange={(value) => void saveReaderDefaults({ defaultFontSize: value })}
              surface="base"
            />
          </SettingBlock>

          <SettingBlock label={t('settings.appearance.lineHeight.label')} description={t('settings.appearance.lineHeight.description')}>
            <ReaderLineHeightControl
              value={settings.readerDefaults.lineHeight}
              onChange={(value) => void saveReaderDefaults({ lineHeight: value })}
              surface="base"
            />
          </SettingBlock>

          <SettingBlock label={t('settings.appearance.mode.label')} description={t('settings.appearance.mode.description')} divider={false}>
            <ReaderModeControl
              value={readerStyleMode}
              onChange={handleReaderStyleModeChange}
              surface="base"
            />
          </SettingBlock>
        </SettingsGroup>
      </div>
    </div>
  )
}
