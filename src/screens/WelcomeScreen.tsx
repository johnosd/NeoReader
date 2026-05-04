import { useState } from 'react'
import { BarChart3, BookOpen, Bookmark, ChevronRight } from 'lucide-react'

interface WelcomeScreenProps {
  onComplete: () => void
}

const slides = [
  {
    icon: BookOpen,
    title: '50.000 livros',
    description: 'Explore um catalogo enorme de romances, fantasia, negocios, suspense e muito mais.',
    glow: 'rgba(123,44,191,0.32)',
  },
  {
    icon: Bookmark,
    title: 'Leia sem limites',
    description: 'Faca marcacoes, anote trechos favoritos e retome de onde parou em qualquer dispositivo.',
    glow: 'rgba(16,185,129,0.26)',
  },
  {
    icon: BarChart3,
    title: 'Acompanhe seu progresso',
    description: 'Veja quantos livros voce leu, seu recorde de dias seguidos e o tempo total de leitura.',
    glow: 'rgba(251,191,36,0.24)',
  },
]

export function WelcomeScreen({ onComplete }: WelcomeScreenProps) {
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
          Pular
        </button>
      </header>

      <section className="relative z-10 flex-1 flex items-center justify-center px-8">
        <div className="w-40 h-40 rounded-[40px] bg-white/[0.04] border border-white/[0.08] flex items-center justify-center shadow-deep">
          <Icon size={76} strokeWidth={1.7} className="text-purple-light" />
        </div>
      </section>

      <section className="relative z-10 px-8 pb-12">
        <h1 className="text-center text-[28px] leading-tight font-serif font-black text-text-primary mb-3">
          {current.title}
        </h1>
        <p className="text-center text-[15px] leading-relaxed text-text-secondary mb-8">
          {current.description}
        </p>

        <div className="flex justify-center gap-2 mb-7" aria-label="Etapas do onboarding">
          {slides.map((item, index) => (
            <button
              key={item.title}
              type="button"
              onClick={() => setSlide(index)}
              className={[
                'h-1.5 rounded-pill transition-all duration-300',
                index === slide ? 'w-6 bg-purple-light' : 'w-1.5 bg-white/15',
              ].join(' ')}
              aria-label={`Ir para slide ${index + 1}`}
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
          {lastSlide ? 'Comecar agora' : 'Proximo'}
          {lastSlide && <ChevronRight size={18} />}
        </button>
      </section>
    </main>
  )
}
