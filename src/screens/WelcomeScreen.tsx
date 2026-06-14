import { useState } from 'react'
import { BarChart3, BookOpen, Bookmark, ChevronRight, Volume2 } from 'lucide-react'
import { useI18n, type MessageKey } from '../i18n'

interface WelcomeScreenProps {
  onComplete: () => void
}

const slides = [
  {
    icon: BookOpen,
    titleKey: 'welcome.slide.store.title',
    descriptionKey: 'welcome.slide.store.description',
    glow: 'rgba(123,44,191,0.32)',
  },
  {
    icon: Bookmark,
    titleKey: 'welcome.slide.reading.title',
    descriptionKey: 'welcome.slide.reading.description',
    glow: 'rgba(16,185,129,0.26)',
  },
  {
    icon: Volume2,
    titleKey: 'welcome.slide.voice.title',
    descriptionKey: 'welcome.slide.voice.description',
    glow: 'rgba(14,165,233,0.22)',
  },
  {
    icon: BarChart3,
    titleKey: 'welcome.slide.progress.title',
    descriptionKey: 'welcome.slide.progress.description',
    glow: 'rgba(251,191,36,0.24)',
  },
] satisfies Array<{
  icon: typeof BookOpen
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
        <div className="w-40 h-40 rounded-[40px] bg-white/[0.04] border border-white/[0.08] flex items-center justify-center shadow-deep">
          <Icon size={76} strokeWidth={1.7} className="text-purple-light" />
        </div>
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
