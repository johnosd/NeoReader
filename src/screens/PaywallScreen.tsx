import { ArrowLeft, BookOpen, CheckCircle2, CloudUpload, Compass, CreditCard, RefreshCw, Sparkles } from 'lucide-react'
import { useEffect, useState, type ReactNode } from 'react'
import { PACKAGE_TYPE, type PurchasesOffering, type PurchasesPackage } from '@revenuecat/purchases-capacitor'
import { Badge, Button, Spinner } from '../components/ui'
import { useCapacitorBackButton } from '../hooks/useCapacitorAppListener'
import { BillingService } from '../services/BillingService'
import { cn } from '../utils/cn'
import { useI18n, type MessageKey } from '../i18n'

interface PaywallScreenProps {
  onBack: () => void
}

interface BenefitItem {
  icon: ReactNode
  titleKey: MessageKey
  descriptionKey: MessageKey
  available: boolean
}

const BENEFITS: BenefitItem[] = [
  {
    icon: <Sparkles size={18} className="text-purple-light" />,
    titleKey: 'paywall.benefit.noAds.title',
    descriptionKey: 'paywall.benefit.noAds.description',
    available: true,
  },
  {
    icon: <CloudUpload size={18} className="text-purple-light" />,
    titleKey: 'paywall.benefit.sync.title',
    descriptionKey: 'paywall.benefit.sync.description',
    available: true,
  },
  {
    icon: <Compass size={18} className="text-purple-light" />,
    titleKey: 'paywall.benefit.discovery.title',
    descriptionKey: 'paywall.benefit.discovery.description',
    available: true,
  },
  {
    icon: <BookOpen size={18} className="text-purple-light" />,
    titleKey: 'paywall.benefit.ai.title',
    descriptionKey: 'paywall.benefit.ai.description',
    available: false,
  },
]

type PlanKey = 'monthly' | 'annual'
type LoadState = 'loading' | 'ready' | 'unavailable' | 'empty' | 'error'

interface PlanOption {
  key: PlanKey
  pkg: PurchasesPackage
  titleKey: MessageKey
  descriptionKey: MessageKey
  ctaKey: MessageKey
  badgeKey?: MessageKey
}

interface ActionMessage {
  tone: 'success' | 'error'
  text: string
}

function packageMatches(pkg: PurchasesPackage, key: PlanKey): boolean {
  if (key === 'monthly') {
    return (
      pkg.packageType === PACKAGE_TYPE.MONTHLY ||
      pkg.product.identifier === 'pro_monthly' ||
      pkg.product.identifier.startsWith('pro_monthly:') ||
      pkg.product.subscriptionPeriod === 'P1M'
    )
  }

  return (
    pkg.packageType === PACKAGE_TYPE.ANNUAL ||
    pkg.product.identifier === 'pro_annual' ||
    pkg.product.identifier.startsWith('pro_annual:') ||
    pkg.product.subscriptionPeriod === 'P1Y'
  )
}

function getPackageForPlan(offering: PurchasesOffering, key: PlanKey): PurchasesPackage | null {
  if (key === 'monthly' && offering.monthly) return offering.monthly
  if (key === 'annual' && offering.annual) return offering.annual
  return offering.availablePackages.find((pkg) => packageMatches(pkg, key)) ?? null
}

function buildPlanOptions(offering: PurchasesOffering): PlanOption[] {
  const monthly = getPackageForPlan(offering, 'monthly')
  const annual = getPackageForPlan(offering, 'annual')
  const plans: PlanOption[] = []

  if (monthly) {
    plans.push({
      key: 'monthly',
      pkg: monthly,
      titleKey: 'paywall.plan.monthly.title',
      descriptionKey: 'paywall.plan.monthly.description',
      ctaKey: 'paywall.plan.monthly.cta',
    })
  }

  if (annual) {
    plans.push({
      key: 'annual',
      pkg: annual,
      titleKey: 'paywall.plan.annual.title',
      descriptionKey: 'paywall.plan.annual.description',
      ctaKey: 'paywall.plan.annual.cta',
      badgeKey: 'paywall.plan.annual.badge',
    })
  }

  return plans
}

function isUserCancelledPurchase(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false
  const maybeError = error as { userCancelled?: unknown; code?: unknown }
  return maybeError.userCancelled === true || maybeError.code === 'PURCHASE_CANCELLED'
}

export function PaywallScreen({ onBack }: PaywallScreenProps) {
  const { t } = useI18n()
  const [loadState, setLoadState] = useState<LoadState>('loading')
  const [plans, setPlans] = useState<PlanOption[]>([])
  const [processingPlan, setProcessingPlan] = useState<PlanKey | null>(null)
  const [restoring, setRestoring] = useState(false)
  const [message, setMessage] = useState<ActionMessage | null>(null)
  useCapacitorBackButton(onBack)

  useEffect(() => {
    let cancelled = false

    async function loadOffering() {
      if (!BillingService.isAvailable()) {
        setLoadState('unavailable')
        return
      }

      setLoadState('loading')
      setMessage(null)

      try {
        const offering = await BillingService.getOffering()
        if (cancelled) return

        if (!offering) {
          setPlans([])
          setLoadState('empty')
          return
        }

        const nextPlans = buildPlanOptions(offering)
        setPlans(nextPlans)
        setLoadState(nextPlans.length > 0 ? 'ready' : 'empty')
      } catch {
        if (!cancelled) setLoadState('error')
      }
    }

    void loadOffering()

    return () => {
      cancelled = true
    }
  }, [])

  async function handlePurchase(plan: PlanOption) {
    setProcessingPlan(plan.key)
    setMessage(null)
    try {
      const status = await BillingService.purchasePackage(plan.pkg)
      setMessage({
        tone: status.isPro ? 'success' : 'error',
        text: status.isPro ? t('paywall.purchase.success') : t('paywall.purchase.notActive'),
      })
    } catch (error) {
      if (!isUserCancelledPurchase(error)) {
        setMessage({ tone: 'error', text: t('paywall.purchase.error') })
      }
    } finally {
      setProcessingPlan(null)
    }
  }

  async function handleRestore() {
    setRestoring(true)
    setMessage(null)
    try {
      const status = await BillingService.restore()
      setMessage({
        tone: status.isPro ? 'success' : 'error',
        text: status.isPro ? t('paywall.restore.success') : t('paywall.restore.empty'),
      })
    } catch {
      setMessage({ tone: 'error', text: t('paywall.restore.error') })
    } finally {
      setRestoring(false)
    }
  }

  function renderPlans() {
    if (loadState === 'loading') {
      return (
        <section className="rounded-md border border-border bg-bg-surface p-5">
          <Spinner label={t('paywall.loading')} />
        </section>
      )
    }

    if (loadState === 'unavailable') {
      return (
        <PaywallNotice
          title={t('paywall.unavailable.title')}
          description={t('paywall.unavailable.description')}
        />
      )
    }

    if (loadState === 'empty') {
      return (
        <PaywallNotice
          title={t('paywall.empty.title')}
          description={t('paywall.empty.description')}
        />
      )
    }

    if (loadState === 'error') {
      return (
        <PaywallNotice
          title={t('paywall.error.title')}
          description={t('paywall.error.description')}
        />
      )
    }

    return (
      <section>
        <h2 className="mb-3 text-[11px] font-bold uppercase tracking-[0.1em] text-purple-light">
          {t('paywall.plansTitle')}
        </h2>
        <div className="grid gap-3">
          {plans.map((plan) => (
            <PlanCard
              key={plan.key}
              plan={plan}
              disabled={Boolean(processingPlan) || restoring}
              processing={processingPlan === plan.key}
              onPurchase={handlePurchase}
            />
          ))}
        </div>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="mt-3"
          disabled={Boolean(processingPlan) || restoring}
          leftIcon={restoring ? <RefreshCw size={15} className="animate-spin" /> : <RefreshCw size={15} />}
          onClick={() => void handleRestore()}
        >
          {restoring ? t('paywall.restore.loading') : t('paywall.restore.cta')}
        </Button>
      </section>
    )
  }

  return (
    <div className="min-h-screen bg-bg-base pb-12 text-text-primary">
      <header className="sticky top-0 z-20 flex items-center gap-3 border-b border-white/5 bg-bg-base/95 px-4 pb-3 pt-10 backdrop-blur">
        <button
          onClick={onBack}
          className="-ml-1 rounded-md p-2 text-text-secondary transition-transform active:scale-90"
          aria-label={t('common.back')}
        >
          <ArrowLeft size={20} />
        </button>
        <div className="min-w-0">
          <h1 className="text-lg font-extrabold tracking-[-0.02em] text-text-primary">NeoReader Pro</h1>
          <p className="text-xs text-text-muted">{t('paywall.subtitle')}</p>
        </div>
      </header>

      <div className="flex flex-col gap-7 px-4 pt-6">
        <section className="rounded-md border border-purple-primary/30 bg-purple-primary/10 p-4">
          <div className="flex items-start gap-3">
            <div className="rounded-full bg-purple-primary/20 p-2 text-purple-light">
              <Sparkles size={18} />
            </div>
            <div className="flex-1">
              <h2 className="text-sm font-semibold text-text-primary">{t('paywall.hero.title')}</h2>
              <p className="mt-1 text-xs leading-relaxed text-text-muted">
                {t('paywall.hero.description')}
              </p>
            </div>
          </div>
        </section>

        <section>
          <h2 className="mb-3 text-[11px] font-bold uppercase tracking-[0.1em] text-purple-light">
            {t('paywall.benefitsTitle')}
          </h2>
          <div className="overflow-hidden rounded-md border border-border bg-bg-surface">
            {BENEFITS.map((benefit, index) => (
              <div
                key={benefit.titleKey}
                className={cn(
                  'flex items-start gap-3 px-4 py-4',
                  index !== BENEFITS.length - 1 && 'border-b border-white/5',
                )}
              >
                <div className="mt-0.5">{benefit.icon}</div>
                <div className="flex-1">
                  <div className="flex items-center justify-between gap-3">
                    <h3 className="text-sm font-semibold text-text-primary">{t(benefit.titleKey)}</h3>
                    <span
                      className={cn(
                        'text-[10px] font-bold uppercase tracking-wider',
                        benefit.available ? 'text-success' : 'text-text-muted',
                      )}
                    >
                      {benefit.available ? t('paywall.available') : t('paywall.soon')}
                    </span>
                  </div>
                  <p className="mt-1 text-xs leading-relaxed text-text-muted">{t(benefit.descriptionKey)}</p>
                </div>
              </div>
            ))}
          </div>
        </section>

        {renderPlans()}

        {message && (
          <section
            className={cn(
              'rounded-md border p-4 text-sm font-medium',
              message.tone === 'success'
                ? 'border-success/30 bg-success/10 text-success'
                : 'border-error/30 bg-error/10 text-error',
            )}
          >
            {message.text}
          </section>
        )}

        <p className="px-2 text-center text-[10px] leading-relaxed text-text-muted">
          {t('paywall.privacyPrefix')}{' '}
          <a
            href="https://johnosd.github.io/neoreader-legal/"
            target="_blank"
            rel="noopener noreferrer"
            className="text-purple-light underline"
          >
            {t('paywall.privacyLink')}
          </a>
          {t('paywall.privacySuffix')}
        </p>
      </div>
    </div>
  )
}

function PlanCard({
  plan,
  disabled,
  processing,
  onPurchase,
}: {
  plan: PlanOption
  disabled: boolean
  processing: boolean
  onPurchase: (plan: PlanOption) => void
}) {
  const { t } = useI18n()
  const perMonth = plan.key === 'annual' ? plan.pkg.product.pricePerMonthString : null

  return (
    <div className="rounded-md border border-border bg-bg-surface p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-sm font-semibold text-text-primary">{t(plan.titleKey)}</h3>
            {plan.badgeKey && <Badge tone="purple">{t(plan.badgeKey)}</Badge>}
          </div>
          <p className="mt-1 text-xs leading-relaxed text-text-muted">{t(plan.descriptionKey)}</p>
          {perMonth && (
            <p className="mt-1 text-[11px] font-semibold text-purple-light">
              {t('paywall.plan.annual.perMonth', { price: perMonth })}
            </p>
          )}
        </div>
        <div className="shrink-0 text-right">
          <p className="text-base font-extrabold text-text-primary">{plan.pkg.product.priceString}</p>
        </div>
      </div>

      <Button
        type="button"
        className="mt-4"
        disabled={disabled}
        leftIcon={processing ? <RefreshCw size={16} className="animate-spin" /> : <CreditCard size={16} />}
        onClick={() => void onPurchase(plan)}
      >
        {processing ? t('paywall.purchase.loading') : t(plan.ctaKey)}
      </Button>
    </div>
  )
}

function PaywallNotice({
  title,
  description,
}: {
  title: string
  description: string
}) {
  return (
    <section className="rounded-md border border-border bg-bg-surface p-4">
      <div className="flex items-start gap-3">
        <CheckCircle2 size={18} className="mt-0.5 text-purple-light" />
        <div className="flex-1">
          <h2 className="text-sm font-semibold text-text-primary">{title}</h2>
          <p className="mt-1 text-xs leading-relaxed text-text-muted">{description}</p>
        </div>
      </div>
    </section>
  )
}
