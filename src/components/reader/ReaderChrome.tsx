import { Bookmark, ChevronLeft, GraduationCap, List, Volume2, VolumeX } from 'lucide-react'
import type { FontSize } from './EpubViewer'

interface ReaderChromeProps {
  visible: boolean
  title: string
  percentage: number
  fontSize: FontSize
  bookmarkCount: number
  ttsIsPlaying: boolean
  ttsEngine: 'speechify' | 'native'
  onBack: () => void
  onFontSizeChange: (size: FontSize) => void
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
  bookmarkCount,
  ttsIsPlaying,
  ttsEngine,
  onBack,
  onFontSizeChange,
  onBookmarkList,
  onTocOpen,
  onOpenVocabulary,
  onTtsToggle,
  onDismiss,
}: ReaderChromeProps) {
  function handleBarTap(e: React.PointerEvent) {
    if (!(e.target as Element).closest('button')) onDismiss()
  }

  const translateTop = visible ? 'translate-y-0' : '-translate-y-full'
  const translateBottom = visible ? 'translate-y-0' : 'translate-y-full'

  return (
    <>
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
            className="p-2 -mr-2 text-text-primary active:opacity-60"
            aria-label="Índice"
          >
            <List size={24} />
          </button>
        </div>
      </div>

      <div
        className={`absolute bottom-0 left-0 right-0 z-20 bg-bg-reader/90 backdrop-blur-sm
          transition-transform duration-300 ${translateBottom}`}
        onPointerUp={handleBarTap}
      >
        <div
          className="flex items-center justify-between px-6 py-4"
          style={{ paddingBottom: 'max(1.5rem, env(safe-area-inset-bottom))' }}
        >
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

          <span className="text-text-muted text-sm tabular-nums">
            {percentage}%
          </span>
        </div>
      </div>
    </>
  )
}
