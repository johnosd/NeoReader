import { useState } from 'react'
import {
  ArrowLeft,
  BookOpen,
  Check,
  Heart,
  Lock,
  LogOut,
  Pencil,
  Settings,
  Star,
  Trophy,
  User,
} from 'lucide-react'
import { BottomNav } from '../components/BottomNav'
import { EmptyState, Spinner } from '../components/ui'
import { useBookCoverUrl } from '../hooks/useBookCoverUrl'
import { useCapacitorBackButton } from '../hooks/useCapacitorAppListener'
import { useLibraryGroups } from '../hooks/useLibraryGroups'
import { useProfileSummary, type ProfileAchievement, type ProfileHistoryItem } from '../hooks/useProfileSummary'
import type { AuthUser } from '../types/auth'
import { useI18n, type MessageKey } from '../i18n'

interface ProfileScreenProps {
  authUser: AuthUser
  onBack: () => void
  onOpenHome?: () => void
  onOpenLibrary: () => void
  onOpenDiscover: () => void
  onOpenSettings: () => void
  onSignOut: () => Promise<void>
}

type ProfileTab = 'history' | 'achievements' | 'following'

const PROFILE_TABS: { id: ProfileTab; labelKey: MessageKey }[] = [
  { id: 'history', labelKey: 'profile.tab.history' },
  { id: 'achievements', labelKey: 'profile.tab.achievements' },
  { id: 'following', labelKey: 'profile.tab.following' },
]

export function ProfileScreen({ authUser, onBack, onOpenHome, onOpenLibrary, onOpenDiscover, onOpenSettings, onSignOut }: ProfileScreenProps) {
  const { t } = useI18n()
  const summary = useProfileSummary()
  const { heroBook } = useLibraryGroups()
  const [activeTab, setActiveTab] = useState<ProfileTab>('history')
  const [signingOut, setSigningOut] = useState(false)

  useCapacitorBackButton(onBack)

  async function handleSignOut() {
    if (signingOut) return

    setSigningOut(true)
    try {
      await onSignOut()
    } finally {
      setSigningOut(false)
    }
  }

  return (
    <div className="min-h-screen pb-[90px] bg-bg-base text-text-primary">
      <header className="relative z-0 h-[200px] overflow-hidden">
        <ProfileHeroBackground bookId={heroBook?.id} />

        <div className="absolute top-10 left-4 right-4 z-10 flex items-center justify-between">
          <button
            onClick={onBack}
            className="w-9 h-9 rounded-md bg-black/35 border border-white/10 backdrop-blur-sm flex items-center justify-center text-white active:scale-95 transition-transform"
            aria-label={t('common.back')}
          >
            <ArrowLeft size={19} />
          </button>
          <button
            onClick={onOpenSettings}
            className="w-9 h-9 rounded-md bg-black/35 border border-white/10 backdrop-blur-sm flex items-center justify-center text-white active:scale-95 transition-transform"
            aria-label={t('profile.openSettings')}
          >
            <Settings size={18} />
          </button>
        </div>
      </header>

      <main className="relative z-10">
        <section className="relative px-5">
          <div className="relative z-20 -mt-11 mb-3 flex items-end justify-between">
            <Avatar authUser={authUser} />
            <button
              type="button"
              disabled
              className="h-9 px-4 rounded-md border text-[13px] font-semibold opacity-50"
              style={{
                color: '#c084fc',
                borderColor: 'rgba(157,78,221,0.28)',
                background: 'rgba(157,78,221,0.10)',
              }}
            >
              <Pencil size={14} className="inline mr-2" />
              {t('profile.editProfile')}
            </button>
          </div>

          <div className="mb-4">
            <h1 className="text-xl font-extrabold tracking-tight text-text-primary truncate">
              {authUser.displayName ?? t('profile.defaultName')}
            </h1>
            <p className="mt-1 text-[13px] text-text-muted truncate">
              {authUser.email ?? t('profile.defaultEmail')}
            </p>
          </div>

          {summary.isLoading ? (
            <div className="py-6 flex justify-center">
              <Spinner tone="purple" />
            </div>
          ) : (
            <StatsGrid
              finished={summary.stats.finished}
              reading={summary.stats.reading}
              favorites={summary.stats.favorites}
              vocabulary={summary.stats.vocabulary}
            />
          )}
        </section>

        <div className="mt-4 flex border-b border-white/10 px-5">
          {PROFILE_TABS.map((tab) => {
            const active = activeTab === tab.id
            const label = t(tab.labelKey)
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTab(tab.id)}
                className="flex-1 py-3 text-[12px] font-semibold border-b-2 transition-colors"
                style={{
                  color: active ? '#c084fc' : 'rgba(148,163,184,0.8)',
                  borderColor: active ? '#c084fc' : 'transparent',
                }}
              >
                {label}
              </button>
            )
          })}
        </div>

        {summary.isLoading ? null : (
          <>
            {activeTab === 'history' && <HistoryTab items={summary.history} />}
            {activeTab === 'achievements' && <AchievementsTab achievements={summary.achievements} />}
            {activeTab === 'following' && <FollowingTab />}
          </>
        )}

        <section className="px-5 mt-5">
          <button
            type="button"
            onClick={() => void handleSignOut()}
            disabled={signingOut}
            className="h-11 w-full rounded-md border border-error/30 bg-error/10 text-error text-sm font-semibold flex items-center justify-center gap-2 active:bg-error/20 disabled:opacity-50 disabled:pointer-events-none"
          >
            <LogOut size={16} />
            {signingOut ? t('profile.signingOut') : t('profile.signOut')}
          </button>
        </section>
      </main>

      <BottomNav
        activeTab="profile"
        onTabChange={(tab) => {
          if (tab === 'home') (onOpenHome ?? onOpenLibrary)()
          if (tab === 'biblioteca') onOpenLibrary()
          if (tab === 'discover') onOpenDiscover()
        }}
      />
    </div>
  )
}

function Avatar({ authUser }: { authUser: AuthUser }) {
  if (authUser.photoURL) {
    return (
      <img
        src={authUser.photoURL}
        alt=""
        className="relative z-20 w-[88px] h-[88px] rounded-full object-cover border-[3px] border-bg-base shadow-[0_4px_20px_rgba(0,0,0,0.5)]"
        referrerPolicy="no-referrer"
      />
    )
  }

  return (
    <div className="relative z-20 w-[88px] h-[88px] rounded-full border-[3px] border-bg-base flex items-center justify-center shadow-[0_4px_20px_rgba(0,0,0,0.5)]"
      style={{ background: 'linear-gradient(135deg, #7b2cbf, #240046)' }}
    >
      <User size={34} className="text-white/85" />
    </div>
  )
}

function ProfileHeroBackground({ bookId }: { bookId: number | undefined }) {
  const coverUrl = useBookCoverUrl(bookId)

  if (coverUrl) {
    return (
      <>
        <img
          src={coverUrl}
          alt=""
          aria-hidden
          className="absolute inset-0 h-full w-full scale-110 object-cover opacity-[0.18] blur-2xl grayscale"
        />
        <img
          src={coverUrl}
          alt=""
          aria-hidden
          className="absolute inset-0 h-full w-full object-cover object-top opacity-[0.78]"
        />
        <div
          className="absolute inset-0"
          style={{
            background:
              'linear-gradient(180deg, rgba(0,0,0,0.18) 0%, rgba(0,0,0,0.42) 54%, rgba(0,0,0,0.78) 100%)',
          }}
        />
        <div
          className="absolute inset-0"
          style={{ background: 'linear-gradient(90deg, rgba(0,0,0,0.28) 0%, rgba(0,0,0,0.04) 42%, rgba(0,0,0,0.22) 100%)' }}
        />
      </>
    )
  }

  return (
    <>
      <div className="absolute inset-0" style={{ background: 'linear-gradient(135deg, #240046 0%, #0d0614 50%, #1a3a5c 100%)' }} />
      <div className="absolute inset-0" style={{ background: 'radial-gradient(ellipse at 30% 50%, rgba(123,44,191,0.45) 0%, transparent 65%)' }} />
      <BookPattern />
    </>
  )
}

function StatsGrid({
  finished,
  reading,
  favorites,
  vocabulary,
}: {
  finished: number
  reading: number
  favorites: number
  vocabulary: number
}) {
  const { t } = useI18n()
  const stats = [
    { value: finished, label: t('profile.stats.finished') },
    { value: reading, label: t('profile.stats.reading') },
    { value: favorites, label: t('profile.stats.favorites') },
    { value: vocabulary, label: t('profile.stats.vocabulary') },
  ]

  return (
    <div className="grid grid-cols-4 overflow-hidden rounded-lg bg-bg-surface border border-white/10">
      {stats.map((stat, index) => (
        <div
          key={stat.label}
          className="py-3 text-center"
          style={{ borderRight: index < stats.length - 1 ? '1px solid rgba(255,255,255,0.06)' : undefined }}
        >
          <div className="text-[17px] font-extrabold leading-none text-success/80">{stat.value}</div>
          <div className="mt-1 text-[10px] text-text-muted">{stat.label}</div>
        </div>
      ))}
    </div>
  )
}

function HistoryTab({ items }: { items: ProfileHistoryItem[] }) {
  const { t } = useI18n()

  if (items.length === 0) {
    return (
      <EmptyState
        icon={<BookOpen size={44} />}
        title={t('profile.history.empty.title')}
        description={t('profile.history.empty.description')}
      />
    )
  }

  return (
    <div className="pt-2">
      {items.map((item) => (
        <HistoryRow key={item.book.id} item={item} />
      ))}
    </div>
  )
}

function HistoryRow({ item }: { item: ProfileHistoryItem }) {
  const { locale, t } = useI18n()
  const coverUrl = useBookCoverUrl(item.book.id)
  const status = item.readingStatus === 'finished'
    ? t('profile.status.finished')
    : item.readingStatus === 'reading'
      ? `${item.percentage}%`
      : t('profile.status.notStarted')

  return (
    <div className="flex gap-3 px-5 py-3 border-b border-white/[0.04]">
      <div className="w-11 h-[60px] rounded-md overflow-hidden flex-shrink-0 bg-bg-surface-2 border border-white/10 flex items-center justify-center">
        {coverUrl ? (
          <img src={coverUrl} alt="" className="w-full h-full object-cover" />
        ) : (
          <BookOpen size={17} className="text-white/30" />
        )}
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-[13px] font-semibold text-text-primary truncate">{item.book.title}</p>
        <p className="mt-[2px] text-[11px] text-text-muted truncate">{item.book.author}</p>
        <div className="mt-2 flex items-center gap-2 text-[10px] text-text-muted">
          <span>{status}</span>
          {item.pageCount && (
            <>
              <span className="text-white/20">-</span>
              <span>{t('profile.status.pages', { count: item.pageCount })}</span>
            </>
          )}
          {item.rating && (
            <>
              <span className="text-white/20">-</span>
              <span className="inline-flex items-center gap-1">
                <Star size={10} fill="#fbbf24" stroke="#fbbf24" />
                {item.rating.toFixed(1)}
              </span>
            </>
          )}
        </div>
      </div>
      <time className="text-[10px] text-text-muted flex-shrink-0 pt-[2px]" dateTime={item.date.toISOString()}>
        {formatShortDate(item.date, locale)}
      </time>
    </div>
  )
}

function AchievementsTab({ achievements }: { achievements: ProfileAchievement[] }) {
  const { t } = useI18n()
  const unlockedCount = achievements.filter((achievement) => achievement.unlocked).length

  return (
    <div className="px-5 py-4">
      <div className="mb-4 flex items-center justify-between">
        <p className="text-[12px] text-text-muted">
          {t('profile.achievements.progress', { unlocked: unlockedCount, total: achievements.length })}
        </p>
        <div className="w-20 h-1.5 rounded-full bg-white/10 overflow-hidden">
          <div
            className="h-full rounded-full bg-purple-light"
            style={{ width: `${(unlockedCount / achievements.length) * 100}%` }}
          />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        {achievements.map((achievement) => (
          <div
            key={achievement.id}
            className="rounded-lg p-3 border"
            style={{
              background: achievement.unlocked ? '#12091a' : 'rgba(255,255,255,0.02)',
              borderColor: achievement.unlocked ? 'rgba(157,78,221,0.28)' : 'rgba(255,255,255,0.06)',
            }}
          >
            <div
              className="w-11 h-11 rounded-md flex items-center justify-center mb-3 border"
              style={{
                background: achievement.unlocked ? 'rgba(157,78,221,0.14)' : 'rgba(255,255,255,0.04)',
                borderColor: achievement.unlocked ? 'rgba(157,78,221,0.26)' : 'rgba(255,255,255,0.08)',
                color: achievement.unlocked ? '#c084fc' : 'rgba(148,163,184,0.55)',
              }}
            >
              {achievement.unlocked ? <Trophy size={21} /> : <Lock size={19} />}
            </div>
            <p className="text-[12px] font-bold text-text-primary leading-snug">{achievement.title}</p>
            <p className="mt-1 text-[10px] text-text-muted leading-relaxed">{achievement.description}</p>
            {achievement.unlocked && (
              <p className="mt-3 inline-flex items-center gap-1 text-[9px] font-extrabold uppercase tracking-wider text-success">
                <Check size={10} />
                {t('profile.achievements.unlocked')}
              </p>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}

function FollowingTab() {
  const { t } = useI18n()

  return (
    <EmptyState
      icon={<Heart size={44} />}
      title={t('profile.following.empty.title')}
      description={t('profile.following.empty.description')}
    />
  )
}

function BookPattern() {
  const rows = Array.from({ length: 8 })
  const columns = Array.from({ length: 12 })

  return (
    <svg
      className="absolute inset-0 w-full h-full opacity-[0.07]"
      viewBox="0 0 375 200"
      preserveAspectRatio="xMidYMid slice"
      aria-hidden="true"
    >
      {rows.map((_, row) => columns.map((__, column) => (
        <rect
          key={`${row}-${column}`}
          x={column * 34 - 4}
          y={row * 28 - 4}
          width="20"
          height="28"
          rx="3"
          fill="white"
          transform={`rotate(12,${column * 34 + 6},${row * 28 + 10})`}
        />
      )))}
    </svg>
  )
}

function formatShortDate(date: Date, locale: string): string {
  return new Intl.DateTimeFormat(locale, {
    month: 'short',
    year: 'numeric',
  }).format(date).replace('.', '')
}
