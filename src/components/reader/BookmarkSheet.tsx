import { X } from 'lucide-react'
import { BottomSheet, EmptyState } from '../ui'
import type { Bookmark } from '../../types/book'

interface BookmarkSheetProps {
  open: boolean
  bookmarks: Bookmark[]
  onSelect: (cfi: string) => void
  onDelete: (id: number) => void | Promise<void>
  onColorChange: (id: number, color: string) => void | Promise<void>
  onClose: () => void
}

const COLORS = [
  { key: 'indigo',  hex: '#6366f1', label: 'Índigo'  },
  { key: 'emerald', hex: '#22c55e', label: 'Verde'   },
  { key: 'amber',   hex: '#f59e0b', label: 'Âmbar'   },
  { key: 'rose',    hex: '#f43f5e', label: 'Rosa'     },
]

function colorHex(color: string | undefined): string {
  return COLORS.find(c => c.key === color)?.hex ?? '#6366f1'
}

function formatDate(date: Date | string): string {
  return new Intl.DateTimeFormat('pt-BR', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  }).format(new Date(date))
}

export function BookmarkSheet({ open, bookmarks, onSelect, onDelete, onColorChange, onClose }: BookmarkSheetProps) {
  // Mais recentes primeiro
  const sorted = [...bookmarks].sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
  )

  return (
    <BottomSheet open={open} onClose={onClose} title="Marcadores">
      {sorted.length === 0 ? (
        <EmptyState
          title="Nenhum marcador ainda"
          description="Toque no ícone de marcador durante a leitura para adicionar."
        />
      ) : (
        <div className="-mx-4">
          {sorted.map((bookmark) => (
            <div
              key={bookmark.id}
              className="flex items-stretch px-4 py-3 border-b border-bg-elevated active:bg-bg-elevated/50 cursor-pointer"
              onClick={() => onSelect(bookmark.cfi)}
            >
              {/* Indicador de cor */}
              <div
                className="w-1 rounded-full mr-3 flex-shrink-0"
                style={{ backgroundColor: colorHex(bookmark.color) }}
              />

              {/* Conteúdo */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between gap-2 mb-0.5">
                  <p className="text-sm font-medium text-text-primary truncate">
                    {bookmark.label}
                  </p>
                  <span className="text-xs text-indigo-primary font-semibold tabular-nums flex-shrink-0">
                    {bookmark.percentage}%
                  </span>
                </div>

                {bookmark.snippet && (
                  <p className="text-xs text-text-muted line-clamp-2 mb-1.5">
                    {bookmark.snippet}
                  </p>
                )}

                <div className="flex items-center justify-between gap-2">
                  {/* Picker de cor */}
                  <div
                    className="flex gap-1.5"
                    onClick={(e) => e.stopPropagation()}
                  >
                    {COLORS.map((c) => (
                      <button
                        key={c.key}
                        aria-label={`Cor ${c.label}`}
                        onClick={() => {
                          if (bookmark.id !== undefined) onColorChange(bookmark.id, c.key)
                        }}
                        className="w-4 h-4 rounded-full flex-shrink-0 transition-transform active:scale-90"
                        style={{
                          backgroundColor: c.hex,
                          // Anel de seleção quando é a cor atual
                          outline: (bookmark.color ?? 'indigo') === c.key
                            ? `2px solid ${c.hex}`
                            : 'none',
                          outlineOffset: '2px',
                        }}
                      />
                    ))}
                  </div>

                  <span className="text-[11px] text-text-muted tabular-nums flex-shrink-0">
                    {formatDate(bookmark.createdAt)}
                  </span>
                </div>
              </div>

              {/* Botão excluir */}
              <button
                onClick={(e) => {
                  e.stopPropagation()
                  if (bookmark.id !== undefined) onDelete(bookmark.id)
                }}
                className="ml-2 p-2 -mr-2 text-text-muted active:text-error transition-colors self-start"
                aria-label="Remover marcador"
              >
                <X size={16} />
              </button>
            </div>
          ))}
        </div>
      )}
    </BottomSheet>
  )
}
