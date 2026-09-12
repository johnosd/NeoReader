import { useCallback, useEffect, useRef, useState } from 'react'
import { ArrowLeft, Languages, Smartphone } from 'lucide-react'
import { Input, Spinner } from '../components/ui'
import { SettingsGroup } from '../components/settings/SettingsLayout'
import { ApiKeyField, KeyVisibilityButton } from '../components/settings/ApiKeyField'
import {
  IDLE_KEY_STATE,
  getTranslationApiKeyValidationMessage,
  type KeyValidationState,
} from '../components/settings/apiKeyValidation'
import { IntegrationHelpBanner } from '../components/IntegrationHelpBanner'
import { useCapacitorBackButton } from '../hooks/useCapacitorAppListener'
import { useUserSettings } from '../hooks/useUserSettings'
import {
  PREMIUM_TRANSLATION_PROVIDER_DEFINITIONS,
  PREMIUM_TRANSLATION_PROVIDER_ORDER,
  isTranslationProviderPlatformRestricted,
} from '../services/TranslationProviderRegistry'
import type { AppSettings, UserSettings } from '../types/settings'
import type { PremiumTranslationProvider } from '../types/translation'
import { useI18n, type MessageKey } from '../i18n'

// `definition.description` (TranslationProviderRegistry.ts) é uma string
// literal pt-BR interna, nunca renderizada direto — mesmo padrão do
// TtsProviderRegistry.ts/SettingsNarrationScreen.tsx: a descrição visível
// passa por i18n, mapeada aqui por provider.
const TRANSLATION_PROVIDER_DESCRIPTION_KEYS: Record<PremiumTranslationProvider, MessageKey> = {
  deepl: 'settings.translationProviders.deepl.description',
  openai: 'settings.translationProviders.openai.description',
  google: 'settings.translationProviders.google.description',
}

interface SettingsTranslationScreenProps {
  onBack: () => void
}

const EMPTY_TRANSLATION_KEY_VISIBILITY: Record<PremiumTranslationProvider, boolean> = {
  deepl: false,
  openai: false,
  google: false,
}

const EMPTY_TRANSLATION_VALIDATION_STATE: Record<PremiumTranslationProvider, KeyValidationState> = {
  deepl: IDLE_KEY_STATE,
  openai: IDLE_KEY_STATE,
  google: IDLE_KEY_STATE,
}

export function SettingsTranslationScreen({ onBack }: SettingsTranslationScreenProps) {
  useCapacitorBackButton(onBack)
  const { settings, saveAppSettings } = useUserSettings()

  if (!settings) {
    return (
      <div className="fixed inset-0 flex items-center justify-center bg-bg-base">
        <Spinner tone="purple" />
      </div>
    )
  }

  return <SettingsTranslationForm onBack={onBack} settings={settings} saveAppSettings={saveAppSettings} />
}

// Componente separado porque só monta depois que `settings` já carregou —
// mesmo padrão de SettingsNarrationScreen (inputs usam o valor inicial como
// lazy initializer do useState, não um useEffect com setState síncrono).
function SettingsTranslationForm({
  onBack,
  settings,
  saveAppSettings,
}: {
  onBack: () => void
  settings: UserSettings
  saveAppSettings: (patch: Partial<AppSettings>) => Promise<void>
}) {
  const { t } = useI18n()
  const [showKeys, setShowKeys] = useState<Record<PremiumTranslationProvider, boolean>>(EMPTY_TRANSLATION_KEY_VISIBILITY)
  const [expandedProvider, setExpandedProvider] = useState<PremiumTranslationProvider | null>(null)
  const [keyInputs, setKeyInputs] = useState<Record<PremiumTranslationProvider, string>>(() => ({
    deepl: settings.appSettings.deeplApiKey,
    openai: settings.appSettings.openaiTranslationApiKey,
    google: settings.appSettings.googleTranslateApiKey,
  }))
  const [validation, setValidation] = useState<Record<PremiumTranslationProvider, KeyValidationState>>(EMPTY_TRANSLATION_VALIDATION_STATE)
  const validationSeqRef = useRef<Record<PremiumTranslationProvider, number>>({ deepl: 0, openai: 0, google: 0 })

  const validateProviderKey = useCallback(async (
    provider: PremiumTranslationProvider,
    rawKey: string,
    persistOnSuccess: boolean,
  ) => {
    const definition = PREMIUM_TRANSLATION_PROVIDER_DEFINITIONS[provider]
    // Defensivo: a UI já esconde o campo de chave pra provider bloqueado
    // por plataforma (R-006) — nunca deveria chegar aqui, mas evita gastar
    // uma chamada de rede fadada a falhar por CORS se chegar de outro jeito.
    if (!definition || isTranslationProviderPlatformRestricted(provider)) return
    const trimmedKey = rawKey.trim()
    const validationSeq = validationSeqRef.current[provider] + 1
    validationSeqRef.current[provider] = validationSeq

    if (!trimmedKey) {
      setValidation((current) => ({ ...current, [provider]: IDLE_KEY_STATE }))
      if (persistOnSuccess) await saveAppSettings({ [definition.apiKeyField]: '' } as Partial<AppSettings>)
      return
    }

    setValidation((current) => ({
      ...current,
      [provider]: { status: 'validating', message: t('settings.translationProviders.validatingProvider', { provider: definition.label }) },
    }))
    const result = await definition.validateApiKey(trimmedKey)
    if (validationSeqRef.current[provider] !== validationSeq) return

    if (result.isValid) {
      if (persistOnSuccess) await saveAppSettings({ [definition.apiKeyField]: trimmedKey } as Partial<AppSettings>)
      setKeyInputs((current) => ({ ...current, [provider]: trimmedKey }))
      setValidation((current) => ({
        ...current,
        [provider]: { status: 'valid', message: getTranslationApiKeyValidationMessage(result.code, t) },
      }))
      return
    }

    setValidation((current) => ({
      ...current,
      [provider]: { status: 'invalid', message: getTranslationApiKeyValidationMessage(result.code, t) },
    }))
  }, [saveAppSettings, t])

  // Revalida em segundo plano as chaves já salvas (mesmo padrão de
  // SettingsNarrationScreen) — só roda uma vez, no mount deste form.
  useEffect(() => {
    for (const provider of PREMIUM_TRANSLATION_PROVIDER_ORDER) {
      const definition = PREMIUM_TRANSLATION_PROVIDER_DEFINITIONS[provider]
      if (!definition || isTranslationProviderPlatformRestricted(provider)) continue
      const key = settings.appSettings[definition.apiKeyField]
      if (key) void validateProviderKey(provider, key, false)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- roda só no mount; settings é o snapshot inicial deste form
  }, [])

  function toggleProvider(id: PremiumTranslationProvider) {
    setExpandedProvider((current) => current === id ? null : id)
  }

  function getValidationHint(provider: PremiumTranslationProvider) {
    const state = validation[provider]
    if (state.status === 'valid') return t('settings.translationProviders.validatedAndSaved')
    if (state.status === 'validating') return state.message
    return undefined
  }

  function getValidationError(provider: PremiumTranslationProvider) {
    const state = validation[provider]
    return state.status === 'invalid' ? state.message : undefined
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
          <h1 className="text-lg font-extrabold tracking-[-0.02em] text-text-primary">{t('settings.translationProviders.sectionLabel')}</h1>
          <p className="text-xs text-text-muted">{t('settings.translationProviders.sectionDescription')}</p>
        </div>
      </header>

      <div className="flex flex-col gap-7 px-4 pt-5">
        <IntegrationHelpBanner
          title={t('settings.translationProviders.helpBanner.title')}
          description={t('settings.translationProviders.helpBanner.description')}
          icon={<Languages size={18} />}
        />

        <SettingsGroup>
          {PREMIUM_TRANSLATION_PROVIDER_ORDER.map((provider, index) => {
            const definition = PREMIUM_TRANSLATION_PROVIDER_DEFINITIONS[provider]
            if (!definition) return null
            const divider = index !== PREMIUM_TRANSLATION_PROVIDER_ORDER.length - 1

            // DeepL/OpenAI bloqueiam CORS fora do app Android (R-006) — nem
            // mostra o campo de chave aqui pra não convidar uma tentativa de
            // "Testar chave" fadada a falhar com um erro de rede confuso.
            if (isTranslationProviderPlatformRestricted(provider)) {
              return (
                <div key={provider} className={divider ? 'border-b border-white/5 p-4' : 'p-4'}>
                  <IntegrationHelpBanner
                    title={definition.label}
                    description={t('settings.translationProviders.androidOnly', { provider: definition.label })}
                    icon={<Smartphone size={18} />}
                    tone="warning"
                  />
                </div>
              )
            }

            return (
              <ApiKeyField
                key={provider}
                label={definition.label}
                description={t(TRANSLATION_PROVIDER_DESCRIPTION_KEYS[provider])}
                icon={<Languages size={18} />}
                state={validation[provider]}
                emptyLabel={t('settings.translationProviders.notConfigured')}
                expanded={expandedProvider === provider}
                onToggleExpanded={() => toggleProvider(provider)}
                divider={divider}
                input={(
                  <Input
                    type={showKeys[provider] ? 'text' : 'password'}
                    value={keyInputs[provider]}
                    onChange={(event) => {
                      setKeyInputs((current) => ({ ...current, [provider]: event.target.value }))
                      if (validation[provider].status !== 'validating') {
                        setValidation((current) => ({ ...current, [provider]: IDLE_KEY_STATE }))
                      }
                    }}
                    onBlur={() => void validateProviderKey(provider, keyInputs[provider], true)}
                    placeholder={definition.placeholder}
                    autoComplete="off"
                    spellCheck={false}
                    error={getValidationError(provider)}
                    hint={getValidationHint(provider)}
                    className="h-12 font-mono text-sm"
                    rightSlot={(
                      <KeyVisibilityButton
                        shown={showKeys[provider]}
                        onClick={() => setShowKeys((current) => ({ ...current, [provider]: !current[provider] }))}
                      />
                    )}
                  />
                )}
              />
            )
          })}
        </SettingsGroup>
      </div>
    </div>
  )
}
