import { useEffect, useState, type ReactNode } from 'react'
import { ArrowLeft, Eye, EyeOff, Check, Globe, ChevronRight } from 'lucide-react'
import { App as CapApp } from '@capacitor/app'
import { Badge, BottomSheet, Input, ListItem, Spinner } from '../components/ui'
import { getSettings, updateSettings } from '../db/settings'
import type { FontSize, UserSettings } from '../types/settings'

interface SettingsScreenProps {
  onBack: () => void
}

const LANGUAGES = [
  { code: 'pt-BR', label: 'Português (BR)' },
  { code: 'es',    label: 'Espanhol' },
  { code: 'fr',    label: 'Francês' },
  { code: 'de',    label: 'Alemão' },
  { code: 'it',    label: 'Italiano' },
  { code: 'ja',    label: 'Japonês' },
]

const FONT_SIZES: { value: FontSize; label: string; className: string }[] = [
  { value: 'sm', label: 'A', className: 'text-sm' },
  { value: 'md', label: 'A', className: 'text-base' },
  { value: 'lg', label: 'A', className: 'text-lg' },
  { value: 'xl', label: 'A', className: 'text-xl' },
]

const FONT_PREVIEW_PX: Record<FontSize, number> = { sm: 14, md: 16, lg: 18, xl: 20 }

export function SettingsScreen({ onBack }: SettingsScreenProps) {
  const [settings, setSettings] = useState<UserSettings | null>(null)
  const [showKey, setShowKey] = useState(false)
  // Buffer local para o input da API key — persiste no DB ao sair do campo (onBlur)
  const [keyInput, setKeyInput] = useState('')
  const [langSheetOpen, setLangSheetOpen] = useState(false)

  useEffect(() => {
    getSettings().then((s) => {
      setSettings(s)
      setKeyInput(s.speechifyApiKey)
    })
  }, [])

  useEffect(() => {
    const p = CapApp.addListener('backButton', onBack)
    return () => { void p.then((l) => l.remove()) }
  }, [onBack])

  async function save(patch: Partial<Omit<UserSettings, 'id'>>) {
    await updateSettings(patch)
    setSettings((prev) => prev ? { ...prev, ...patch } : prev)
  }

  if (!settings) {
    return (
      <div className="fixed inset-0 flex items-center justify-center bg-bg-base">
        <Spinner tone="purple" />
      </div>
    )
  }

  const currentLang = LANGUAGES.find((l) => l.code === settings.translationTargetLang)?.label ?? settings.translationTargetLang

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
          <p className="text-xs text-text-muted uppercase tracking-wider">Preferências</p>
          <h1 className="text-2xl font-serif font-bold text-purple-light">Configurações</h1>
        </div>
      </header>

      <div className="px-4 flex flex-col gap-6">

        <Section title="TTS Premium (Speechify)">
          <p className="text-xs text-text-muted leading-relaxed mb-3">
            Insira sua API key da Speechify para habilitar vozes neurais e karaokê de palavras.
            Sem a key o app usa o TTS nativo do Android.
          </p>

          <Input
            type={showKey ? 'text' : 'password'}
            value={keyInput}
            onChange={(e) => setKeyInput(e.target.value)}
            onBlur={() => void save({ speechifyApiKey: keyInput.trim() })}
            placeholder="sk-..."
            autoComplete="off"
            spellCheck={false}
            rightSlot={
              <button
                type="button"
                onClick={() => setShowKey((v) => !v)}
                className="p-2 text-text-muted active:opacity-60"
                aria-label={showKey ? 'Ocultar key' : 'Mostrar key'}
              >
                {showKey ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            }
          />

          <div className="mt-3">
            {settings.speechifyApiKey ? (
              <Badge tone="success">
                <Check size={11} /> Key configurada
              </Badge>
            ) : (
              <p className="text-xs text-text-muted">Não configurado — usando TTS nativo</p>
            )}
          </div>
        </Section>

        <Section title="Tradução">
          <div className="-mx-4">
            <ListItem
              leading={<Globe size={20} />}
              title="Idioma de destino"
              meta={currentLang}
              trailing={<ChevronRight size={18} />}
              onClick={() => setLangSheetOpen(true)}
              divider={false}
            />
          </div>
        </Section>

        <Section title="Tamanho de fonte padrão">
          <p className="text-xs text-text-muted mb-3">
            Tamanho inicial ao abrir qualquer livro.
          </p>
          <div className="flex gap-2">
            {FONT_SIZES.map(({ value, label, className }) => {
              const active = settings.defaultFontSize === value
              return (
                <button
                  key={value}
                  onClick={() => void save({ defaultFontSize: value })}
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
            style={{ fontSize: FONT_PREVIEW_PX[settings.defaultFontSize] }}
          >
            The quick brown fox jumps over the lazy dog.
          </p>
        </Section>

      </div>

      <BottomSheet
        open={langSheetOpen}
        onClose={() => setLangSheetOpen(false)}
        title="Idioma de tradução"
      >
        <div className="-mx-4">
          {LANGUAGES.map((lang) => {
            const active = settings.translationTargetLang === lang.code
            return (
              <ListItem
                key={lang.code}
                title={lang.label}
                trailing={active ? <Check size={18} className="text-purple-light" /> : undefined}
                onClick={() => {
                  void save({ translationTargetLang: lang.code })
                  setLangSheetOpen(false)
                }}
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
    <section>
      <h2 className="text-[11px] font-bold uppercase tracking-wider text-text-muted mb-3">
        {title}
      </h2>
      <div className="rounded-md p-4 bg-bg-surface border border-border">
        {children}
      </div>
    </section>
  )
}
