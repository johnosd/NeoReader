import { useMemo } from 'react'
import { BookOpen } from 'lucide-react'
import { useBookCoverUrl } from '../hooks/useBookCoverUrl'
import { useWindowVirtualList } from '@/hooks/useWindowVirtualList'
import type { Book } from '../types/book'
import type { LibraryBook } from '../hooks/useLibraryCatalog'

interface LibraryGridViewProps {
  books: LibraryBook[]
  onOpenBook: (book: Book) => void
}

const GRID_COLUMNS = 3
const GRID_GAP_PX = 2

// Virtualiza por LINHA (grupos de 3 livros), nao por card — o virtualizador
// e unidimensional e a grade e sempre 3 colunas fixas, entao mapear "linhas"
// pro modelo dele e mais simples que virtualizacao 2D (ver research.md
// Decisao 2).
function chunkIntoRows<T>(items: T[], size: number): T[][] {
  const rows: T[][] = []
  for (let i = 0; i < items.length; i += size) {
    rows.push(items.slice(i, i + size))
  }
  return rows
}

// Estimativa inicial da altura de uma linha, a partir da largura da janela
// (nao ha padding horizontal no grid hoje) — so serve de ponto de partida,
// measureElement corrige com a altura real depois do primeiro render.
function estimateGridRowHeight(): number {
  const columnWidth = (window.innerWidth - GRID_GAP_PX * (GRID_COLUMNS - 1)) / GRID_COLUMNS
  return columnWidth * 1.5 // aspect-ratio dos cards e 2/3 (altura = largura * 3/2)
}

export function LibraryGridView({ books, onOpenBook }: LibraryGridViewProps) {
  const rows = useMemo(() => chunkIntoRows(books, GRID_COLUMNS), [books])
  const { containerRef, virtualizer } = useWindowVirtualList({
    count: rows.length,
    estimateSize: estimateGridRowHeight,
  })

  return (
    <div
      ref={containerRef}
      data-testid="library-virtual-grid"
      className="pb-10 pt-1"
      // overflowAnchor: none — evita o scroll anchoring nativo do browser
      // brigar com o reset de scroll do useLibraryScrollRestore quando
      // measureElement ajusta a altura estimada de uma linha (mesmo motivo
      // de LibraryScreen.tsx/VirtualizedLibraryList).
      style={{ position: 'relative', height: virtualizer.getTotalSize(), overflowAnchor: 'none' }}
    >
      {virtualizer.getVirtualItems().map((virtualItem) => {
        const row = rows[virtualItem.index]
        return (
          <div
            key={virtualItem.key}
            ref={virtualizer.measureElement}
            data-index={virtualItem.index}
            style={{
              position: 'absolute',
              top: 0,
              left: 0,
              width: '100%',
              display: 'grid',
              gridTemplateColumns: `repeat(${GRID_COLUMNS}, 1fr)`,
              gap: `${GRID_GAP_PX}px`,
              transform: `translateY(${virtualItem.start - virtualizer.options.scrollMargin}px)`,
            }}
          >
            {row.map((book) => (
              <GridBookCard key={book.id} book={book} onOpenBook={onOpenBook} />
            ))}
          </div>
        )
      })}
    </div>
  )
}

function GridBookCard({ book, onOpenBook }: { book: LibraryBook; onOpenBook: (book: Book) => void }) {
  const coverUrl = useBookCoverUrl(book.id)

  return (
    <button
      type="button"
      onClick={() => onOpenBook(book)}
      className="relative w-full overflow-hidden bg-bg-surface-2 transition-opacity active:opacity-75"
      style={{ aspectRatio: '2 / 3' }}
    >
      {coverUrl ? (
        <img
          src={coverUrl}
          alt={book.title}
          className="h-full w-full object-cover"
          loading="lazy"
          decoding="async"
          onContextMenu={(e) => e.preventDefault()}
        />
      ) : (
        <div className="flex h-full w-full items-center justify-center text-white/20">
          <BookOpen size={20} />
        </div>
      )}
      {book.percentage > 0 && (
        <div className="absolute bottom-0 left-0 right-0 h-[3px] bg-black/30">
          <div className="h-full bg-success" style={{ width: `${book.percentage}%` }} />
        </div>
      )}
    </button>
  )
}
