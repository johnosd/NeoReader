import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import { ArrowLeft, Check, ChevronDown, ChevronRight, Eye, EyeOff, Globe, Info, KeyRound, Mic2, Palette, PlayCircle, Sparkles, Volume2 } from 'lucide-react'
import { Badge, BottomSheet, Input, ListItem, Spinner } from '../components/ui'
import { useEntitlements, useRefreshEntitlementsOnFocus } from '../hooks/useEntitlements'
import { BillingService } from '../services/BillingService'
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
} from '../services/TtsProviderRegistry'
import { useCapacitorBackButton } from '../hooks/useCapacitorAppListener'
import type { AppSettings, ReaderDefaults, UserSettings } from '../types/settings'
import type { PremiumTtsProvider } from '../types/tts'
import { getLanguageLabel, TRANSLATION_LANGUAGE_OPTIONS } from '../utils/languageOptions'

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
  if (state.status === 'validating') {
    return <Badge tone="neutral">Validando key...</Badge>
  }
  if (state.status === 'valid') {
    return (
      <Badge tone="success">
        <Check size={11} /> Key valida
      </Badge>
    )
  }
  if (state.status === 'invalid') {
    return <Badge tone="error">Key invalida</Badge>
  }
  return <p className="text-xs text-text-muted">{emptyLabel}</p>
}

export function SettingsScreen({ onBack, onOpenPaywall }: SettingsScreenProps) {
  const entitlements = useEntitlements()
  useRefreshEntitlementsOnFocus()
  const [settings, setSettings] = useState<UserSettings | null>(null)
  const [showTtsKeys, setShowTtsKeys] = useState<Record<PremiumTtsProvider, boolean>>(EMPTY_TTS_KEY_VISIBILITY)
  const [showYoutubeKey, setShowYoutubeKey] = useState(false)
  const [expandedIntegration, setExpandedIntegration] = useState<IntegrationId | null>(null)
  const [ttsKeyInputs, setTtsKeyInputs] = useState<Record<PremiumTtsProvider, string>>(EMPTY_TTS_KEY_INPUTS)
  const [youtubeKeyInput, setYoutubeKeyInput] = useState('')
  const [ttsValidation, setTtsValidation] = useState<Record<PremiumTtsProvider, KeyValidationState>>(EMPTY_TTS_VALIDATION_STATE)
  const [youtubeValidation, setYoutubeValidation] = useState<KeyValidationState>(IDLE_KEY_STATE)
  const [langSheetOpen, setLangSheetOpen] = useState(false)
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
      [provider]: { status: 'validating', message: `Validando a API key da ${definition.label}...` },
    }))
    const result = await definition.validateApiKey(trimmedKey)
    if (ttsValidationSeqRef.current[provider] !== validationSeq) return

    if (result.isValid) {
      if (persistOnSuccess) {
        await saveAppSettings({ [definition.apiKeyField]: trimmedKey } as Partial<AppSettings>)
        if (provider === 'elevenlabs') await logSavedElevenLabsVoiceSelections()
      }
      setTtsKeyInputs((current) => ({ ...current, [provider]: trimmedKey }))
      setTtsValidation((current) => ({ ...current, [provider]: { status: 'valid', message: result.message } }))
      return
    }

    setTtsValidation((current) => ({ ...current, [provider]: { status: 'invalid', message: result.message } }))
  }, [saveAppSettings])

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
  const readerStyleMode = !settings.readerDefaults.overrideBookFont && !settings.readerDefaults.overrideBookColors
    ? 'original'
    : 'comfortable'

  function getTtsValidationHint(provider: PremiumTtsProvider) {
    const state = ttsValidation[provider]
    if (state.status === 'valid') return 'A key foi validada e salva.'
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
          aria-label="Voltar"
        >
          <ArrowLeft size={20} />
        </button>
        <div className="min-w-0">
          <h1 className="text-lg font-extrabold tracking-[-0.02em] text-text-primary">Leitor</h1>
          <p className="text-xs text-text-muted">Configuracoes de leitura e integracoes</p>
        </div>
      </header>

      <div className="flex flex-col gap-7 px-4 pt-5">
        <SettingsSection
          icon={<Sparkles size={17} />}
          label="Plano"
          description="Conheca o NeoReader Pro - em breve."
        >
          <SettingsGroup>
            <ListItem
              leading={<Sparkles size={20} className="text-purple-light" />}
              title="NeoReader Pro"
              meta={getPlanMeta(entitlements, BillingService.isAvailable())}
              trailing={(
                <div className="flex items-center gap-2">
                  {entitlements.isPro && <Badge tone="success">Ativo</Badge>}
                  <ChevronRight size={18} />
                </div>
              )}
              onClick={onOpenPaywall}
              divider={false}
            />
          </SettingsGroup>
        </SettingsSection>

        <SettingsSection
          icon={<Palette size={17} />}
          label="Aparencia"
          description="Padrao usado quando um livro novo e aberto."
        >
          <SettingsGroup>
            <SettingBlock label="Previa" description="As alteracoes abaixo refletem neste exemplo.">
              <ReaderPreviewPanel
                theme={settings.readerDefaults.readerTheme}
                fontFamily={settings.readerDefaults.fontFamily}
                fontSize={settings.readerDefaults.defaultFontSize}
                lineHeight={settings.readerDefaults.lineHeight}
              >
                A leitura deve ficar confortavel por longos periodos, com ritmo visual claro e sem distracao.
              </ReaderPreviewPanel>
            </SettingBlock>

            <SettingBlock label="Tema do leitor" description="Aparencia inicial ao abrir qualquer livro.">
              <ReaderThemeControl
                value={settings.readerDefaults.readerTheme}
                onChange={(value) => void saveReaderDefaults({ readerTheme: value, overrideBookColors: true })}
                surface="base"
              />
            </SettingBlock>

            <SettingBlock label="Fonte padrao" description="Define como livros novos escolhem a fonte.">
              <ReaderFontControl
                value={settings.readerDefaults.fontFamily}
                onChange={(value) => void saveReaderDefaults({
                  fontFamily: value,
                  overrideBookFont: value !== 'publisher',
                })}
                surface="base"
              />
            </SettingBlock>

            <SettingBlock label="Tamanho da fonte" description="Tamanho inicial para novos livros.">
              <ReaderFontSizeControl
                value={settings.readerDefaults.defaultFontSize}
                onChange={(value) => void saveReaderDefaults({ defaultFontSize: value })}
                surface="base"
              />
            </SettingBlock>

            <SettingBlock label="Espacamento de linha" description="Altura de linha usada como base no leitor.">
              <ReaderLineHeightControl
                value={settings.readerDefaults.lineHeight}
                onChange={(value) => void saveReaderDefaults({ lineHeight: value })}
                surface="base"
              />
            </SettingBlock>

            <SettingBlock label="Modo de leitura" description="Escolha entre preservar o EPUB ou usar o estilo NeoReader." divider={false}>
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
          label="Traducao"
          description="Idioma padrao ao selecionar e traduzir trechos."
        >
          <SettingsGroup>
            <ListItem
              leading={<Globe size={20} />}
              title="Idioma padrao das traducoes"
              meta={currentLang}
              trailing={<ChevronRight size={18} />}
              onClick={() => setLangSheetOpen(true)}
              divider={false}
            />
          </SettingsGroup>
        </SettingsSection>

        <SettingsSection
          icon={<Volume2 size={17} />}
          label="Narracao"
          description="Vozes e servicos usados para leitura em audio."
        >
          <SettingsGroup>
            <InfoRow
              icon={<Mic2 size={18} />}
              title="TTS nativo"
              description="Sempre disponivel como fallback no dispositivo."
              badge={<Badge tone="success">Ativo</Badge>}
            />
          </SettingsGroup>
        </SettingsSection>

        <SettingsSection
          icon={<KeyRound size={17} />}
          label="Integracoes"
          description="Chaves usadas por recursos externos do app."
        >
          <SettingsGroup>
            {PREMIUM_TTS_PROVIDER_ORDER.map((provider) => {
              const definition = PREMIUM_TTS_PROVIDER_DEFINITIONS[provider]
              const validation = ttsValidation[provider]
              return (
                <ApiKeyField
                  key={provider}
                  label={definition.label}
                  description={definition.description}
                  icon={getProviderIcon(provider)}
                  state={validation}
                  emptyLabel={provider === 'speechify' ? 'Nao configurado - usando TTS nativo' : 'Nao configurado'}
                  expanded={expandedIntegration === provider}
                  onToggleExpanded={() => toggleIntegration(provider)}
                  input={(
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
                  )}
                />
              )
            })}

            <ApiKeyField
              label="YouTube Data API"
              description="Videos e entrevistas na aba Autor dos livros."
              icon={<PlayCircle size={18} />}
              state={youtubeValidation}
              emptyLabel="Nao configurado - videos do autor nao serao exibidos"
              expanded={expandedIntegration === 'youtube'}
              onToggleExpanded={() => toggleIntegration('youtube')}
              divider={false}
              input={(
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
              )}
            />
          </SettingsGroup>
        </SettingsSection>

        <SettingsSection
          icon={<Info size={17} />}
          label="Build"
          description="Configuracoes embutidas no aplicativo."
        >
          <SettingsGroup>
            <InfoRow
              icon={<Info size={18} />}
              title="Chaves publicas do build"
              description="Google Books e NYT Best Sellers usam variaveis VITE_ embutidas no app. Restrinja essas chaves por API, pacote/app e cota antes da Play Store."
              divider={false}
            />
          </SettingsGroup>
        </SettingsSection>
      </div>

      <BottomSheet
        open={langSheetOpen}
        onClose={() => setLangSheetOpen(false)}
        title="Idioma padrao das traducoes"
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

function getPlanMeta(
  entitlements: ReturnType<typeof useEntitlements>,
  _billingAvailable: boolean,
): string {
  // Hoje o Pro nao esta a venda - tela serve como preview do que vem por ai.
  // Quando o Pro for ativado, este texto volta a refletir o status real do entitlement.
  if (entitlements.isPro) {
    if (entitlements.expiresAt) {
      return `Renova em ${entitlements.expiresAt.toLocaleDateString('pt-BR')}`
    }
    return 'Acesso vitalicio'
  }
  return 'Em desenvolvimento - veja o que vem por ai'
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
  if (state.status === 'validating') return <Badge tone="neutral">Validando</Badge>
  if (state.status === 'valid') return <Badge tone="success">Conectado</Badge>
  if (state.status === 'invalid') return <Badge tone="error">Invalida</Badge>
  return <Badge tone="neutral">Nao configurado</Badge>
}

function KeyVisibilityButton({ shown, onClick }: { shown: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="p-2 text-text-muted active:opacity-60"
      aria-label={shown ? 'Ocultar key' : 'Mostrar key'}
    >
      {shown ? <EyeOff size={16} /> : <Eye size={16} />}
    </button>
  )
}
