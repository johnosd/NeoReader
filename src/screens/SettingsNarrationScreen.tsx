import { useCallback, useEffect, useRef, useState } from 'react'
import { ArrowLeft, Mic2, Smartphone, Volume2 } from 'lucide-react'
import { Badge, Input, ListItem, Spinner, Switch } from '../components/ui'
import { SettingsGroup, InfoRow } from '../components/settings/SettingsLayout'
import { ApiKeyField, KeyVisibilityButton } from '../components/settings/ApiKeyField'
import {
  IDLE_KEY_STATE,
  getApiKeyValidationMessage,
  getEducationStatus,
  type KeyValidationState,
} from '../components/settings/apiKeyValidation'
import { IntegrationHelpBanner } from '../components/IntegrationHelpBanner'
import { IntegrationEducationCard } from '../components/IntegrationEducationCard'
import { WakeLockService } from '../services/WakeLockService'
import { useCapacitorBackButton } from '../hooks/useCapacitorAppListener'
import { useUserSettings } from '../hooks/useUserSettings'
import { db } from '../db/database'
import {
  PREMIUM_TTS_PROVIDER_DEFINITIONS,
  PREMIUM_TTS_PROVIDER_ORDER,
} from '../services/TtsProviderRegistry'
import type { AppSettings, UserSettings } from '../types/settings'
import type { PremiumTtsProvider } from '../types/tts'
import { useI18n, type MessageKey } from '../i18n'

interface SettingsNarrationScreenProps {
  onBack: () => void
}

const EMPTY_TTS_KEY_VISIBILITY: Record<PremiumTtsProvider, boolean> = {
  speechify: false,
  elevenlabs: false,
  fishaudio: false,
}

const EMPTY_TTS_VALIDATION_STATE: Record<PremiumTtsProvider, KeyValidationState> = {
  speechify: IDLE_KEY_STATE,
  elevenlabs: IDLE_KEY_STATE,
  fishaudio: IDLE_KEY_STATE,
}

const TTS_PROVIDER_EDUCATION_KEYS: Record<PremiumTtsProvider, {
  description: MessageKey
  enables: MessageKey
  bestFor: MessageKey
  setup: MessageKey
}> = {
  speechify: {
    description: 'settings.integrations.speechify.description',
    enables: 'settings.integrations.speechify.enables',
    bestFor: 'settings.integrations.speechify.bestFor',
    setup: 'settings.integrations.speechify.setup',
  },
  elevenlabs: {
    description: 'settings.integrations.elevenlabs.description',
    enables: 'settings.integrations.elevenlabs.enables',
    bestFor: 'settings.integrations.elevenlabs.bestFor',
    setup: 'settings.integrations.elevenlabs.setup',
  },
  fishaudio: {
    description: 'settings.integrations.fishaudio.description',
    enables: 'settings.integrations.fishaudio.enables',
    bestFor: 'settings.integrations.fishaudio.bestFor',
    setup: 'settings.integrations.fishaudio.setup',
  },
}

function getProviderIcon(provider: PremiumTtsProvider) {
  if (provider === 'speechify') return <Mic2 size={18} />
  return <Volume2 size={18} />
}

async function logSavedElevenLabsVoiceSelections() {
  if (!import.meta.env.DEV) return

  const rows = await db.bookSettings.toArray()
  const savedSelections = rows
    .filter((row) => row.ttsElevenLabsVoiceId)
    .map((row) => ({
      bookId: row.bookId,
      voiceId: row.ttsElevenLabsVoiceId,
      voiceLabel: row.ttsElevenLabsVoiceLabel,
      updatedAt: row.updatedAt,
    }))

  console.debug('[ElevenLabs:settings:saved-voices]', {
    count: savedSelections.length,
    selections: savedSelections.slice(0, 20),
  })
}

export function SettingsNarrationScreen({ onBack }: SettingsNarrationScreenProps) {
  useCapacitorBackButton(onBack)
  const { settings, saveAppSettings } = useUserSettings()

  if (!settings) {
    return (
      <div className="fixed inset-0 flex items-center justify-center bg-bg-base">
        <Spinner tone="purple" />
      </div>
    )
  }

  return <SettingsNarrationForm onBack={onBack} settings={settings} saveAppSettings={saveAppSettings} />
}

// Componente separado porque só monta depois que `settings` já carregou —
// os inputs de chave TTS usam o valor inicial como lazy initializer do
// useState (não um useEffect com setState síncrono, que causaria cascading
// renders — mesmo padrão de SettingsIntegrationsScreen).
function SettingsNarrationForm({
  onBack,
  settings,
  saveAppSettings,
}: {
  onBack: () => void
  settings: UserSettings
  saveAppSettings: (patch: Partial<AppSettings>) => Promise<void>
}) {
  const { t } = useI18n()
  const [keepAwakeEnabled, setKeepAwakeEnabled] = useState(() => WakeLockService.isEnabled())

  const [showTtsKeys, setShowTtsKeys] = useState<Record<PremiumTtsProvider, boolean>>(EMPTY_TTS_KEY_VISIBILITY)
  const [expandedProvider, setExpandedProvider] = useState<PremiumTtsProvider | null>(null)
  const [ttsKeyInputs, setTtsKeyInputs] = useState<Record<PremiumTtsProvider, string>>(() => ({
    speechify: settings.appSettings.speechifyApiKey,
    elevenlabs: settings.appSettings.elevenLabsApiKey,
    fishaudio: settings.appSettings.fishAudioApiKey,
  }))
  const [ttsValidation, setTtsValidation] = useState<Record<PremiumTtsProvider, KeyValidationState>>(EMPTY_TTS_VALIDATION_STATE)
  const ttsValidationSeqRef = useRef<Record<PremiumTtsProvider, number>>({
    speechify: 0,
    elevenlabs: 0,
    fishaudio: 0,
  })

  const validateTtsProviderKey = useCallback(async (
    provider: PremiumTtsProvider,
    rawKey: string,
    persistOnSuccess: boolean,
  ) => {
    const definition = PREMIUM_TTS_PROVIDER_DEFINITIONS[provider]
    const trimmedKey = rawKey.trim()
    const validationSeq = ttsValidationSeqRef.current[provider] + 1
    ttsValidationSeqRef.current[provider] = validationSeq

    if (!trimmedKey) {
      setTtsValidation((current) => ({ ...current, [provider]: IDLE_KEY_STATE }))
      if (persistOnSuccess) await saveAppSettings({ [definition.apiKeyField]: '' } as Partial<AppSettings>)
      return
    }

    setTtsValidation((current) => ({
      ...current,
      [provider]: { status: 'validating', message: t('settings.tts.validatingProvider', { provider: definition.label }) },
    }))
    const result = await definition.validateApiKey(trimmedKey)
    if (ttsValidationSeqRef.current[provider] !== validationSeq) return

    if (result.isValid) {
      if (persistOnSuccess) {
        await saveAppSettings({ [definition.apiKeyField]: trimmedKey } as Partial<AppSettings>)
        if (provider === 'elevenlabs') await logSavedElevenLabsVoiceSelections()
      }
      setTtsKeyInputs((current) => ({ ...current, [provider]: trimmedKey }))
      setTtsValidation((current) => ({
        ...current,
        [provider]: {
          status: 'valid',
          message: getApiKeyValidationMessage(result.code, t),
        },
      }))
      return
    }

    setTtsValidation((current) => ({
      ...current,
      [provider]: {
        status: 'invalid',
        message: getApiKeyValidationMessage(result.code, t),
      },
    }))
  }, [saveAppSettings, t])

  // Valida em segundo plano as chaves já salvas (badge "Conectado" some se a
  // key expirou) — só roda uma vez, no mount deste form; o setState real
  // acontece dentro do await de validateTtsProviderKey, não sincronamente aqui.
  useEffect(() => {
    for (const provider of PREMIUM_TTS_PROVIDER_ORDER) {
      const key = settings.appSettings[PREMIUM_TTS_PROVIDER_DEFINITIONS[provider].apiKeyField]
      if (key) void validateTtsProviderKey(provider, key, false)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- roda só no mount; settings é o snapshot inicial deste form
  }, [])

  function getTtsValidationHint(provider: PremiumTtsProvider) {
    const state = ttsValidation[provider]
    if (state.status === 'valid') return t('settings.tts.validatedAndSaved')
    if (state.status === 'validating') return state.message
    return undefined
  }

  function toggleProvider(id: PremiumTtsProvider) {
    setExpandedProvider((current) => current === id ? null : id)
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
          <h1 className="text-lg font-extrabold tracking-[-0.02em] text-text-primary">{t('settings.narration.sectionLabel')}</h1>
          <p className="text-xs text-text-muted">{t('settings.narration.sectionDescription')}</p>
        </div>
      </header>

      <div className="flex flex-col gap-7 px-4 pt-5">
        <div className="mb-3">
          <IntegrationHelpBanner
            title={t('settings.integrations.voiceFallback.title')}
            description={t('settings.integrations.voiceFallback.description')}
            icon={<Volume2 size={18} />}
          />
        </div>
        <SettingsGroup>
          <InfoRow
            icon={<Mic2 size={18} />}
            title={t('settings.narration.native.title')}
            description={t('settings.narration.native.description')}
            badge={<Badge tone="success">{t('settings.plan.active')}</Badge>}
          />
          <ListItem
            leading={<Smartphone size={20} />}
            title={t('settings.narration.keepAwake.title')}
            meta={t('settings.narration.keepAwake.description')}
            trailing={(
              <Switch
                checked={keepAwakeEnabled}
                onChange={(value) => {
                  WakeLockService.setEnabled(value)
                  setKeepAwakeEnabled(value)
                }}
                aria-label={t('settings.narration.keepAwake.title')}
              />
            )}
          />
          {PREMIUM_TTS_PROVIDER_ORDER.map((provider, index) => {
            const definition = PREMIUM_TTS_PROVIDER_DEFINITIONS[provider]
            const validation = ttsValidation[provider]
            const educationKeys = TTS_PROVIDER_EDUCATION_KEYS[provider]
            const educationStatus = getEducationStatus(validation, t)
            return (
              <ApiKeyField
                key={provider}
                label={definition.label}
                description={t(educationKeys.description)}
                icon={getProviderIcon(provider)}
                state={validation}
                emptyLabel={provider === 'speechify'
                  ? t('settings.integrations.tts.nativeFallbackEmptyLabel')
                  : t('settings.integrations.tts.emptyLabel')}
                expanded={expandedProvider === provider}
                onToggleExpanded={() => toggleProvider(provider)}
                divider={index !== PREMIUM_TTS_PROVIDER_ORDER.length - 1}
                input={(
                  <div className="flex flex-col gap-3">
                    <IntegrationEducationCard
                      title={definition.label}
                      description={t(educationKeys.description)}
                      enables={t(educationKeys.enables)}
                      bestFor={t(educationKeys.bestFor)}
                      setup={t(educationKeys.setup)}
                      privacy={t('settings.integrations.privacy.localKey')}
                      statusLabel={educationStatus.statusLabel}
                      statusTone={educationStatus.statusTone}
                      icon={getProviderIcon(provider)}
                    />
                    <Input
                      type={showTtsKeys[provider] ? 'text' : 'password'}
                      value={ttsKeyInputs[provider]}
                      onChange={(event) => {
                        setTtsKeyInputs((current) => ({ ...current, [provider]: event.target.value }))
                        if (validation.status !== 'validating') {
                          setTtsValidation((current) => ({ ...current, [provider]: IDLE_KEY_STATE }))
                        }
                      }}
                      onBlur={() => void validateTtsProviderKey(provider, ttsKeyInputs[provider], true)}
                      placeholder={definition.placeholder}
                      autoComplete="off"
                      spellCheck={false}
                      error={validation.status === 'invalid' ? validation.message : undefined}
                      hint={getTtsValidationHint(provider)}
                      className="h-12 font-mono text-sm"
                      rightSlot={(
                        <KeyVisibilityButton
                          shown={showTtsKeys[provider]}
                          onClick={() => setShowTtsKeys((current) => ({ ...current, [provider]: !current[provider] }))}
                        />
                      )}
                    />
                  </div>
                )}
              />
            )
          })}
        </SettingsGroup>
      </div>
    </div>
  )
}
