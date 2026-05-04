import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import { ArrowLeft, Check, ChevronDown, ChevronRight, Eye, EyeOff, Globe, Info, KeyRound, Mic2, Palette, PlayCircle, Volume2 } from 'lucide-react'
import { App as CapApp } from '@capacitor/app'
import { Badge, BottomSheet, Input, ListItem, Spinner } from '../components/ui'
import {
  ReaderFontControl,
  ReaderFontSizeControl,
  ReaderLineHeightControl,
  ReaderModeControl,
  ReaderPreviewPanel,
  ReaderThemeControl,
  type ReaderStyleMode,
} from '../components/reader/ReaderAppearanceControls'
import { getSettings, updateAppSettings, updateReaderDefaults } from '../db/settings'
import { ElevenLabsService } from '../services/ElevenLabsService'
import { SpeechifyService } from '../services/SpeechifyService'
import type { AppSettings, ReaderDefaults, UserSettings } from '../types/settings'
import { getLanguageLabel, TRANSLATION_LANGUAGE_OPTIONS } from '../utils/languageOptions'

interface SettingsScreenProps {
  onBack: () => void
}

type KeyValidationStatus = 'idle' | 'validating' | 'valid' | 'invalid'
type IntegrationId = 'speechify' | 'elevenlabs' | 'youtube'

interface KeyValidationState {
  status: KeyValidationStatus
  message?: string
}

const IDLE_KEY_STATE: KeyValidationState = { status: 'idle' }

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

export function SettingsScreen({ onBack }: SettingsScreenProps) {
  const [settings, setSettings] = useState<UserSettings | null>(null)
  const [showSpeechifyKey, setShowSpeechifyKey] = useState(false)
  const [showElevenLabsKey, setShowElevenLabsKey] = useState(false)
  const [showYoutubeKey, setShowYoutubeKey] = useState(false)
  const [expandedIntegration, setExpandedIntegration] = useState<IntegrationId | null>(null)
  const [speechifyKeyInput, setSpeechifyKeyInput] = useState('')
  const [elevenLabsKeyInput, setElevenLabsKeyInput] = useState('')
  const [youtubeKeyInput, setYoutubeKeyInput] = useState('')
  const [speechifyValidation, setSpeechifyValidation] = useState<KeyValidationState>(IDLE_KEY_STATE)
  const [elevenLabsValidation, setElevenLabsValidation] = useState<KeyValidationState>(IDLE_KEY_STATE)
  const [youtubeValidation, setYoutubeValidation] = useState<KeyValidationState>(IDLE_KEY_STATE)
  const [langSheetOpen, setLangSheetOpen] = useState(false)
  const speechifyValidationSeqRef = useRef(0)
  const elevenLabsValidationSeqRef = useRef(0)

  useEffect(() => {
    const listener = CapApp.addListener('backButton', onBack)
    return () => { void listener.then((value) => value.remove()) }
  }, [onBack])

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

  const validateSpeechifyKey = useCallback(async (rawKey: string, persistOnSuccess: boolean) => {
    const trimmedKey = rawKey.trim()
    const validationSeq = ++speechifyValidationSeqRef.current

    if (!trimmedKey) {
      setSpeechifyValidation(IDLE_KEY_STATE)
      if (persistOnSuccess) await saveAppSettings({ speechifyApiKey: '' })
      return
    }

    setSpeechifyValidation({ status: 'validating', message: 'Validando a API key da Speechify...' })
    const result = await SpeechifyService.validateApiKey(trimmedKey)
    if (speechifyValidationSeqRef.current !== validationSeq) return

    if (result.isValid) {
      if (persistOnSuccess) {
        await saveAppSettings({ speechifyApiKey: trimmedKey })
      }
      setSpeechifyKeyInput(trimmedKey)
      setSpeechifyValidation({ status: 'valid', message: result.message })
      return
    }

    setSpeechifyValidation({ status: 'invalid', message: result.message })
  }, [saveAppSettings])

  const validateElevenLabsKey = useCallback(async (rawKey: string, persistOnSuccess: boolean) => {
    const trimmedKey = rawKey.trim()
    const validationSeq = ++elevenLabsValidationSeqRef.current

    if (!trimmedKey) {
      setElevenLabsValidation(IDLE_KEY_STATE)
      if (persistOnSuccess) await saveAppSettings({ elevenLabsApiKey: '' })
      return
    }

    setElevenLabsValidation({ status: 'validating', message: 'Validando a API key da ElevenLabs...' })
    const result = await ElevenLabsService.validateApiKey(trimmedKey)
    if (elevenLabsValidationSeqRef.current !== validationSeq) return

    if (result.isValid) {
      if (persistOnSuccess) {
        await saveAppSettings({ elevenLabsApiKey: trimmedKey })
      }
      setElevenLabsKeyInput(trimmedKey)
      setElevenLabsValidation({ status: 'valid', message: result.message })
      return
    }

    setElevenLabsValidation({ status: 'invalid', message: result.message })
  }, [saveAppSettings])

  useEffect(() => {
    let cancelled = false

    void getSettings().then((value) => {
      if (cancelled) return
      setSettings(value)
      setSpeechifyKeyInput(value.appSettings.speechifyApiKey)
      setElevenLabsKeyInput(value.appSettings.elevenLabsApiKey)
      setYoutubeKeyInput(value.appSettings.youtubeApiKey)

      if (value.appSettings.speechifyApiKey) {
        void validateSpeechifyKey(value.appSettings.speechifyApiKey, false)
      }
      if (value.appSettings.elevenLabsApiKey) {
        void validateElevenLabsKey(value.appSettings.elevenLabsApiKey, false)
      }
      if (value.appSettings.youtubeApiKey) {
        setYoutubeValidation({ status: 'valid' })
      }
    })

    return () => {
      cancelled = true
    }
  }, [validateElevenLabsKey, validateSpeechifyKey])

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
  const speechifyHint = speechifyValidation.status === 'valid'
    ? 'A key foi validada e salva.'
    : speechifyValidation.status === 'validating'
      ? speechifyValidation.message
      : undefined
  const elevenLabsHint = elevenLabsValidation.status === 'valid'
    ? 'A key foi validada e salva.'
    : elevenLabsValidation.status === 'validating'
      ? elevenLabsValidation.message
      : undefined

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
            <ApiKeyField
              label="Speechify"
              description="Vozes neurais e karaoke de palavras."
              icon={<Mic2 size={18} />}
              state={speechifyValidation}
              emptyLabel="Nao configurado - usando TTS nativo"
              expanded={expandedIntegration === 'speechify'}
              onToggleExpanded={() => toggleIntegration('speechify')}
              input={(
                <Input
                  type={showSpeechifyKey ? 'text' : 'password'}
                  value={speechifyKeyInput}
                  onChange={(event) => {
                    setSpeechifyKeyInput(event.target.value)
                    if (speechifyValidation.status !== 'validating') setSpeechifyValidation(IDLE_KEY_STATE)
                  }}
                  onBlur={() => void validateSpeechifyKey(speechifyKeyInput, true)}
                  placeholder="sk-..."
                  autoComplete="off"
                  spellCheck={false}
                  error={speechifyValidation.status === 'invalid' ? speechifyValidation.message : undefined}
                  hint={speechifyHint}
                  className="h-12 font-mono text-sm"
                  rightSlot={(
                    <KeyVisibilityButton
                      shown={showSpeechifyKey}
                      onClick={() => setShowSpeechifyKey((value) => !value)}
                    />
                  )}
                />
              )}
            />

            <ApiKeyField
              label="ElevenLabs"
              description="Vozes premium com alinhamento temporal."
              icon={<Volume2 size={18} />}
              state={elevenLabsValidation}
              emptyLabel="Nao configurado"
              expanded={expandedIntegration === 'elevenlabs'}
              onToggleExpanded={() => toggleIntegration('elevenlabs')}
              input={(
                <Input
                  type={showElevenLabsKey ? 'text' : 'password'}
                  value={elevenLabsKeyInput}
                  onChange={(event) => {
                    setElevenLabsKeyInput(event.target.value)
                    if (elevenLabsValidation.status !== 'validating') setElevenLabsValidation(IDLE_KEY_STATE)
                  }}
                  onBlur={() => void validateElevenLabsKey(elevenLabsKeyInput, true)}
                  placeholder="sk_..."
                  autoComplete="off"
                  spellCheck={false}
                  error={elevenLabsValidation.status === 'invalid' ? elevenLabsValidation.message : undefined}
                  hint={elevenLabsHint}
                  className="h-12 font-mono text-sm"
                  rightSlot={(
                    <KeyVisibilityButton
                      shown={showElevenLabsKey}
                      onClick={() => setShowElevenLabsKey((value) => !value)}
                    />
                  )}
                />
              )}
            />

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
