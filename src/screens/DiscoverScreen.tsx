import { Compass } from 'lucide-react'
import { BottomNav } from '../components/BottomNav'
import { NytBooksRow } from '../components/NytBooksRow'
import { EmptyState } from '../components/ui'
import { useCapacitorBackButton } from '../hooks/useCapacitorAppListener'

const TRENDING_LISTS = [
  'advice-how-to-and-miscellaneous',
  'hardcover-fiction',
  'business-books',
]
const CHILDREN_LISTS = [
  'childrens-middle-grade-hardcover',
  'series-books',
  'graphic-books-and-manga',
]

interface DiscoverScreenProps {
  onBack: () => void
  onOpenHome?: () => void
  onOpenLibrary: () => void
  onOpenProfile: () => void
}

export function DiscoverScreen({ onBack, onOpenHome, onOpenLibrary, onOpenProfile }: DiscoverScreenProps) {
  useCapacitorBackButton(onBack)
  const hasNytApiKey = Boolean(import.meta.env.VITE_NYT_API_KEY)

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
        {hasNytApiKey ? (
          <>
            <div className="mt-2 mb-1 border-t border-white/5" />
            <div className="px-5 mt-5">
              <p className="text-[16px] font-semibold text-text-primary">Tendencias no Mundo</p>
              <p className="text-[11px] mt-[2px]" style={{ color: 'rgba(100,116,139,0.8)' }}>
                O que o mundo esta lendo agora - NYT Best Sellers
              </p>
            </div>

            {TRENDING_LISTS.map((listName) => (
              <NytBooksRow key={listName} listName={listName} />
            ))}

            <div className="px-5 mt-8">
              <p className="text-[16px] font-semibold text-text-primary">O que as crianças estão lendo agora</p>
              <p className="text-[11px] mt-[2px]" style={{ color: 'rgba(100,116,139,0.8)' }}>
                Best Sellers infantis e juvenis em destaque no NYT
              </p>
            </div>

            {CHILDREN_LISTS.map((listName) => (
              <NytBooksRow key={listName} listName={listName} />
            ))}

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
          if (tab === 'home') (onOpenHome ?? onOpenLibrary)()
          if (tab === 'biblioteca') onOpenLibrary()
          if (tab === 'profile') onOpenProfile()
        }}
      />
    </div>
  )
}
