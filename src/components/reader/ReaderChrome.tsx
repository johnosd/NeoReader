import { Bookmark, BookmarkCheck, ChevronLeft, GraduationCap, List } from 'lucide-react'
import type { FontSize } from './EpubViewer'

interface ReaderChromeProps {
  visible: boolean
  title: string
  percentage: number
  fontSize: FontSize
  isBookmarked: boolean
  bookmarkCount: number
  onBack: () => void
  onFontSizeChange: (size: FontSize) => void
  onBookmark: () => void
  onBookmarkList: () => void
  onTocOpen: () => void
  onOpenVocabulary: () => void
}

const FONT_SIZES: { value: FontSize; label: string }[] = [
  { value: 'sm', label: 'A' },
  { value: 'md', label: 'A' },
  { value: 'lg', label: 'A' },
  { value: 'xl', label: 'A' },
]

// Tamanhos visuais dos botões de fonte (representação proporcional)
const FONT_BUTTON_SIZES: Record<FontSize, string> = {
  sm: 'text-xs',
  md: 'text-sm',
  lg: 'text-base',
  xl: 'text-lg',
}

export function ReaderChrome({
  visible,
  title,
  percentage,
  fontSize,
  isBookmarked,
  bookmarkCount,
  onBack,
  onFontSizeChange,
  onBookmark,
  onBookmarkList,
  onTocOpen,
  onOpenVocabulary,
}: ReaderChromeProps) {
  const translateTop = visible ? 'translate-y-0' : '-translate-y-full'
  const translateBottom = visible ? 'translate-y-0' : 'translate-y-full'

  return (
    <>
      {/* Top bar */}
      <div
        className={`absolute top-0 left-0 right-0 z-20 bg-[#0a0a0a]/90 backdrop-blur-sm
          transition-transform duration-300 ${translateTop}`}
      >
        <div className="flex items-center justify-between px-4 pt-10 pb-3 gap-3">
          <button
            onClick={onBack}
            className="p-2 -ml-2 text-white active:opacity-60"
            aria-label="Voltar"
          >
            <ChevronLeft size={24} />
          </button>

          <p className="flex-1 text-white text-sm font-semibold truncate text-center">
            {title}
          </p>

          {/* Bookmark: ícone preenchido (accent) se marcado, outline se não */}
          <button
            onClick={onBookmark}
            className="p-2 active:opacity-60"
            aria-label={isBookmarked ? 'Remover marcador' : 'Adicionar marcador'}
          >
            {isBookmarked
              ? <BookmarkCheck size={22} className="text-[#6366f1]" />
              : <Bookmark size={22} className="text-white" />
            }
          </button>

          <button
            onClick={onTocOpen}
            className="p-2 -mr-2 text-white active:opacity-60"
            aria-label="Marcadores"
          >
            <List size={24} />
          </button>
        </div>
      </div>

      {/* Bottom bar */}
      <div
        className={`absolute bottom-0 left-0 right-0 z-20 bg-[#0a0a0a]/90 backdrop-blur-sm
          transition-transform duration-300 ${translateBottom}`}
      >
        {/* Barra de progresso fina */}
        <div className="h-1 bg-[#1a1a1a]">
          <div
            className="h-full bg-[#22c55e] transition-all duration-500"
            style={{ width: `${percentage}%` }}
          />
        </div>

        <div className="flex items-center justify-between px-6 py-4 pb-8">
          {/* Botões de tamanho de fonte */}
          <div className="flex items-center gap-3">
            {FONT_SIZES.map((item) => (
              <button
                key={item.value}
                onClick={() => onFontSizeChange(item.value)}
                className={`w-9 h-9 rounded-md flex items-center justify-center font-serif
                  ${FONT_BUTTON_SIZES[item.value]}
                  ${fontSize === item.value
                    ? 'bg-[#6366f1] text-white'
                    : 'bg-[#1a1a1a] text-[#a0a0a0] active:opacity-60'
                  }`}
                aria-label={`Fonte ${item.value}`}
              >
                {item.label}
              </button>
            ))}
          </div>

          {/* Botão dedicado para abrir a lista de marcadores — separado do toggle 🔖 no top bar */}
          <button
            onClick={onBookmarkList}
            className="flex items-center gap-1.5 text-[#a0a0a0] active:opacity-60"
            aria-label="Ver marcadores"
          >
            <Bookmark size={18} />
            {bookmarkCount > 0 && (
              <span className="text-xs tabular-nums">{bookmarkCount}</span>
            )}
          </button>

          <button
            onClick={onOpenVocabulary}
            className="text-[#a0a0a0] active:opacity-60"
            aria-label="Vocabulário"
          >
            <GraduationCap size={20} />
          </button>

          {/* Percentual de progresso */}
          <span className="text-[#a0a0a0] text-sm tabular-nums">
            {percentage}%
          </span>
        </div>
      </div>
    </>
  )
}
