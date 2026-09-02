import { useState } from 'react'
import { ArrowLeft, Check, ChevronRight, Globe } from 'lucide-react'
import { BottomSheet, ListItem, Spinner } from '../components/ui'
import { SettingsGroup } from '../components/settings/SettingsLayout'
import { useCapacitorBackButton } from '../hooks/useCapacitorAppListener'
import { useUserSettings } from '../hooks/useUserSettings'
import { getLanguageLabel, TRANSLATION_LANGUAGE_OPTIONS } from '../utils/languageOptions'
import { APP_LOCALE_PREFERENCES, useI18n, type AppLocalePreference, type TranslateFn } from '../i18n'

interface SettingsLanguageScreenProps {
  onBack: () => void
}

function getAppLocalePreferenceLabel(preference: AppLocalePreference, t: TranslateFn): string {
  if (preference === 'pt-BR') return t('settings.appLanguage.ptBR')
  if (preference === 'en') return t('settings.appLanguage.en')
  if (preference === 'es') return t('settings.appLanguage.es')
  return t('settings.appLanguage.auto')
}

export function SettingsLanguageScreen({ onBack }: SettingsLanguageScreenProps) {
  const { localePreference, setLocalePreference, t } = useI18n()
  useCapacitorBackButton(onBack)
  const { settings, saveAppSettings } = useUserSettings()
  const [appLangSheetOpen, setAppLangSheetOpen] = useState(false)
  const [langSheetOpen, setLangSheetOpen] = useState(false)

  if (!settings) {
    return (
      <div className="fixed inset-0 flex items-center justify-center bg-bg-base">
        <Spinner tone="purple" />
      </div>
    )
  }

  const currentAppLocalePreference = settings.appSettings.appLocale ?? localePreference
  const currentAppLocale = getAppLocalePreferenceLabel(currentAppLocalePreference, t)
  const currentLang = getLanguageLabel(settings.appSettings.translationTargetLang) ?? settings.appSettings.translationTargetLang

  async function saveAppLocalePreference(preference: AppLocalePreference) {
    await saveAppSettings({ appLocale: preference })
    setLocalePreference(preference)
    setAppLangSheetOpen(false)
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
          <h1 className="text-lg font-extrabold tracking-[-0.02em] text-text-primary">{t('settings.appLanguage.sectionLabel')}</h1>
          <p className="text-xs text-text-muted">{t('settings.language.sectionDescription')}</p>
        </div>
      </header>

      <div className="flex flex-col gap-7 px-4 pt-5">
        <SettingsGroup>
          <ListItem
            leading={<Globe size={20} />}
            title={t('settings.appLanguage.title')}
            meta={currentAppLocale}
            trailing={<ChevronRight size={18} />}
            onClick={() => setAppLangSheetOpen(true)}
          />
          <ListItem
            leading={<Globe size={20} />}
            title={t('settings.translation.defaultLanguage')}
            meta={currentLang}
            trailing={<ChevronRight size={18} />}
            onClick={() => setLangSheetOpen(true)}
            divider={false}
          />
        </SettingsGroup>
      </div>

      <BottomSheet
        open={appLangSheetOpen}
        onClose={() => setAppLangSheetOpen(false)}
        title={t('settings.appLanguage.sheetTitle')}
      >
        <div className="-mx-4">
          {APP_LOCALE_PREFERENCES.map((preference) => {
            const active = currentAppLocalePreference === preference
            return (
              <ListItem
                key={preference}
                title={getAppLocalePreferenceLabel(preference, t)}
                meta={preference === 'auto' ? t('settings.appLanguage.autoMeta') : undefined}
                trailing={active ? <Check size={18} className="text-purple-light" /> : undefined}
                onClick={() => {
                  void saveAppLocalePreference(preference)
                }}
                divider={preference !== APP_LOCALE_PREFERENCES[APP_LOCALE_PREFERENCES.length - 1]}
              />
            )
          })}
        </div>
      </BottomSheet>

      <BottomSheet
        open={langSheetOpen}
        onClose={() => setLangSheetOpen(false)}
        title={t('settings.translation.defaultLanguage')}
      >
        <div className="-mx-4">
          {TRANSLATION_LANGUAGE_OPTIONS.map((lang) => {
            const active = settings.appSettings.translationTargetLang === lang.code
            return (
              <ListItem
                key={lang.code}
                title={lang.label}
                trailing={active ? <Check size={18} className="text-purple-light" /> : undefined}
                onClick={() => {
                  void saveAppSettings({ translationTargetLang: lang.code })
                  setLangSheetOpen(false)
                }}
                divider={lang.code !== TRANSLATION_LANGUAGE_OPTIONS[TRANSLATION_LANGUAGE_OPTIONS.length - 1].code}
              />
            )
          })}
        </div>
      </BottomSheet>
    </div>
  )
}
