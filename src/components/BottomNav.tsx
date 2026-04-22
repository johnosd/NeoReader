import { Home, Star, BookOpen, User } from 'lucide-react'

type Tab = 'home' | 'books' | 'biblioteca' | 'profile'

interface BottomNavProps {
  activeTab?: Tab
  onTabChange?: (tab: Tab) => void
}

const NAV_ITEMS: { id: Tab; label: string; Icon: typeof Home }[] = [
  { id: 'home',       label: 'Início',     Icon: Home     },
  { id: 'books',      label: 'Vocab',      Icon: Star     },
  { id: 'biblioteca', label: 'Biblioteca', Icon: BookOpen },
  { id: 'profile',    label: 'Perfil',     Icon: User     },
]

export function BottomNav({ activeTab = 'home', onTabChange }: BottomNavProps) {
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
      {NAV_ITEMS.map(({ id, label, Icon }) => {
        const isActive = activeTab === id
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
