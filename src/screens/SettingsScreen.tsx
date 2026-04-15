import { useEffect, useState } from 'react'
import { Eye, EyeOff, Check } from 'lucide-react'
import { App as CapApp } from '@capacitor/app'
import { getSettings, updateSettings } from '../db/settings'
import type { FontSize, UserSettings } from '../types/settings'

interface SettingsScreenProps {
  onBack: () => void
}

// Idiomas disponíveis para tradução
const LANGUAGES = [
  { code: 'pt-BR', label: 'Português (BR)' },
  { code: 'es',   label: 'Espanhol' },
  { code: 'fr',   label: 'Francês' },
  { code: 'de',   label: 'Alemão' },
  { code: 'it',   label: 'Italiano' },
  { code: 'ja',   label: 'Japonês' },
]

const FONT_SIZES: { value: FontSize; label: string }[] = [
  { value: 'sm', label: 'A' },
  { value: 'md', label: 'A' },
  { value: 'lg', label: 'A' },
  { value: 'xl', label: 'A' },
]

const FONT_SIZE_LABELS: Record<FontSize, string> = {
  sm: 'text-sm',
  md: 'text-base',
  lg: 'text-lg',
  xl: 'text-xl',
}

export function SettingsScreen({ onBack }: SettingsScreenProps) {
  const [settings, setSettings] = useState<UserSettings | null>(null)
  const [showKey, setShowKey] = useState(false)
  // Buffer local para o input da API key — salva no DB ao sair do campo (onBlur)
  const [keyInput, setKeyInput] = useState('')

  useEffect(() => {
    getSettings().then((s) => {
      setSettings(s)
      setKeyInput(s.speechifyApiKey)
    })
  }, [])

  // Intercepta o Back físico do Android
  useEffect(() => {
    const p = CapApp.addListener('backButton', onBack)
    return () => { void p.then((l) => l.remove()) }
  }, [onBack])

  // Salva um campo imediatamente — chamado no onChange de selects/pills
  async function save(patch: Partial<Omit<UserSettings, 'id'>>) {
    await updateSettings(patch)
    setSettings((prev) => prev ? { ...prev, ...patch } : prev)
  }

  if (!settings) {
    return (
      <div className="fixed inset-0 flex items-center justify-center" style={{ background: '#0f0c18' }}>
        <div className="w-6 h-6 border-2 border-t-transparent rounded-full animate-spin" style={{ borderColor: '#9d4edd' }} />
      </div>
    )
  }

  return (
    <div className="min-h-screen pb-12" style={{ background: '#0f0c18', color: '#fff' }}>
      {/* Header */}
      <header className="px-5 pt-10 pb-4 flex items-center gap-3">
        <button
          onClick={onBack}
          className="p-2 -ml-1 rounded-xl active:opacity-60"
          style={{ color: '#a5a5a5' }}
          aria-label="Voltar"
        >
          ←
        </button>
        <div>
          <p className="text-sm" style={{ color: '#a5a5a5' }}>Preferências</p>
          <h1 className="text-2xl font-bold" style={{ color: '#c77dff' }}>Configurações</h1>
        </div>
      </header>

      <div className="px-4 flex flex-col gap-6">

        {/* ── Seção: TTS Premium ──────────────────────────────────── */}
        <Section title="TTS Premium (Speechify)">
          <p className="text-xs mb-3 leading-relaxed" style={{ color: '#a5a5a5' }}>
            Insira sua API key da Speechify para habilitar vozes neurais e karaokê de palavras.
            Sem a key o app usa o TTS nativo do Android.
          </p>

          {/* Input da API key */}
          <div
            className="flex items-center gap-2 px-3 py-3 rounded-xl"
            style={{ background: '#1c182b', border: '1px solid rgba(255,255,255,0.08)' }}
          >
            <input
              type={showKey ? 'text' : 'password'}
              value={keyInput}
              onChange={(e) => setKeyInput(e.target.value)}
              // Salva no DB só ao sair do campo — evita uma gravação por tecla pressionada
              onBlur={() => void save({ speechifyApiKey: keyInput.trim() })}
              placeholder="sk-..."
              className="flex-1 bg-transparent text-sm outline-none placeholder:text-[#555]"
              style={{ color: '#fff' }}
              autoComplete="off"
              spellCheck={false}
            />
            <button
              onClick={() => setShowKey((v) => !v)}
              className="p-1 active:opacity-60"
              style={{ color: '#a5a5a5' }}
              aria-label={showKey ? 'Ocultar key' : 'Mostrar key'}
            >
              {showKey ? <EyeOff size={16} /> : <Eye size={16} />}
            </button>
          </div>

          {/* Badge de status */}
          {settings.speechifyApiKey ? (
            <div className="flex items-center gap-1.5 mt-2">
              <Check size={13} style={{ color: '#22c55e' }} />
              <span className="text-xs" style={{ color: '#22c55e' }}>Key configurada</span>
            </div>
          ) : (
            <p className="text-xs mt-2" style={{ color: '#a5a5a5' }}>Não configurado — usando TTS nativo</p>
          )}
        </Section>

        {/* ── Seção: Tradução ──────────────────────────────────────── */}
        <Section title="Tradução">
          <p className="text-xs mb-3" style={{ color: '#a5a5a5' }}>
            Idioma de destino para traduções no leitor.
          </p>
          <div className="flex flex-col gap-2">
            {LANGUAGES.map((lang) => {
              const active = settings.translationTargetLang === lang.code
              return (
                <button
                  key={lang.code}
                  onClick={() => void save({ translationTargetLang: lang.code })}
                  className="flex items-center justify-between px-4 py-3 rounded-xl text-sm active:opacity-70 transition-colors"
                  style={{
                    background: active ? 'rgba(157,78,221,0.18)' : '#1c182b',
                    border: active ? '1px solid rgba(157,78,221,0.5)' : '1px solid rgba(255,255,255,0.06)',
                    color: active ? '#c77dff' : '#fff',
                  }}
                >
                  <span>{lang.label}</span>
                  {active && <Check size={15} style={{ color: '#c77dff' }} />}
                </button>
              )
            })}
          </div>
        </Section>

        {/* ── Seção: Leitura ───────────────────────────────────────── */}
        <Section title="Tamanho de fonte padrão">
          <p className="text-xs mb-3" style={{ color: '#a5a5a5' }}>
            Tamanho inicial ao abrir qualquer livro.
          </p>
          <div className="flex gap-3">
            {FONT_SIZES.map(({ value, label }) => {
              const active = settings.defaultFontSize === value
              return (
                <button
                  key={value}
                  onClick={() => void save({ defaultFontSize: value })}
                  className={`flex-1 py-3 rounded-xl font-medium transition-colors active:opacity-70 ${FONT_SIZE_LABELS[value]}`}
                  style={{
                    background: active ? 'rgba(157,78,221,0.18)' : '#1c182b',
                    border: active ? '1px solid rgba(157,78,221,0.5)' : '1px solid rgba(255,255,255,0.06)',
                    color: active ? '#c77dff' : '#a5a5a5',
                  }}
                >
                  {label}
                </button>
              )
            })}
          </div>
          {/* Preview visual do tamanho selecionado */}
          <p
            className="mt-3 text-center leading-relaxed"
            style={{ color: '#a5a5a5', fontSize: { sm: 14, md: 16, lg: 18, xl: 20 }[settings.defaultFontSize] }}
          >
            The quick brown fox jumps over the lazy dog.
          </p>
        </Section>

      </div>
    </div>
  )
}

// ─── Componente auxiliar de seção ────────────────────────────────────────────

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <h2 className="text-xs font-semibold uppercase tracking-wider mb-3" style={{ color: '#6b6b8a' }}>
        {title}
      </h2>
      <div
        className="rounded-2xl p-4"
        style={{ background: '#13111f', border: '1px solid rgba(255,255,255,0.05)' }}
      >
        {children}
      </div>
    </section>
  )
}
