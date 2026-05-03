import { useEffect } from 'react'
import { App as CapApp } from '@capacitor/app'
import { Compass } from 'lucide-react'
import { BottomNav } from '../components/BottomNav'
import { NytBooksRow } from '../components/NytBooksRow'
import { EmptyState } from '../components/ui'

const NYT_API_KEY = import.meta.env.VITE_NYT_API_KEY as string | undefined

interface DiscoverScreenProps {
  onBack: () => void
  onOpenSettings: () => void
}

export function DiscoverScreen({ onBack, onOpenSettings }: DiscoverScreenProps) {
  useEffect(() => {
    const listenerPromise = CapApp.addListener('backButton', onBack)
    return () => { void listenerPromise.then((l) => l.remove()) }
  }, [onBack])

  return (
    <div className="min-h-screen pb-[90px] bg-bg-base text-text-primary">
      <header className="px-5 pt-10 pb-4">
        <div className="flex items-center gap-3">
          <div
            className="w-11 h-11 rounded-md flex items-center justify-center border border-white/10"
            style={{ background: 'rgba(123,44,191,0.16)', color: '#c084fc' }}
          >
            <Compass size={22} />
          </div>
          <div>
            <h1 className="text-2xl font-serif font-bold text-purple-light">Descubra</h1>
            <p className="text-sm text-text-secondary mt-1">Livros em destaque agora.</p>
          </div>
        </div>
      </header>

      <main>
        {NYT_API_KEY ? (
          <>
            <div className="mt-2 mb-1 border-t border-white/5" />
            <div className="px-5 mt-5">
              <p className="text-[16px] font-semibold text-text-primary">Tendencias no Mundo</p>
              <p className="text-[11px] mt-[2px]" style={{ color: 'rgba(100,116,139,0.8)' }}>
                O que o mundo esta lendo agora - NYT Best Sellers
              </p>
            </div>

            <NytBooksRow listName="advice-how-to-and-miscellaneous" />
            <NytBooksRow listName="hardcover-fiction" />
            <NytBooksRow listName="business-books" />

            <div className="h-4" />
          </>
        ) : (
          <EmptyState
            icon={<Compass size={48} />}
            title="Descobertas indisponiveis"
            description="Configure VITE_NYT_API_KEY para carregar as listas do NYT Best Sellers."
          />
        )}
      </main>

      <BottomNav
        activeTab="discover"
        onTabChange={(tab) => {
          if (tab === 'home' || tab === 'biblioteca') onBack()
          if (tab === 'profile') onOpenSettings()
        }}
      />
    </div>
  )
}
