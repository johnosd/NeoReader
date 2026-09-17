import { useState } from 'react'
import { BarChart3, BookOpen, Bookmark, ChevronRight, Languages, Rss } from 'lucide-react'
import { useI18n, type MessageKey } from '../i18n'
// Logos reais dos providers (ja usados no app, ver TtsMiniPlayer.tsx, ou
// baixados dos kits oficiais/Wikimedia/Simple Icons pra tradução) — em vez
// de icones genericos do lucide-react pros slides que citam marcas.
import elevenLabsLogo from '../assets/tts-providers/elevenlabs.svg'
import speechifyLogo from '../assets/tts-providers/speechify.svg'
import fishAudioLogo from '../assets/tts-providers/fishaudio.svg'
import openaiLogo from '../assets/translation-providers/openai.svg'
import googleLogo from '../assets/translation-providers/google.svg'
import deeplLogo from '../assets/translation-providers/deepl.svg'

interface WelcomeScreenProps {
  onComplete: () => void
}

interface ProviderBadge {
  name: string
  logo: string
  captionKey: MessageKey
}

const slides = [
  {
    icon: BookOpen,
    titleKey: 'welcome.slide.store.title',
    descriptionKey: 'welcome.slide.store.description',
    glow: 'rgba(123,44,191,0.32)',
  },
  // Diferencial de maior destaque (feature 018) logo apos a abertura, antes
  // dos demais diferenciais novos (FR-002 da spec 019).
  {
    icon: Languages,
    titleKey: 'welcome.slide.translatedTts.title',
    descriptionKey: 'welcome.slide.translatedTts.description',
    glow: 'rgba(99,102,241,0.28)',
  },
  {
    icon: Bookmark,
    titleKey: 'welcome.slide.reading.title',
    descriptionKey: 'welcome.slide.reading.description',
    glow: 'rgba(16,185,129,0.26)',
  },
  {
    providers: [
      { name: 'ElevenLabs', logo: elevenLabsLogo, captionKey: 'welcome.provider.elevenlabs.caption' },
      { name: 'Speechify', logo: speechifyLogo, captionKey: 'welcome.provider.speechify.caption' },
      { name: 'Fish Audio', logo: fishAudioLogo, captionKey: 'welcome.provider.fishaudio.caption' },
    ],
    titleKey: 'welcome.slide.voice.title',
    descriptionKey: 'welcome.slide.voice.description',
    glow: 'rgba(14,165,233,0.22)',
  },
  {
    providers: [
      { name: 'OpenAI', logo: openaiLogo, captionKey: 'welcome.provider.openai.caption' },
      { name: 'Google', logo: googleLogo, captionKey: 'welcome.provider.google.caption' },
      { name: 'DeepL', logo: deeplLogo, captionKey: 'welcome.provider.deepl.caption' },
    ],
    titleKey: 'welcome.slide.translationProviders.title',
    descriptionKey: 'welcome.slide.translationProviders.description',
    glow: 'rgba(157,78,221,0.26)',
  },
  {
    icon: Rss,
    titleKey: 'welcome.slide.opds.title',
    descriptionKey: 'welcome.slide.opds.description',
    glow: 'rgba(236,72,153,0.22)',
  },
  {
    icon: BarChart3,
    titleKey: 'welcome.slide.progress.title',
    descriptionKey: 'welcome.slide.progress.description',
    glow: 'rgba(251,191,36,0.24)',
  },
] satisfies Array<{
  icon?: typeof BookOpen
  providers?: ProviderBadge[]
  titleKey: MessageKey
  descriptionKey: MessageKey
  glow: string
}>

export function WelcomeScreen({ onComplete }: WelcomeScreenProps) {
  const { t } = useI18n()
  const [slide, setSlide] = useState(0)
  const current = slides[slide]
  const Icon = current.icon
  const lastSlide = slide === slides.length - 1

  return (
    <main className="min-h-screen bg-bg-base text-text-primary relative overflow-hidden flex flex-col">
      <div
        className="absolute inset-0 transition-all duration-500 pointer-events-none"
        style={{
          background: `radial-gradient(ellipse at 50% 30%, ${current.glow} 0%, transparent 65%)`,
        }}
      />

      <header className="relative z-10 h-14 px-5 flex items-center justify-end">
        <button
          type="button"
          onClick={onComplete}
          className="text-sm font-medium text-text-muted active:text-text-primary transition-colors"
        >
          {t('welcome.skip')}
        </button>
      </header>

      <section className="relative z-10 flex-1 flex items-center justify-center px-8">
        {current.providers ? (
          // Cards com logo + nome + legenda, num row horizontal scrollavel —
          // mesmo idioma visual das rows de livros do resto do app ("Netflix
          // for Books"), em vez de 1 icone generico. Largura fixa por card
          // (nao encolhe pra caber) pra legenda continuar legivel; quando os
          // 3 nao cabem na tela (~360-400px), o row rola em vez de espremer.
          <div className="w-full overflow-x-auto px-8 -mx-8 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            <div className="flex gap-3 px-8">
              {current.providers.map((provider) => (
                <div
                  key={provider.name}
                  className="w-[134px] shrink-0 flex flex-col items-center gap-2 rounded-[20px] bg-white/[0.04] border border-white/[0.08] px-3 py-5 text-center shadow-deep"
                >
                  <img src={provider.logo} alt="" aria-hidden="true" className="h-9 w-9 shrink-0 object-contain" />
                  <span className="text-sm font-bold text-text-primary">{provider.name}</span>
                  <span className="text-xs leading-snug text-text-muted">{t(provider.captionKey)}</span>
                </div>
              ))}
            </div>
          </div>
        ) : (
          Icon && (
            <div className="w-40 h-40 rounded-[40px] bg-white/[0.04] border border-white/[0.08] flex items-center justify-center shadow-deep">
              <Icon size={76} strokeWidth={1.7} className="text-purple-light" />
            </div>
          )
        )}
      </section>

      <section className="relative z-10 px-8 pb-12">
        <h1 className="text-center text-[28px] leading-tight font-serif font-black text-text-primary mb-3">
          {t(current.titleKey)}
        </h1>
        <p className="text-center text-[15px] leading-relaxed text-text-secondary mb-8">
          {t(current.descriptionKey)}
        </p>

        <div className="flex justify-center gap-2 mb-7" aria-label={t('welcome.stepsLabel')}>
          {slides.map((item, index) => (
            <button
              key={item.titleKey}
              type="button"
              onClick={() => setSlide(index)}
              className={[
                'h-1.5 rounded-pill transition-all duration-300',
                index === slide ? 'w-6 bg-purple-light' : 'w-1.5 bg-white/15',
              ].join(' ')}
              aria-label={t('welcome.goToSlide', { index: index + 1 })}
              aria-current={index === slide ? 'step' : undefined}
            />
          ))}
        </div>

        <button
          type="button"
          onClick={() => {
            if (lastSlide) {
              onComplete()
              return
            }
            setSlide((value) => value + 1)
          }}
          className="h-[52px] w-full rounded-[14px] bg-purple-primary text-white text-base font-bold shadow-purple-glow active:scale-[0.98] transition-transform flex items-center justify-center gap-2"
        >
          {lastSlide ? t('welcome.start') : t('welcome.next')}
          {lastSlide && <ChevronRight size={18} />}
        </button>
      </section>
    </main>
  )
}
