import { useEffect, useRef, useState, type ReactNode } from 'react'
import { ArrowLeft, Eye, EyeOff, Check, Globe, ChevronRight } from 'lucide-react'
import { App as CapApp } from '@capacitor/app'
import { Badge, BottomSheet, Input, ListItem, Spinner } from '../components/ui'
import { getSettings, updateAppSettings, updateReaderDefaults } from '../db/settings'
import { ElevenLabsService } from '../services/ElevenLabsService'
import { SpeechifyService } from '../services/SpeechifyService'
import type { AppSettings, FontSize, ReaderDefaults, UserSettings } from '../types/settings'
import { getLanguageLabel, TRANSLATION_LANGUAGE_OPTIONS } from '../utils/languageOptions'
import {
  READER_LINE_HEIGHT_OPTIONS,
  READER_THEME_OPTIONS,
  getReaderLineHeightValue,
  getReaderThemePreviewStyle,
} from '../utils/readerPreferences'

interface SettingsScreenProps {
  onBack: () => void
}

type KeyValidationStatus = 'idle' | 'validating' | 'valid' | 'invalid'

interface KeyValidationState {
  status: KeyValidationStatus
  message?: string
}

const FONT_SIZES: { value: FontSize; label: string; className: string }[] = [
  { value: 'sm', label: 'A', className: 'text-sm' },
  { value: 'md', label: 'A', className: 'text-base' },
  { value: 'lg', label: 'A', className: 'text-lg' },
  { value: 'xl', label: 'A', className: 'text-xl' },
]

const FONT_PREVIEW_PX: Record<FontSize, number> = { sm: 14, md: 16, lg: 18, xl: 20 }
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
  }, [])

  useEffect(() => {
    const listener = CapApp.addListener('backButton', onBack)
    return () => { void listener.then((value) => value.remove()) }
  }, [onBack])

  async function saveAppSettings(patch: Partial<AppSettings>) {
    await updateAppSettings(patch)
    setSettings((previous) => previous ? {
      ...previous,
      appSettings: { ...previous.appSettings, ...patch },
    } : previous)
  }

  async function saveReaderDefaults(patch: Partial<ReaderDefaults>) {
    await updateReaderDefaults(patch)
    setSettings((previous) => previous ? {
      ...previous,
      readerDefaults: { ...previous.readerDefaults, ...patch },
    } : previous)
  }

  async function validateSpeechifyKey(rawKey: string, persistOnSuccess: boolean) {
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
  }

  async function validateElevenLabsKey(rawKey: string, persistOnSuccess: boolean) {
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
  }

  if (!settings) {
    return (
      <div className="fixed inset-0 flex items-center justify-center bg-bg-base">
        <Spinner tone="purple" />
      </div>
    )
  }

  const currentLang = getLanguageLabel(settings.appSettings.translationTargetLang) ?? settings.appSettings.translationTargetLang
  const previewStyle = getReaderThemePreviewStyle(settings.readerDefaults.readerTheme)
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
          <div className="flex gap-2">
            {FONT_SIZES.map(({ value, label, className }) => {
              const active = settings.readerDefaults.defaultFontSize === value
              return (
                <button
                  key={value}
                  onClick={() => void saveReaderDefaults({ defaultFontSize: value })}
                  className={`flex-1 py-3 rounded-md font-semibold transition-all duration-150 active:scale-95 border ${className} ${
                    active
                      ? 'bg-purple-primary/15 border-purple-primary/50 text-purple-light'
                      : 'bg-bg-surface border-border text-text-muted'
                  }`}
                  aria-pressed={active}
                >
                  {label}
                </button>
              )
            })}
          </div>
          <p
            className="mt-4 text-center leading-relaxed text-text-secondary"
            style={{ fontSize: FONT_PREVIEW_PX[settings.readerDefaults.defaultFontSize] }}
          >
            The quick brown fox jumps over the lazy dog.
          </p>
        </Section>

        <Section title="Espacamento padrao">
          <p className="text-xs text-text-muted mb-3">
            Define a altura de linha usada como base no leitor.
          </p>
          <div className="grid grid-cols-3 gap-2">
            {READER_LINE_HEIGHT_OPTIONS.map(({ value, label }) => {
              const active = settings.readerDefaults.lineHeight === value
              return (
                <button
                  key={value}
                  onClick={() => void saveReaderDefaults({ lineHeight: value })}
                  className={`rounded-md px-3 py-3 text-sm font-semibold transition-all duration-150 active:scale-95 border ${
                    active
                      ? 'bg-purple-primary/15 border-purple-primary/50 text-purple-light'
                      : 'bg-bg-surface border-border text-text-muted'
                  }`}
                  aria-pressed={active}
                >
                  {label}
                </button>
              )
            })}
          </div>
        </Section>

        <Section title="Tema padrao do leitor">
          <p className="text-xs text-text-muted mb-3">
            Aparencia inicial ao abrir qualquer livro.
          </p>
          <div className="grid grid-cols-3 gap-2">
            {READER_THEME_OPTIONS.map(({ value, label }) => {
              const active = settings.readerDefaults.readerTheme === value
              return (
                <button
                  key={value}
                  onClick={() => void saveReaderDefaults({ readerTheme: value })}
                  className={`rounded-md px-3 py-3 text-sm font-semibold transition-all duration-150 active:scale-95 border ${
                    active
                      ? 'bg-purple-primary/15 border-purple-primary/50 text-purple-light'
                      : 'bg-bg-surface border-border text-text-muted'
                  }`}
                  aria-pressed={active}
                >
                  {label}
                </button>
              )
            })}
          </div>

          <div
            className="mt-4 rounded-xl border px-4 py-4"
            style={previewStyle}
          >
            <p
              className="font-serif"
              style={{
                fontSize: FONT_PREVIEW_PX[settings.readerDefaults.defaultFontSize],
                lineHeight: getReaderLineHeightValue(settings.readerDefaults.lineHeight),
                color: previewStyle.color,
              }}
            >
              The quick brown fox jumps over the lazy dog.
            </p>
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
