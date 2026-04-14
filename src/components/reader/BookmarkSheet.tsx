import { X } from 'lucide-react'
import type { Bookmark } from '../../types/book'

interface BookmarkSheetProps {
  open: boolean
  bookmarks: Bookmark[]
  onSelect: (cfi: string) => void
  onDelete: (id: number) => void
  onClose: () => void
}

export function BookmarkSheet({ open, bookmarks, onSelect, onDelete, onClose }: BookmarkSheetProps) {
  const translateY = open ? 'translate-y-0' : 'translate-y-full'

  return (
    <>
      {open && (
        <div className="fixed inset-0 bg-black/60 z-[29]" onClick={onClose} />
      )}

      <div
        className={`absolute inset-x-0 bottom-0 z-30 max-h-[60vh] bg-[#1a1a1a] rounded-t-2xl
          transition-transform duration-300 ${translateY} flex flex-col`}
      >
        {/* Handle visual */}
        <div className="flex justify-center pt-3 pb-2 shrink-0">
          <div className="w-10 h-1 rounded-full bg-[#2a2a2a]" />
        </div>

        <h2 className="text-white font-semibold px-5 pb-3 shrink-0">Marcadores</h2>

        <div className="overflow-y-auto flex-1 pb-8">
          {bookmarks.length === 0 ? (
            <p className="text-[#a0a0a0] text-sm px-5 py-4 leading-relaxed">
              Nenhum marcador ainda.{'\n'}Toque em 🔖 durante a leitura para adicionar.
            </p>
          ) : (
            bookmarks.map((bookmark) => (
              <div
                key={bookmark.id}
                className="flex items-center gap-3 px-5 py-3 active:bg-[#2a2a2a]"
              >
                {/* Área clicável para navegar */}
                <button
                  className="flex-1 text-left min-w-0"
                  onClick={() => onSelect(bookmark.cfi)}
                >
                  <p className="text-white text-sm truncate">{bookmark.label}</p>
                  <p className="text-[#a0a0a0] text-xs mt-0.5">{bookmark.percentage}%</p>
                </button>

                {/* Botão de remoção */}
                <button
                  onClick={() => bookmark.id !== undefined && onDelete(bookmark.id)}
                  className="p-2 text-[#a0a0a0] active:text-red-400 shrink-0"
                  aria-label="Remover marcador"
                >
                  <X size={16} />
                </button>
              </div>
            ))
          )}
        </div>
      </div>
    </>
  )
}
