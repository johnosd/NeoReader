import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import { ArrowLeft, Check, ChevronDown, ChevronRight, CloudUpload, Compass, Eye, EyeOff, Gauge, Globe, Info, KeyRound, Mic2, Palette, PlayCircle, Smartphone, Sparkles, Volume2 } from 'lucide-react'
import { Badge, BottomSheet, Input, ListItem, Spinner, Switch } from '../components/ui'
import { WakeLockService } from '../services/WakeLockService'
import { IntegrationEducationCard } from '../components/IntegrationEducationCard'
import { IntegrationHelpBanner } from '../components/IntegrationHelpBanner'
import { useEntitlements, useRefreshEntitlementsOnFocus } from '../hooks/useEntitlements'
import { useBookmarkDriveSyncStatus } from '../hooks/useBookmarkDriveSyncStatus'
import { FeatureQuotaService, type FeatureQuotaSnapshot } from '../services/FeatureQuotaService'
import {
  ReaderFontControl,
  ReaderFontSizeControl,
  ReaderLineHeightControl,
  ReaderModeControl,
  ReaderPreviewPanel,
  ReaderThemeControl,
  type ReaderStyleMode,
} from '../components/reader/ReaderAppearanceControls'
import { db } from '../db/database'
import { getSettings, updateAppSettings, updateReaderDefaults } from '../db/settings'
import {
  PREMIUM_TTS_PROVIDER_DEFINITIONS,
  PREMIUM_TTS_PROVIDER_ORDER,
  type ApiKeyValidationCode,
} from '../services/TtsProviderRegistry'
import { useCapacitorBackButton } from '../hooks/useCapacitorAppListener'
import type { AppSettings, ReaderDefaults, UserSettings } from '../types/settings'
import type { PremiumTtsProvider } from '../types/tts'
import { getLanguageLabel, TRANSLATION_LANGUAGE_OPTIONS } from '../utils/languageOptions'
import { APP_LOCALE_PREFERENCES, useI18n, type AppLocalePreference, type MessageKey, type TranslateFn } from '../i18n'

interface SettingsScreenProps {
  onBack: () => void
  onOpenPaywall: () => void
}

type KeyValidationStatus = 'idle' | 'validating' | 'valid' | 'invalid'
type IntegrationId = PremiumTtsProvider | 'youtube'

interface KeyValidationState {
  status: KeyValidationStatus
  message?: string
}

const IDLE_KEY_STATE: KeyValidationState = { status: 'idle' }

const EMPTY_TTS_KEY_INPUTS: Record<PremiumTtsProvider, string> = {
  speechify: '',
  elevenlabs: '',
  fishaudio: '',
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

function ValidationBadge({ state, emptyLabel }: { state: KeyValidationState; emptyLabel: string }) {
  const { t } = useI18n()

  if (state.status === 'validating') {
    return <Badge tone="neutral">{t('settings.status.validatingKey')}</Badge>
  }
  if (state.status === 'valid') {
    return (
      <Badge tone="success">
        <Check size={11} /> {t('settings.status.validKey')}
      </Badge>
    )
  }
  if (state.status === 'invalid') {
    return <Badge tone="error">{t('settings.status.invalidKey')}</Badge>
  }
  return <p className="text-xs text-text-muted">{emptyLabel}</p>
}

function getApiKeyValidationMessage(code: ApiKeyValidationCode | undefined, t: TranslateFn): string {
  if (code === 'empty') return t('settings.apiKey.validation.empty')
  if (code === 'valid') return t('settings.apiKey.validation.valid')
  if (code === 'invalid') return t('settings.apiKey.validation.invalid')
  if (code === 'timeout') return t('settings.apiKey.validation.timeout')
  if (code === 'no_credits') return t('settings.apiKey.validation.noCredits')
  return t('settings.apiKey.validation.unavailable')
}

function getEducationStatus(state: KeyValidationState, t: TranslateFn): {
  statusLabel: string
  statusTone: 'success' | 'warning' | 'neutral'
} {
  if (state.status === 'valid') return { statusLabel: t('settings.status.connected'), statusTone: 'success' }
  if (state.status === 'invalid') return { statusLabel: t('settings.status.invalid'), statusTone: 'warning' }
  if (state.status === 'validating') return { statusLabel: t('settings.status.validating'), statusTone: 'neutral' }
  return { statusLabel: t('settings.status.notConfigured'), statusTone: 'neutral' }
}

export function SettingsScreen({ onBack, onOpenPaywall }: SettingsScreenProps) {
  const entitlements = useEntitlements()
  const bookmarkSyncStatus = useBookmarkDriveSyncStatus(entitlements.isPro)
  useRefreshEntitlementsOnFocus()
  const [settings, setSettings] = useState<UserSettings | null>(null)
  const [showTtsKeys, setShowTtsKeys] = useState<Record<PremiumTtsProvider, boolean>>(EMPTY_TTS_KEY_VISIBILITY)
  const [showYoutubeKey, setShowYoutubeKey] = useState(false)
  const [expandedIntegration, setExpandedIntegration] = useState<IntegrationId | null>(null)
  const [ttsKeyInputs, setTtsKeyInputs] = useState<Record<PremiumTtsProvider, string>>(EMPTY_TTS_KEY_INPUTS)
  const [youtubeKeyInput, setYoutubeKeyInput] = useState('')
  const [ttsValidation, setTtsValidation] = useState<Record<PremiumTtsProvider, KeyValidationState>>(EMPTY_TTS_VALIDATION_STATE)
  const [youtubeValidation, setYoutubeValidation] = useState<KeyValidationState>(IDLE_KEY_STATE)
  const [appLangSheetOpen, setAppLangSheetOpen] = useState(false)
  const [langSheetOpen, setLangSheetOpen] = useState(false)
  const [keepAwakeEnabled, setKeepAwakeEnabled] = useState(() => WakeLockService.isEnabled())
  const { localePreference, setLocalePreference, t } = useI18n()
  const ttsValidationSeqRef = useRef<Record<PremiumTtsProvider, number>>({
    speechify: 0,
    elevenlabs: 0,
    fishaudio: 0,
  })

  useCapacitorBackButton(onBack)

  const saveAppSettings = useCallback(async (patch: Partial<AppSettings>) => {
    await updateAppSettings(patch)
    setSettings((previous) => previous ? {
      ...previous,
      appSettings: { ...previous.appSettings, ...patch },
    } : previous)
  }, [])

  async function saveReaderDefaults(patch: Partial<ReaderDefaults>) {
    await updateReaderDefaults(patch)
    setSettings((previous) => previous ? {
      ...previous,
      readerDefaults: { ...previous.readerDefaults, ...patch },
    } : previous)
  }

  async function saveAppLocalePreference(preference: AppLocalePreference) {
    await saveAppSettings({ appLocale: preference })
    setLocalePreference(preference)
    setAppLangSheetOpen(false)
  }

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

  useEffect(() => {
    let cancelled = false

    void getSettings().then((value) => {
      if (cancelled) return
      setSettings(value)
      setTtsKeyInputs({
        speechify: value.appSettings.speechifyApiKey,
        elevenlabs: value.appSettings.elevenLabsApiKey,
        fishaudio: value.appSettings.fishAudioApiKey,
      })
      setYoutubeKeyInput(value.appSettings.youtubeApiKey)

      for (const provider of PREMIUM_TTS_PROVIDER_ORDER) {
        const key = value.appSettings[PREMIUM_TTS_PROVIDER_DEFINITIONS[provider].apiKeyField]
        if (key) void validateTtsProviderKey(provider, key, false)
      }
      if (value.appSettings.youtubeApiKey) {
        setYoutubeValidation({ status: 'valid' })
      }
    })

    return () => {
      cancelled = true
    }
  }, [validateTtsProviderKey])

  if (!settings) {
    return (
      <div className="fixed inset-0 flex items-center justify-center bg-bg-base">
        <Spinner tone="purple" />
      </div>
    )
  }

  const currentLang = getLanguageLabel(settings.appSettings.translationTargetLang) ?? settings.appSettings.translationTargetLang
  const currentAppLocalePreference = settings.appSettings.appLocale ?? localePreference
  const currentAppLocale = getAppLocalePreferenceLabel(currentAppLocalePreference, t)
  const readerStyleMode = !settings.readerDefaults.overrideBookFont && !settings.readerDefaults.overrideBookColors
    ? 'original'
    : 'comfortable'
  const bookmarkSyncMeta = getBookmarkSyncMeta(bookmarkSyncStatus.code, t)
  const bookIntelligenceQuota = FeatureQuotaService.getSnapshot('book-intelligence', { isPro: entitlements.isPro })
  const nytDiscoveryQuota = FeatureQuotaService.getSnapshot('nyt-discovery', { isPro: entitlements.isPro })

  function getTtsValidationHint(provider: PremiumTtsProvider) {
    const state = ttsValidation[provider]
    if (state.status === 'valid') return t('settings.tts.validatedAndSaved')
    if (state.status === 'validating') return state.message
    return undefined
  }

  // YouTube key não tem endpoint de validação público — salva direto no blur
  async function saveYoutubeKey(rawKey: string) {
    const trimmedKey = rawKey.trim()
    setYoutubeKeyInput(trimmedKey)
    await saveAppSettings({ youtubeApiKey: trimmedKey })
    setYoutubeValidation(trimmedKey ? { status: 'valid' } : IDLE_KEY_STATE)
  }

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

  function toggleIntegration(id: IntegrationId) {
    setExpandedIntegration((current) => current === id ? null : id)
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
          <h1 className="text-lg font-extrabold tracking-[-0.02em] text-text-primary">{t('settings.header.title')}</h1>
          <p className="text-xs text-text-muted">{t('settings.header.subtitle')}</p>
        </div>
      </header>

      <div className="flex flex-col gap-7 px-4 pt-5">
        <SettingsSection
          icon={<Sparkles size={17} />}
          label={t('settings.plan.sectionLabel')}
          description={t('settings.plan.sectionDescription')}
        >
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
              divider={false}
            />
          </SettingsGroup>
        </SettingsSection>

        <SettingsSection
          icon={<Gauge size={17} />}
          label={t('settings.quota.sectionLabel')}
          description={t('settings.quota.sectionDescription')}
        >
          <SettingsGroup>
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
        </SettingsSection>

        <SettingsSection
          icon={<Globe size={17} />}
          label={t('settings.appLanguage.sectionLabel')}
          description={t('settings.appLanguage.sectionDescription')}
        >
          <SettingsGroup>
            <ListItem
              leading={<Globe size={20} />}
              title={t('settings.appLanguage.title')}
              meta={currentAppLocale}
              trailing={<ChevronRight size={18} />}
              onClick={() => setAppLangSheetOpen(true)}
              divider={false}
            />
          </SettingsGroup>
        </SettingsSection>

        <SettingsSection
          icon={<CloudUpload size={17} />}
          label={t('settings.bookmarkSync.sectionLabel')}
          description={t('settings.bookmarkSync.sectionDescription')}
        >
          <SettingsGroup>
            <ListItem
              leading={<CloudUpload size={20} />}
              title={t('settings.bookmarkSync.title')}
              meta={bookmarkSyncMeta.description}
              trailing={(
                <Badge tone={bookmarkSyncMeta.tone}>{bookmarkSyncMeta.label}</Badge>
              )}
              divider={false}
            />
          </SettingsGroup>
        </SettingsSection>

        <SettingsSection
          icon={<Palette size={17} />}
          label={t('settings.appearance.sectionLabel')}
          description={t('settings.appearance.sectionDescription')}
        >
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
        </SettingsSection>

        <SettingsSection
          icon={<Globe size={17} />}
          label={t('settings.translation.sectionLabel')}
          description={t('settings.translation.sectionDescription')}
        >
          <SettingsGroup>
            <ListItem
              leading={<Globe size={20} />}
              title={t('settings.translation.defaultLanguage')}
              meta={currentLang}
              trailing={<ChevronRight size={18} />}
              onClick={() => setLangSheetOpen(true)}
              divider={false}
            />
          </SettingsGroup>
        </SettingsSection>

        <SettingsSection
          icon={<Volume2 size={17} />}
          label={t('settings.narration.sectionLabel')}
          description={t('settings.narration.sectionDescription')}
        >
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
              divider={false}
            />
          </SettingsGroup>
        </SettingsSection>

        <SettingsSection
          icon={<KeyRound size={17} />}
          label={t('settings.integrations.sectionLabel')}
          description={t('settings.integrations.description')}
        >
          <SettingsGroup>
            {PREMIUM_TTS_PROVIDER_ORDER.map((provider) => {
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
                  expanded={expandedIntegration === provider}
                  onToggleExpanded={() => toggleIntegration(provider)}
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

            {(() => {
              const educationStatus = getEducationStatus(youtubeValidation, t)
              return (
                <ApiKeyField
                  label="YouTube Data API"
                  description={t('settings.integrations.youtube.description')}
                  icon={<PlayCircle size={18} />}
                  state={youtubeValidation}
                  emptyLabel={t('settings.integrations.youtube.emptyLabel')}
                  expanded={expandedIntegration === 'youtube'}
                  onToggleExpanded={() => toggleIntegration('youtube')}
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
              )
            })()}
          </SettingsGroup>
        </SettingsSection>

        <SettingsSection
          icon={<Info size={17} />}
          label={t('settings.build.sectionLabel')}
          description={t('settings.build.description')}
        >
          <SettingsGroup>
            <InfoRow
              icon={<Info size={18} />}
              title={t('settings.build.publicKeys.title')}
              description={t('settings.build.publicKeys.description')}
              divider={false}
            />
          </SettingsGroup>
        </SettingsSection>
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

function getAppLocalePreferenceLabel(preference: AppLocalePreference, t: TranslateFn): string {
  if (preference === 'pt-BR') return t('settings.appLanguage.ptBR')
  if (preference === 'en') return t('settings.appLanguage.en')
  if (preference === 'es') return t('settings.appLanguage.es')
  return t('settings.appLanguage.auto')
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

function getBookmarkSyncMeta(
  code: ReturnType<typeof useBookmarkDriveSyncStatus>['code'],
  t: TranslateFn,
): {
  label: string
  description: string
  tone: 'success' | 'warning' | 'error' | 'purple' | 'neutral'
} {
  if (code === 'connected') {
    return {
      label: t('settings.bookmarkSync.status.connected'),
      description: t('settings.bookmarkSync.description.connected'),
      tone: 'success',
    }
  }
  if (code === 'permission-error') {
    return {
      label: t('settings.bookmarkSync.status.permissionError'),
      description: t('settings.bookmarkSync.description.permissionError'),
      tone: 'error',
    }
  }
  if (code === 'pro-required') {
    return {
      label: t('settings.bookmarkSync.status.proRequired'),
      description: t('settings.bookmarkSync.description.proRequired'),
      tone: 'purple',
    }
  }
  return {
    label: t('settings.bookmarkSync.status.pendingOffline'),
    description: t('settings.bookmarkSync.description.pendingOffline'),
    tone: 'warning',
  }
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

function SettingsSection({
  icon,
  label,
  description,
  children,
}: {
  icon: ReactNode
  label: string
  description?: string
  children: ReactNode
}) {
  return (
    <section>
      <div className="mb-3 flex items-start gap-2 px-1">
        <div className="mt-0.5 text-purple-light">{icon}</div>
        <div className="min-w-0">
          <h2 className="text-[11px] font-bold uppercase tracking-[0.1em] text-purple-light">
            {label}
          </h2>
          {description && (
            <p className="mt-0.5 text-xs leading-snug text-text-muted">{description}</p>
          )}
        </div>
      </div>
      {children}
    </section>
  )
}

function SettingsGroup({ children }: { children: ReactNode }) {
  return (
    <div className="overflow-hidden rounded-md border border-border bg-bg-surface">
      {children}
    </div>
  )
}

function SettingBlock({
  label,
  description,
  children,
  divider = true,
}: {
  label: string
  description?: string
  children: ReactNode
  divider?: boolean
}) {
  return (
    <div className={divider ? 'border-b border-white/5 p-4' : 'p-4'}>
      <div className="mb-3">
        <h3 className="text-sm font-semibold text-text-secondary">{label}</h3>
        {description && (
          <p className="mt-1 text-xs leading-snug text-text-muted">{description}</p>
        )}
      </div>
      {children}
    </div>
  )
}

function InfoRow({
  icon,
  title,
  description,
  badge,
  divider = true,
}: {
  icon: ReactNode
  title: string
  description: string
  badge?: ReactNode
  divider?: boolean
}) {
  return (
    <div className={[
      'flex items-start gap-3 px-4 py-4',
      divider ? 'border-b border-white/5' : '',
    ].join(' ')}>
      <div className="mt-0.5 text-text-secondary">{icon}</div>
      <div className="min-w-0 flex-1">
        <div className="flex items-start justify-between gap-3">
          <h3 className="text-sm font-semibold text-text-primary">{title}</h3>
          {badge}
        </div>
        <p className="mt-1 text-xs leading-relaxed text-text-muted">{description}</p>
      </div>
    </div>
  )
}

function ApiKeyField({
  label,
  description,
  icon,
  state,
  emptyLabel,
  expanded,
  onToggleExpanded,
  input,
  divider = true,
}: {
  label: string
  description: string
  icon: ReactNode
  state: KeyValidationState
  emptyLabel: string
  expanded: boolean
  onToggleExpanded: () => void
  input: ReactNode
  divider?: boolean
}) {
  return (
    <div className={divider ? 'border-b border-white/5' : ''}>
      <button
        type="button"
        onClick={onToggleExpanded}
        aria-expanded={expanded}
        className="flex w-full items-start justify-between gap-3 p-4 text-left transition-colors active:bg-white/[0.03]"
      >
        <span className="flex min-w-0 items-start gap-3">
          <span className="mt-0.5 text-text-secondary">{icon}</span>
          <span className="min-w-0">
            <span className="block text-sm font-semibold text-text-primary">{label}</span>
            <span className="mt-1 block text-xs leading-snug text-text-muted">{description}</span>
          </span>
        </span>
        <span className="flex shrink-0 items-center gap-2">
          <IntegrationStatus state={state} />
          <span className="text-text-muted">
            {expanded ? <ChevronDown size={17} /> : <ChevronRight size={17} />}
          </span>
        </span>
      </button>
      {expanded && (
        <div className="px-4 pb-4">
          {input}
          <div className="mt-3">
            <ValidationBadge state={state} emptyLabel={emptyLabel} />
          </div>
        </div>
      )}
    </div>
  )
}

function IntegrationStatus({ state }: { state: KeyValidationState }) {
  const { t } = useI18n()

  if (state.status === 'validating') return <Badge tone="neutral">{t('settings.status.validating')}</Badge>
  if (state.status === 'valid') return <Badge tone="success">{t('settings.status.connected')}</Badge>
  if (state.status === 'invalid') return <Badge tone="error">{t('settings.status.invalid')}</Badge>
  return <Badge tone="neutral">{t('settings.status.notConfigured')}</Badge>
}

function KeyVisibilityButton({ shown, onClick }: { shown: boolean; onClick: () => void }) {
  const { t } = useI18n()

  return (
    <button
      type="button"
      onClick={onClick}
      className="p-2 text-text-muted active:opacity-60"
      aria-label={shown ? t('settings.apiKey.hide') : t('settings.apiKey.show')}
    >
      {shown ? <EyeOff size={16} /> : <Eye size={16} />}
    </button>
  )
}
