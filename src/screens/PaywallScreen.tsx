import { useEffect, useState } from 'react'
import { ArrowLeft, BookOpen, Check, CloudUpload, Sparkles } from 'lucide-react'
import type { PurchasesOffering, PurchasesPackage } from '@revenuecat/purchases-capacitor'
import { Badge, Button, Spinner } from '../components/ui'
import { BillingService } from '../services/BillingService'
import { useCapacitorBackButton } from '../hooks/useCapacitorAppListener'
import { useEntitlements } from '../hooks/useEntitlements'
import { cn } from '../utils/cn'

interface PaywallScreenProps {
  onBack: () => void
}

interface BenefitItem {
  icon: React.ReactNode
  title: string
  description: string
}

const BENEFITS: BenefitItem[] = [
  {
    icon: <Sparkles size={18} className="text-purple-light" />,
    title: 'Sem anúncios',
    description: 'Biblioteca, descobrir e vocabulário ficam limpos.',
  },
  {
    icon: <CloudUpload size={18} className="text-purple-light" />,
    title: 'Sincronização Google Drive',
    description: 'Progresso, marcadores e vocabulário em todos os seus dispositivos.',
  },
  {
    icon: <BookOpen size={18} className="text-purple-light" />,
    title: 'Recursos de IA em breve',
    description: 'Resumos de capítulo, quiz e "falar com livro" inclusos no plano.',
  },
]

function formatPrice(pkg: PurchasesPackage): string {
  return pkg.product.priceString
}

// Heuristica: identifica qual package eh "popular" pra destacar visualmente.
// O RevenueCat retorna pacotes com identificadores tipo "$rc_annual", "$rc_monthly", "$rc_lifetime".
function isHighlightedPackage(pkg: PurchasesPackage): boolean {
  return pkg.identifier.includes('annual') || pkg.identifier === '$rc_annual'
}

function getPackageLabel(pkg: PurchasesPackage): string {
  const id = pkg.identifier.toLowerCase()
  if (id.includes('annual') || id.includes('year')) return 'Anual'
  if (id.includes('month')) return 'Mensal'
  if (id.includes('lifetime')) return 'Vitalício'
  return pkg.product.title || pkg.identifier
}

function getPackageSubtitle(pkg: PurchasesPackage): string | undefined {
  const id = pkg.identifier.toLowerCase()
  if (id.includes('annual') || id.includes('year')) return 'Cobrado uma vez por ano'
  if (id.includes('month')) return 'Cobrado mensalmente'
  if (id.includes('lifetime')) return 'Pagamento único'
  return undefined
}

export function PaywallScreen({ onBack }: PaywallScreenProps) {
  const { isPro, activeProductId, expiresAt } = useEntitlements()
  const [offering, setOffering] = useState<PurchasesOffering | null>(null)
  const [loadingOffering, setLoadingOffering] = useState(true)
  const [purchasingId, setPurchasingId] = useState<string | null>(null)
  const [restoring, setRestoring] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useCapacitorBackButton(onBack)

  useEffect(() => {
    let cancelled = false
    if (!BillingService.isAvailable()) {
      setLoadingOffering(false)
      return
    }
    void BillingService.getOffering().then((value) => {
      if (cancelled) return
      setOffering(value)
      setLoadingOffering(false)
    }).catch((err) => {
      if (cancelled) return
      setError(err instanceof Error ? err.message : 'Não foi possível carregar os planos.')
      setLoadingOffering(false)
    })
    return () => { cancelled = true }
  }, [])

  async function handlePurchase(pkg: PurchasesPackage) {
    setError(null)
    setPurchasingId(pkg.identifier)
    try {
      await BillingService.purchasePackage(pkg)
    } catch (err) {
      // SDK levanta erro "user cancelled" quando o usuario fecha o sheet - nao mostrar.
      const message = err instanceof Error ? err.message : 'Compra não pôde ser concluída.'
      if (!/cancel/i.test(message)) setError(message)
    } finally {
      setPurchasingId(null)
    }
  }

  async function handleRestore() {
    setError(null)
    setRestoring(true)
    try {
      await BillingService.restore()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Não foi possível restaurar.')
    } finally {
      setRestoring(false)
    }
  }

  const billingAvailable = BillingService.isAvailable()

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
          <p className="text-xs text-text-muted">Apoie o app e desbloqueie recursos premium.</p>
        </div>
      </header>

      <div className="flex flex-col gap-7 px-4 pt-6">
        {isPro && (
          <section className="rounded-md border border-success/30 bg-success/10 p-4">
            <div className="flex items-start gap-3">
              <div className="rounded-full bg-success/20 p-2 text-success">
                <Check size={18} />
              </div>
              <div className="flex-1">
                <h2 className="text-sm font-semibold text-text-primary">Você é Pro</h2>
                <p className="mt-1 text-xs text-text-muted">
                  Plano ativo: <strong>{activeProductId ?? 'NeoReader Pro'}</strong>
                  {expiresAt && (
                    <> · Renova em {expiresAt.toLocaleDateString('pt-BR')}</>
                  )}
                </p>
                <p className="mt-2 text-xs text-text-muted">
                  Para alterar ou cancelar, gerencie no Google Play.
                </p>
              </div>
            </div>
          </section>
        )}

        <section>
          <h2 className="mb-3 text-[11px] font-bold uppercase tracking-[0.1em] text-purple-light">
            O que vem no Pro
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
                  <h3 className="text-sm font-semibold text-text-primary">{benefit.title}</h3>
                  <p className="mt-1 text-xs leading-relaxed text-text-muted">{benefit.description}</p>
                </div>
              </div>
            ))}
          </div>
        </section>

        <section>
          <h2 className="mb-3 text-[11px] font-bold uppercase tracking-[0.1em] text-purple-light">
            Escolha um plano
          </h2>

          {!billingAvailable && (
            <div className="rounded-md border border-warning/30 bg-warning/10 px-4 py-3 text-xs text-text-secondary">
              Compras só estão disponíveis no app Android instalado pela Play Store.
              Esta visualização em web/dev mostra apenas a interface.
            </div>
          )}

          {billingAvailable && loadingOffering && (
            <div className="flex justify-center py-8">
              <Spinner tone="purple" />
            </div>
          )}

          {billingAvailable && !loadingOffering && !offering && (
            <div className="rounded-md border border-border bg-bg-surface px-4 py-6 text-center text-xs text-text-muted">
              Nenhum plano disponível no momento. Tente novamente em alguns instantes.
            </div>
          )}

          {offering && (
            <div className="flex flex-col gap-3">
              {offering.availablePackages.map((pkg) => {
                const highlighted = isHighlightedPackage(pkg)
                const isThisPurchasing = purchasingId === pkg.identifier
                return (
                  <button
                    key={pkg.identifier}
                    type="button"
                    onClick={() => void handlePurchase(pkg)}
                    disabled={purchasingId !== null || isPro === true}
                    className={cn(
                      'flex items-center justify-between gap-4 rounded-md border bg-bg-surface px-4 py-4 text-left transition-all',
                      'active:scale-[0.99] disabled:opacity-60',
                      highlighted
                        ? 'border-purple-primary ring-1 ring-purple-primary/40'
                        : 'border-border',
                    )}
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <h3 className="text-sm font-semibold text-text-primary">{getPackageLabel(pkg)}</h3>
                        {highlighted && <Badge tone="success">Mais popular</Badge>}
                      </div>
                      {getPackageSubtitle(pkg) && (
                        <p className="mt-1 text-xs text-text-muted">{getPackageSubtitle(pkg)}</p>
                      )}
                    </div>
                    <div className="flex-shrink-0 text-right">
                      <div className="text-base font-bold text-text-primary">{formatPrice(pkg)}</div>
                      {isThisPurchasing && (
                        <div className="mt-1 text-[10px] text-text-muted">Processando...</div>
                      )}
                    </div>
                  </button>
                )
              })}
            </div>
          )}

          {error && (
            <p className="mt-3 text-xs text-error">{error}</p>
          )}
        </section>

        <section className="flex flex-col gap-2">
          <Button
            variant="ghost"
            tone="purple"
            size="sm"
            onClick={() => void handleRestore()}
            disabled={restoring || !billingAvailable}
          >
            {restoring ? 'Restaurando...' : 'Restaurar compras'}
          </Button>
          <p className="px-2 text-center text-[10px] leading-relaxed text-text-muted">
            As assinaturas renovam automaticamente até serem canceladas. Você pode cancelar a qualquer momento pelo Google Play.
            Ao continuar, você concorda com nossa{' '}
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
        </section>
      </div>
    </div>
  )
}
