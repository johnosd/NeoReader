import { useState } from 'react'
import { ArrowLeft, PlayCircle } from 'lucide-react'
import { Input, Spinner } from '../components/ui'
import { SettingsGroup } from '../components/settings/SettingsLayout'
import { ApiKeyField, KeyVisibilityButton } from '../components/settings/ApiKeyField'
import { IDLE_KEY_STATE, getEducationStatus, type KeyValidationState } from '../components/settings/apiKeyValidation'
import { IntegrationEducationCard } from '../components/IntegrationEducationCard'
import { useCapacitorBackButton } from '../hooks/useCapacitorAppListener'
import { useUserSettings } from '../hooks/useUserSettings'
import type { AppSettings, UserSettings } from '../types/settings'
import { useI18n } from '../i18n'

interface SettingsIntegrationsScreenProps {
  onBack: () => void
}

export function SettingsIntegrationsScreen({ onBack }: SettingsIntegrationsScreenProps) {
  useCapacitorBackButton(onBack)
  const { settings, saveAppSettings } = useUserSettings()

  if (!settings) {
    return (
      <div className="fixed inset-0 flex items-center justify-center bg-bg-base">
        <Spinner tone="purple" />
      </div>
    )
  }

  return <SettingsIntegrationsForm onBack={onBack} settings={settings} saveAppSettings={saveAppSettings} />
}

// Componente separado porque só monta depois que `settings` já carregou —
// o input de chave usa o valor inicial como lazy initializer do useState
// (não um useEffect com setState síncrono, que causaria cascading renders).
function SettingsIntegrationsForm({
  onBack,
  settings,
  saveAppSettings,
}: {
  onBack: () => void
  settings: UserSettings
  saveAppSettings: (patch: Partial<AppSettings>) => Promise<void>
}) {
  const { t } = useI18n()

  const [showYoutubeKey, setShowYoutubeKey] = useState(false)
  const [expanded, setExpanded] = useState(false)
  const [youtubeKeyInput, setYoutubeKeyInput] = useState(() => settings.appSettings.youtubeApiKey)
  const [youtubeValidation, setYoutubeValidation] = useState<KeyValidationState>(() => (
    settings.appSettings.youtubeApiKey ? { status: 'valid' } : IDLE_KEY_STATE
  ))

  // YouTube key não tem endpoint de validação público — salva direto no blur
  async function saveYoutubeKey(rawKey: string) {
    const trimmedKey = rawKey.trim()
    setYoutubeKeyInput(trimmedKey)
    await saveAppSettings({ youtubeApiKey: trimmedKey })
    setYoutubeValidation(trimmedKey ? { status: 'valid' } : IDLE_KEY_STATE)
  }

  const educationStatus = getEducationStatus(youtubeValidation, t)

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
          <h1 className="text-lg font-extrabold tracking-[-0.02em] text-text-primary">{t('settings.integrations.sectionLabel')}</h1>
          <p className="text-xs text-text-muted">{t('settings.integrations.description')}</p>
        </div>
      </header>

      <div className="flex flex-col gap-7 px-4 pt-5">
        <SettingsGroup>
          <ApiKeyField
            label="YouTube Data API"
            description={t('settings.integrations.youtube.description')}
            icon={<PlayCircle size={18} />}
            state={youtubeValidation}
            emptyLabel={t('settings.integrations.youtube.emptyLabel')}
            expanded={expanded}
            onToggleExpanded={() => setExpanded((current) => !current)}
            divider={false}
            input={(
              <div className="flex flex-col gap-3">
                <IntegrationEducationCard
                  title="YouTube Data API"
                  description={t('settings.integrations.youtube.description')}
                  enables={t('settings.integrations.youtube.enables')}
                  bestFor={t('settings.integrations.youtube.bestFor')}
                  setup={t('settings.integrations.youtube.setup')}
                  privacy={t('settings.integrations.privacy.localKey')}
                  statusLabel={educationStatus.statusLabel}
                  statusTone={educationStatus.statusTone}
                  icon={<PlayCircle size={18} />}
                />
                <Input
                  type={showYoutubeKey ? 'text' : 'password'}
                  value={youtubeKeyInput}
                  onChange={(event) => {
                    setYoutubeKeyInput(event.target.value)
                    setYoutubeValidation(IDLE_KEY_STATE)
                  }}
                  onBlur={() => void saveYoutubeKey(youtubeKeyInput)}
                  placeholder="AIza..."
                  autoComplete="off"
                  spellCheck={false}
                  className="h-12 font-mono text-sm"
                  rightSlot={(
                    <KeyVisibilityButton
                      shown={showYoutubeKey}
                      onClick={() => setShowYoutubeKey((value) => !value)}
                    />
                  )}
                />
              </div>
            )}
          />
        </SettingsGroup>
      </div>
    </div>
  )
}
