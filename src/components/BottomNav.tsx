import { useRef, useState } from 'react'
import { Home, Star, BarChart2, User, Plus } from 'lucide-react'
import { Toast } from './ui'
import { EpubService } from '../services/EpubService'
import { addBook } from '../db/books'

type Tab = 'home' | 'books' | 'progress' | 'profile'

interface BottomNavProps {
  activeTab?: Tab
  onTabChange?: (tab: Tab) => void
}

type NavItem = { id: Tab; label: string; Icon: typeof Home }

export function BottomNav({ activeTab = 'home', onTabChange }: BottomNavProps) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [importing, setImporting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setImporting(true)
    setError(null)
    try {
      const metadata = await EpubService.parseMetadata(file)
      await addBook({
        title: metadata.title,
        author: metadata.author,
        coverBlob: metadata.coverBlob,
        fileBlob: file,
        addedAt: new Date(),
        lastOpenedAt: null,
      })
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Erro ao importar o arquivo'
      setError(message)
    } finally {
      setImporting(false)
      if (inputRef.current) inputRef.current.value = ''
    }
  }

  // null marca o slot do FAB central
  const items: Array<NavItem | null> = [
    { id: 'home', label: 'Home', Icon: Home },
    { id: 'books', label: 'Vocab', Icon: Star },
    null,
    { id: 'progress', label: 'Progresso', Icon: BarChart2 },
    { id: 'profile', label: 'Perfil', Icon: User },
  ]

  return (
    <>
      <input ref={inputRef} type="file" accept=".epub" className="hidden" onChange={handleFileChange} />

      {error && <Toast tone="error" onDismiss={() => setError(null)}>{error}</Toast>}

      <nav
        className="fixed bottom-0 left-0 right-0 h-[70px] z-40 flex justify-around items-center
          border-t border-border bg-bg-surface/95 backdrop-blur-md"
        style={{ paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}
      >
        {items.map((item) => {
          if (item === null) {
            return (
              <button
                key="fab"
                onClick={() => inputRef.current?.click()}
                disabled={importing}
                aria-label="Adicionar livro"
                className="-mt-7 w-[52px] h-[52px] rounded-full flex items-center justify-center
                  border-2 border-bg-base shadow-purple-glow active:scale-95 transition-transform duration-150
                  disabled:opacity-60"
                // Gradiente inline — Tailwind v4 não gera gradients de tokens automaticamente.
                style={{
                  background: 'linear-gradient(135deg, var(--color-purple-primary) 0%, var(--color-purple-dark) 100%)',
                }}
              >
                {importing ? (
                  <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                ) : (
                  <Plus size={26} className="text-white" />
                )}
              </button>
            )
          }

          const { id, label, Icon } = item
          const isActive = activeTab === id
          return (
            <button
              key={id}
              onClick={() => onTabChange?.(id)}
              className={`flex flex-col items-center gap-1 py-1 px-3 transition-all duration-150 active:scale-90 ${
                isActive ? 'text-purple-light' : 'text-text-secondary'
              }`}
              aria-label={label}
            >
              <Icon size={22} />
              <span className="text-[10px] font-semibold">{label}</span>
            </button>
          )
        })}
      </nav>
    </>
  )
}
