import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import { ArrowLeft, Eye, EyeOff, Check, Globe, ChevronRight } from 'lucide-react'
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
  const [speechifyKeyInput, setSpeechifyKeyInput] = useState('')
  const [elevenLabsKeyInput, setElevenLabsKeyInput] = useState('')
  const [speechifyValidation, setSpeechifyValidation] = useState<KeyValidationState>(IDLE_KEY_STATE)
  const [elevenLabsValidation, setElevenLabsValidation] = useState<KeyValidationState>(IDLE_KEY_STATE)
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

      if (value.appSettings.speechifyApiKey) {
        void validateSpeechifyKey(value.appSettings.speechifyApiKey, false)
      }
      if (value.appSettings.elevenLabsApiKey) {
        void validateElevenLabsKey(value.appSettings.elevenLabsApiKey, false)
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
      <header className="px-4 pt-10 pb-4 flex items-center gap-3">
        <button
          onClick={onBack}
          className="p-2 -ml-1 rounded-md text-text-secondary active:scale-90 transition-transform"
          aria-label="Voltar"
        >
          <ArrowLeft size={20} />
        </button>
        <div>
          <p className="text-xs text-text-muted uppercase tracking-wider">Preferencias</p>
          <h1 className="text-2xl font-serif font-bold text-purple-light">Configuracoes</h1>
        </div>
      </header>

      <div className="px-4 flex flex-col gap-6">
        <Section title="TTS Premium (Speechify)">
          <p className="text-xs text-text-muted leading-relaxed mb-3">
            Insira sua API key da Speechify para habilitar vozes neurais e karaoke de palavras.
            A key so e salva depois de validada.
          </p>

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
            rightSlot={(
              <button
                type="button"
                onClick={() => setShowSpeechifyKey((value) => !value)}
                className="p-2 text-text-muted active:opacity-60"
                aria-label={showSpeechifyKey ? 'Ocultar key' : 'Mostrar key'}
              >
                {showSpeechifyKey ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            )}
          />

          <div className="mt-3">
            <ValidationBadge
              state={speechifyValidation}
              emptyLabel="Nao configurado - usando TTS nativo"
            />
          </div>
        </Section>

        <Section title="TTS Premium (ElevenLabs)">
          <p className="text-xs text-text-muted leading-relaxed mb-3">
            Insira sua API key da ElevenLabs para habilitar vozes premium com alinhamento temporal.
            A key so e salva depois de validada.
          </p>

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
            rightSlot={(
              <button
                type="button"
                onClick={() => setShowElevenLabsKey((value) => !value)}
                className="p-2 text-text-muted active:opacity-60"
                aria-label={showElevenLabsKey ? 'Ocultar key' : 'Mostrar key'}
              >
                {showElevenLabsKey ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            )}
          />

          <div className="mt-3">
            <ValidationBadge
              state={elevenLabsValidation}
              emptyLabel="Nao configurado"
            />
          </div>
        </Section>

        <Section title="Traducao">
          <div className="-mx-4">
            <ListItem
              leading={<Globe size={20} />}
              title="Idioma padrao das traducoes"
              meta={currentLang}
              trailing={<ChevronRight size={18} />}
              onClick={() => setLangSheetOpen(true)}
              divider={false}
            />
          </div>
          <p className="mt-3 text-xs text-text-muted leading-relaxed">
            Esse e o padrao global do app. Cada livro pode sobrescrever esse idioma nas proprias configuracoes.
          </p>
        </Section>

        <Section title="Tamanho de fonte padrao">
          <p className="text-xs text-text-muted mb-3">
            Tamanho inicial ao abrir qualquer livro.
          </p>
          <ReaderFontSizeControl
            value={settings.readerDefaults.defaultFontSize}
            onChange={(value) => void saveReaderDefaults({ defaultFontSize: value })}
            surface="base"
          />
          <div className="mt-4">
            <ReaderPreviewPanel
              theme={settings.readerDefaults.readerTheme}
              fontFamily={settings.readerDefaults.fontFamily}
              fontSize={settings.readerDefaults.defaultFontSize}
              lineHeight={settings.readerDefaults.lineHeight}
            >
              The quick brown fox jumps over the lazy dog.
            </ReaderPreviewPanel>
          </div>
        </Section>

        <Section title="Modo de leitura padrao">
          <p className="text-xs text-text-muted mb-3">
            Define se livros novos preservam o estilo do EPUB ou usam a leitura confortavel do NeoReader.
          </p>
          <ReaderModeControl
            value={readerStyleMode}
            onChange={handleReaderStyleModeChange}
            surface="base"
          />
        </Section>

        <Section title="Fonte padrao">
          <p className="text-xs text-text-muted mb-3">
            Define como livros novos escolhem a fonte de leitura.
          </p>
          <ReaderFontControl
            value={settings.readerDefaults.fontFamily}
            onChange={(value) => void saveReaderDefaults({
              fontFamily: value,
              overrideBookFont: value !== 'publisher',
            })}
            surface="base"
          />
        </Section>

        <Section title="Espacamento padrao">
          <p className="text-xs text-text-muted mb-3">
            Define a altura de linha usada como base no leitor.
          </p>
          <ReaderLineHeightControl
            value={settings.readerDefaults.lineHeight}
            onChange={(value) => void saveReaderDefaults({ lineHeight: value })}
            surface="base"
          />
        </Section>

        <Section title="Tema padrao do leitor">
          <p className="text-xs text-text-muted mb-3">
            Aparencia inicial ao abrir qualquer livro.
          </p>
          <ReaderThemeControl
            value={settings.readerDefaults.readerTheme}
            onChange={(value) => void saveReaderDefaults({ readerTheme: value, overrideBookColors: true })}
            surface="base"
          />

          <div className="mt-4">
            <ReaderPreviewPanel
              theme={settings.readerDefaults.readerTheme}
              fontFamily={settings.readerDefaults.fontFamily}
              fontSize={settings.readerDefaults.defaultFontSize}
              lineHeight={settings.readerDefaults.lineHeight}
            >
              The quick brown fox jumps over the lazy dog.
            </ReaderPreviewPanel>
          </div>
        </Section>
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

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="rounded-md p-4 bg-bg-surface border border-border">
      <h2 className="text-[11px] font-bold uppercase tracking-wider text-text-muted mb-4">
        {title}
      </h2>
      {children}
    </section>
  )
}
