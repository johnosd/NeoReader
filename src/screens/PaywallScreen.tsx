import { ArrowLeft, BookOpen, CloudUpload, Hourglass, Sparkles } from 'lucide-react'
import { useCapacitorBackButton } from '../hooks/useCapacitorAppListener'
import { cn } from '../utils/cn'

interface PaywallScreenProps {
  onBack: () => void
}

interface BenefitItem {
  icon: React.ReactNode
  title: string
  description: string
  available: boolean
}

// NeoReader Pro ainda nao esta a venda. Quando Drive Sync ficar pronto (Sprint 3),
// esta tela volta a buscar offerings do RevenueCat e exibir os pacotes.
// Por enquanto, eh uma "preview" honesta do que vem por ai.
const BENEFITS: BenefitItem[] = [
  {
    icon: <Sparkles size={18} className="text-purple-light" />,
    title: 'Sem anúncios',
    description: 'Biblioteca, descobrir e vocabulário ficam limpos.',
    available: true,
  },
  {
    icon: <CloudUpload size={18} className="text-purple-light" />,
    title: 'Sincronização Google Drive',
    description: 'Progresso, marcadores e vocabulário em todos os seus dispositivos.',
    available: false,
  },
  {
    icon: <BookOpen size={18} className="text-purple-light" />,
    title: 'Falar com o livro (IA)',
    description: 'Pergunte sobre passagens, peça resumos, tire dúvidas de vocabulário em contexto.',
    available: false,
  },
]

export function PaywallScreen({ onBack }: PaywallScreenProps) {
  useCapacitorBackButton(onBack)

  return (
    <div className="min-h-screen bg-bg-base pb-12 text-text-primary">
      <header className="sticky top-0 z-20 flex items-center gap-3 border-b border-white/5 bg-bg-base/95 px-4 pb-3 pt-10 backdrop-blur">
        <button
          onClick={onBack}
          className="-ml-1 rounded-md p-2 text-text-secondary transition-transform active:scale-90"
          aria-label="Voltar"
        >
          <ArrowLeft size={20} />
        </button>
        <div className="min-w-0">
          <h1 className="text-lg font-extrabold tracking-[-0.02em] text-text-primary">NeoReader Pro</h1>
          <p className="text-xs text-text-muted">O que vem por aí.</p>
        </div>
      </header>

      <div className="flex flex-col gap-7 px-4 pt-6">
        <section className="rounded-md border border-purple-primary/30 bg-purple-primary/10 p-4">
          <div className="flex items-start gap-3">
            <div className="rounded-full bg-purple-primary/20 p-2 text-purple-light">
              <Hourglass size={18} />
            </div>
            <div className="flex-1">
              <h2 className="text-sm font-semibold text-text-primary">Em desenvolvimento</h2>
              <p className="mt-1 text-xs leading-relaxed text-text-muted">
                Estamos preparando o NeoReader Pro com calma. Por enquanto, tudo no app é gratuito —
                use sem pressa e nos diga o que mais faria sentido cobrar.
              </p>
            </div>
          </div>
        </section>

        <section>
          <h2 className="mb-3 text-[11px] font-bold uppercase tracking-[0.1em] text-purple-light">
            Benefícios planejados
          </h2>
          <div className="overflow-hidden rounded-md border border-border bg-bg-surface">
            {BENEFITS.map((benefit, index) => (
              <div
                key={benefit.title}
                className={cn(
                  'flex items-start gap-3 px-4 py-4',
                  index !== BENEFITS.length - 1 && 'border-b border-white/5',
                )}
              >
                <div className="mt-0.5">{benefit.icon}</div>
                <div className="flex-1">
                  <div className="flex items-center justify-between gap-3">
                    <h3 className="text-sm font-semibold text-text-primary">{benefit.title}</h3>
                    <span
                      className={cn(
                        'text-[10px] font-bold uppercase tracking-wider',
                        benefit.available ? 'text-success' : 'text-text-muted',
                      )}
                    >
                      {benefit.available ? 'Já disponível' : 'Em breve'}
                    </span>
                  </div>
                  <p className="mt-1 text-xs leading-relaxed text-text-muted">{benefit.description}</p>
                </div>
              </div>
            ))}
          </div>
        </section>

        <section className="rounded-md border border-border bg-bg-surface p-4">
          <h3 className="text-sm font-semibold text-text-primary">Quer ser avisado no lançamento?</h3>
          <p className="mt-1 text-xs leading-relaxed text-text-muted">
            Quando os benefícios acima estiverem prontos, o Pro vai aparecer aqui pra assinar.
            Continue usando o app de graça enquanto isso.
          </p>
        </section>

        <p className="px-2 text-center text-[10px] leading-relaxed text-text-muted">
          Ao usar o NeoReader você concorda com nossa{' '}
          <a
            href="https://johnosd.github.io/neoreader-legal/"
            target="_blank"
            rel="noopener noreferrer"
            className="text-purple-light underline"
          >
            política de privacidade
          </a>
          .
        </p>
      </div>
    </div>
  )
}
