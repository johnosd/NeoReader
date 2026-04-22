import { Bookmark, BookmarkCheck, ChevronLeft, GraduationCap, List, Volume2, VolumeX } from 'lucide-react'
import type { FontSize } from './EpubViewer'

interface ReaderChromeProps {
  visible: boolean
  title: string
  percentage: number
  fontSize: FontSize
  isBookmarked: boolean
  bookmarkCount: number
  ttsIsPlaying: boolean
  ttsEngine: 'speechify' | 'native'
  onBack: () => void
  onFontSizeChange: (size: FontSize) => void
  onBookmark: () => void
  onBookmarkList: () => void
  onTocOpen: () => void
  onOpenVocabulary: () => void
  onTtsToggle: () => void
  onDismiss: () => void
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
  ttsIsPlaying,
  ttsEngine,
  onBack,
  onFontSizeChange,
  onBookmark,
  onBookmarkList,
  onTocOpen,
  onOpenVocabulary,
  onTtsToggle,
  onDismiss,
}: ReaderChromeProps) {
  // Fecha o chrome ao tocar em área vazia das barras (fora de qualquer botão)
  function handleBarTap(e: React.PointerEvent) {
    if (!(e.target as Element).closest('button')) onDismiss()
  }
  const translateTop = visible ? 'translate-y-0' : '-translate-y-full'
  const translateBottom = visible ? 'translate-y-0' : 'translate-y-full'

  return (
    <>
      {/* Top bar */}
      <div
        className={`absolute top-0 left-0 right-0 z-20 bg-bg-reader/90 backdrop-blur-sm
          transition-transform duration-300 ${translateTop}`}
        onPointerUp={handleBarTap}
      >
        <div
            className="flex items-center justify-between px-4 pb-3 gap-3"
            style={{ paddingTop: 'max(2.5rem, env(safe-area-inset-top))' }}
          >
          <button
            onClick={onBack}
            className="p-2 -ml-2 text-text-primary active:opacity-60"
            aria-label="Voltar"
          >
            <ChevronLeft size={24} />
          </button>

          <p className="flex-1 text-text-primary text-sm font-semibold truncate text-center">
            {title}
          </p>

          <button
            onClick={onTocOpen}
            className="p-2 text-text-primary active:opacity-60"
            aria-label="Índice"
          >
            <List size={24} />
          </button>

          {/* Bookmark na extremidade direita — posição consistente com o overlay
              de bookmark que age diretamente quando o chrome está oculto. */}
          <button
            onClick={onBookmark}
            className="p-2 -mr-2 active:opacity-60"
            aria-label={isBookmarked ? 'Remover marcador' : 'Adicionar marcador'}
          >
            {isBookmarked
              ? <BookmarkCheck size={22} className="text-indigo-primary" />
              : <Bookmark size={22} className="text-text-primary" />
            }
          </button>
        </div>
      </div>

      {/* Bottom bar */}
      <div
        className={`absolute bottom-0 left-0 right-0 z-20 bg-bg-reader/90 backdrop-blur-sm
          transition-transform duration-300 ${translateBottom}`}
        onPointerUp={handleBarTap}
      >
        <div
          className="flex items-center justify-between px-6 py-4"
          style={{ paddingBottom: 'max(1.5rem, env(safe-area-inset-bottom))' }}
        >
          {/* Botões de tamanho de fonte */}
          <div className="flex items-center gap-3">
            {FONT_SIZES.map((item) => (
              <button
                key={item.value}
                onClick={() => onFontSizeChange(item.value)}
                className={`w-9 h-9 rounded-md flex items-center justify-center font-serif
                  ${FONT_BUTTON_SIZES[item.value]}
                  ${fontSize === item.value
                    ? 'bg-indigo-primary text-white'
                    : 'bg-bg-elevated text-text-muted active:opacity-60'
                  }`}
                aria-label={`Fonte ${item.value}`}
              >
                {item.label}
              </button>
            ))}
          </div>

          {/* Botão dedicado para abrir a lista de marcadores — separado do toggle no top bar */}
          <button
            onClick={onBookmarkList}
            className="relative p-2 text-text-muted active:opacity-60"
            aria-label="Ver marcadores"
          >
            <Bookmark size={20} />
            {bookmarkCount > 0 && (
              <span className="absolute -top-0.5 -right-0.5 text-[10px] leading-none tabular-nums text-indigo-primary font-semibold">
                {bookmarkCount}
              </span>
            )}
          </button>

          <button
            onClick={onOpenVocabulary}
            className="p-2 text-text-muted active:opacity-60"
            aria-label="Vocabulário"
          >
            <GraduationCap size={20} />
          </button>

          {/* TTS: Volume2 (parado) / VolumeX verde (tocando) + badge AI quando Speechify */}
          <button
            onClick={onTtsToggle}
            className="relative p-2 text-text-muted active:opacity-60"
            aria-label={ttsIsPlaying ? 'Parar leitura' : 'Iniciar leitura'}
          >
            {ttsIsPlaying
              ? <VolumeX size={20} className="text-success" />
              : <Volume2 size={20} />}
            {ttsEngine === 'speechify' && (
              <span className="absolute -top-0.5 -right-0.5 text-[9px] leading-none font-bold text-success">
                AI
              </span>
            )}
          </button>

          {/* Percentual de progresso */}
          <span className="text-text-muted text-sm tabular-nums">
            {percentage}%
          </span>
        </div>
      </div>
    </>
  )
}
