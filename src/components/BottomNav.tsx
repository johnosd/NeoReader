import { useRef, useState } from 'react'
import { Home, BookOpen, BarChart2, User, Plus } from 'lucide-react'
import { EpubService } from '../services/EpubService'
import { addBook } from '../db/books'

type Tab = 'home' | 'books' | 'progress' | 'profile'

interface BottomNavProps {
  activeTab?: Tab
  onTabChange?: (tab: Tab) => void
}

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
      // Limpa o erro após 3 segundos
      setTimeout(() => setError(null), 3000)
    } finally {
      setImporting(false)
      if (inputRef.current) inputRef.current.value = ''
    }
  }

  const items = [
    { id: 'home' as Tab, label: 'Home', Icon: Home },
    { id: 'books' as Tab, label: 'Livros', Icon: BookOpen },
    null, // espaço para o FAB central
    { id: 'progress' as Tab, label: 'Progresso', Icon: BarChart2 },
    { id: 'profile' as Tab, label: 'Perfil', Icon: User },
  ]

  return (
    <>
      {/* Input oculto para seleção de EPUB */}
      <input
        ref={inputRef}
        type="file"
        accept=".epub"
        className="hidden"
        onChange={handleFileChange}
      />

      {/* Toast de erro */}
      {error && (
        <div className="fixed bottom-24 left-4 right-4 z-50 bg-red-900/90 text-white text-sm px-4 py-3 rounded-lg text-center">
          {error}
        </div>
      )}

      {/* Barra de navegação */}
      <nav
        className="fixed bottom-0 left-0 right-0 h-[70px] z-40 flex justify-around items-center
          border-t border-white/5"
        style={{ background: 'rgba(15, 12, 24, 0.97)', backdropFilter: 'blur(10px)' }}
      >
        {items.map((item) => {
          // Slot central = FAB
          if (item === null) {
            return (
              <button
                key="fab"
                onClick={() => inputRef.current?.click()}
                disabled={importing}
                aria-label="Adicionar livro"
                className="-mt-7 w-[52px] h-[52px] rounded-full flex items-center justify-center
                  border-2 border-[#0f0c18] shadow-lg active:scale-95 transition-transform duration-150
                  disabled:opacity-60"
                style={{
                  background: 'linear-gradient(135deg, #7b2cbf 0%, #3c096c 100%)',
                  boxShadow: '0 4px 15px rgba(157, 78, 221, 0.6)',
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
              className="flex flex-col items-center gap-1 py-1 px-3 transition-colors duration-150"
              style={{ color: isActive ? '#c77dff' : '#a5a5a5' }}
              aria-label={label}
            >
              <Icon size={22} />
              <span className="text-[10px]">{label}</span>
            </button>
          )
        })}
      </nav>
    </>
  )
}
