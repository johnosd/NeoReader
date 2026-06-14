import { BookOpen, Compass, Home, User } from 'lucide-react'
import { useI18n, type MessageKey } from '../i18n'

type Tab = 'home' | 'discover' | 'biblioteca' | 'profile'

interface BottomNavProps {
  activeTab?: Tab
  onTabChange?: (tab: Tab) => void
}

const NAV_ITEMS: { id: Tab; labelKey: MessageKey; Icon: typeof Home }[] = [
  { id: 'home',       labelKey: 'nav.home',     Icon: Home     },
  { id: 'discover',   labelKey: 'nav.discover', Icon: Compass  },
  { id: 'biblioteca', labelKey: 'nav.library',  Icon: BookOpen },
  { id: 'profile',    labelKey: 'nav.profile',  Icon: User     },
]

export function BottomNav({ activeTab = 'home', onTabChange }: BottomNavProps) {
  const { t } = useI18n()

  return (
    <nav
      className="fixed bottom-0 left-0 right-0 z-40 flex items-center justify-around"
      style={{
        height: 'calc(64px + env(safe-area-inset-bottom, 0px))',
        paddingBottom: 'env(safe-area-inset-bottom, 0px)',
        background: 'rgba(15,7,24,0.95)',
        backdropFilter: 'blur(20px)',
        WebkitBackdropFilter: 'blur(20px)',
        borderTop: '1px solid rgba(255,255,255,0.08)',
      }}
    >
      {NAV_ITEMS.map(({ id, labelKey, Icon }) => {
        const isActive = activeTab === id
        const label = t(labelKey)
        return (
          <button
            key={id}
            onClick={() => onTabChange?.(id)}
            aria-label={label}
            className="flex flex-col items-center justify-center gap-[4px] flex-1 py-2 active:opacity-60 transition-opacity duration-150"
          >
            <Icon
              size={22}
              strokeWidth={isActive ? 2.2 : 1.8}
              style={{ color: isActive ? '#7b2cbf' : 'rgba(148,163,184,0.7)' }}
            />
            <span
              className="text-[10px] font-semibold"
              style={{ color: isActive ? '#7b2cbf' : 'rgba(148,163,184,0.7)' }}
            >
              {label}
            </span>
          </button>
        )
      })}
    </nav>
  )
}
