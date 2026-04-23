import { X } from 'lucide-react'
import { Badge, BottomSheet, EmptyState } from '../ui'
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
  { key: 'indigo', hex: '#6366f1', label: 'Índigo' },
  { key: 'emerald', hex: '#22c55e', label: 'Verde' },
  { key: 'amber', hex: '#f59e0b', label: 'Âmbar' },
  { key: 'rose', hex: '#f43f5e', label: 'Rosa' },
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
  const sorted = [...bookmarks].sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
  )

  return (
    <BottomSheet
      open={open}
      onClose={onClose}
      title="Marcadores"
      className="border-t border-white/10 bg-[rgba(15,7,24,0.94)] backdrop-blur-2xl"
    >
      {sorted.length === 0 ? (
        <EmptyState
          title="Nenhum marcador ainda"
          description="Selecione um parágrafo durante a leitura e use Marcar para salvar esse trecho."
        />
      ) : (
        <div className="space-y-3">
          <div className="rounded-[24px] border border-white/8 bg-bg-surface-2/55 p-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-purple-light/80">
                  Trechos salvos
                </p>
                <p className="mt-1 text-sm leading-6 text-text-muted">
                  Abra qualquer marcador para voltar exatamente ao parágrafo salvo.
                </p>
              </div>
              <Badge tone="indigo" className="shrink-0 px-2.5 py-1 text-[10px] normal-case tracking-normal">
                {sorted.length} salvos
              </Badge>
            </div>
          </div>

          {sorted.map((bookmark) => (
            <div
              key={bookmark.id}
              className="cursor-pointer rounded-[24px] border border-white/8 bg-[rgba(18,9,26,0.84)] p-4 shadow-card backdrop-blur-xl transition-all duration-150 active:scale-[0.995] active:bg-white/5"
              onClick={() => onSelect(bookmark.cfi)}
            >
              <div className="flex items-start gap-4">
                <div className="flex shrink-0 flex-col items-center gap-2 pt-1">
                  <span
                    className="h-3 w-3 rounded-full ring-4 ring-white/3"
                    style={{ backgroundColor: colorHex(bookmark.color) }}
                  />
                  <span className="min-h-8 w-px flex-1 bg-white/10" />
                </div>

                <div className="min-w-0 flex-1">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-text-muted">
                        {bookmark.label}
                      </p>
                      <p className="mt-1 text-sm leading-6 text-text-primary line-clamp-2">
                        {bookmark.snippet || 'Trecho salvo deste capítulo.'}
                      </p>
                    </div>

                    <Badge tone="indigo" className="shrink-0 px-2.5 py-1 text-[10px] normal-case tracking-normal">
                      {bookmark.percentage}%
                    </Badge>
                  </div>

                  <div className="mt-4 flex items-center justify-between gap-3">
                    <div
                      className="flex items-center gap-2"
                      onClick={(e) => e.stopPropagation()}
                    >
                      {COLORS.map((c) => (
                        <button
                          key={c.key}
                          aria-label={`Cor ${c.label}`}
                          onClick={() => {
                            if (bookmark.id !== undefined) onColorChange(bookmark.id, c.key)
                          }}
                          className="h-4 w-4 rounded-full transition-transform active:scale-90"
                          style={{
                            backgroundColor: c.hex,
                            outline: (bookmark.color ?? 'indigo') === c.key
                              ? `2px solid ${c.hex}`
                              : 'none',
                            outlineOffset: '2px',
                          }}
                        />
                      ))}
                    </div>

                    <span className="text-[11px] tabular-nums text-text-muted">
                      {formatDate(bookmark.createdAt)}
                    </span>
                  </div>
                </div>

                <button
                  onClick={(e) => {
                    e.stopPropagation()
                    if (bookmark.id !== undefined) onDelete(bookmark.id)
                  }}
                  className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-white/8 bg-bg-surface-2/70 text-text-muted transition-colors duration-150 active:bg-error/12 active:text-error"
                  aria-label="Remover marcador"
                >
                  <X size={16} />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </BottomSheet>
  )
}
