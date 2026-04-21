import { X } from 'lucide-react'
import { BottomSheet, EmptyState, ListItem } from '../ui'
import type { Bookmark } from '../../types/book'

interface BookmarkSheetProps {
  open: boolean
  bookmarks: Bookmark[]
  onSelect: (cfi: string) => void
  onDelete: (id: number) => void
  onClose: () => void
}

export function BookmarkSheet({ open, bookmarks, onSelect, onDelete, onClose }: BookmarkSheetProps) {
  return (
    <BottomSheet open={open} onClose={onClose} title="Marcadores">
      {bookmarks.length === 0 ? (
        <EmptyState
          title="Nenhum marcador ainda"
          description="Toque no ícone de marcador durante a leitura para adicionar."
        />
      ) : (
        // -mx-4 compensa o padding interno do BottomSheet para alinhar ListItems às bordas
        <div className="-mx-4">
          {bookmarks.map((bookmark) => (
            <ListItem
              key={bookmark.id}
              title={bookmark.label}
              meta={`${bookmark.percentage}%`}
              onClick={() => onSelect(bookmark.cfi)}
              trailing={
                <button
                  // stopPropagation: impede que o clique no X também dispare o onClick da linha
                  onClick={(e) => {
                    e.stopPropagation()
                    if (bookmark.id !== undefined) onDelete(bookmark.id)
                  }}
                  className="p-2 -m-2 text-text-muted active:text-error transition-colors"
                  aria-label="Remover marcador"
                >
                  <X size={16} />
                </button>
              }
            />
          ))}
        </div>
      )}
    </BottomSheet>
  )
}
