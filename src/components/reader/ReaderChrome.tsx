import { Bookmark, ChevronLeft, GraduationCap, List, Type, Volume2, VolumeX } from 'lucide-react'
import { Badge } from '../ui'
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

const FONT_SIZES: FontSize[] = ['sm', 'md', 'lg', 'xl']
const iconCardClass =
  'flex h-14 items-center justify-center rounded-md border border-white/8 bg-white/[0.03] text-text-secondary transition-all duration-150 active:scale-[0.92] active:border-purple-primary/30 active:bg-purple-primary/15 active:text-white'
const iconCardPrimaryClass =
  'border-purple-primary/30 bg-purple-primary/8 text-purple-light shadow-[inset_0_0_15px_rgba(123,44,191,0.2)]'

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

  const topState = visible
    ? 'translate-y-0 opacity-100'
    : '-translate-y-full opacity-0 pointer-events-none'
  const bottomState = visible
    ? 'translate-y-0 opacity-100'
    : 'translate-y-full opacity-0 pointer-events-none'
  const nextFontSize = FONT_SIZES[(FONT_SIZES.indexOf(fontSize) + 1) % FONT_SIZES.length]

  return (
    <>
      <div
        className={`absolute top-0 left-0 right-0 z-20 bg-gradient-to-b from-black/90 via-bg-reader/70 to-transparent transition-all duration-300 ${topState}`}
        onPointerUp={handleBarTap}
      >
        <div
          className="px-4 pb-4"
          style={{ paddingTop: 'max(1rem, env(safe-area-inset-top))' }}
        >
          <div className="flex items-center gap-3 rounded-[28px] border border-white/8 bg-[rgba(15,7,24,0.76)] px-3 py-3 shadow-nav backdrop-blur-xl">
            <button
              onClick={onBack}
              className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-white/8 bg-bg-surface-2/80 text-text-primary transition-transform duration-150 active:scale-[0.94] active:bg-white/10"
              aria-label="Voltar"
            >
              <ChevronLeft size={22} />
            </button>

            <div className="min-w-0 flex-1">
              <div className="mb-1 flex items-center justify-center gap-2">
                <Badge tone="indigo" className="px-2.5 py-1 text-[10px] normal-case tracking-normal">
                  {percentage}% lido
                </Badge>
                {bookmarkCount > 0 && (
                  <Badge tone="neutral" className="px-2.5 py-1 text-[10px] normal-case tracking-normal">
                    {bookmarkCount} marcadores
                  </Badge>
                )}
              </div>

              <p className="truncate text-center font-serif text-lg leading-tight text-text-primary">
                {title}
              </p>
            </div>

            <button
              onClick={onTocOpen}
              className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-white/8 bg-bg-surface-2/80 text-text-primary transition-transform duration-150 active:scale-[0.94] active:bg-white/10"
              aria-label="Índice"
            >
              <List size={20} />
            </button>
          </div>
        </div>
      </div>

      <div
        className={`absolute bottom-0 left-0 right-0 z-20 bg-gradient-to-t from-black/95 via-bg-reader/80 to-transparent transition-all duration-300 ${bottomState}`}
        onPointerUp={handleBarTap}
      >
        <div
          className="px-4 pt-3"
          style={{ paddingBottom: 'max(1rem, env(safe-area-inset-bottom))' }}
        >
          <div className="rounded-[30px] border border-white/8 bg-[rgba(15,7,24,0.82)] p-3 shadow-nav backdrop-blur-xl">
            <div className="grid grid-cols-4 gap-3">
              <button
                onClick={() => onFontSizeChange(nextFontSize)}
                className={`${iconCardClass} ${fontSize !== 'md' ? iconCardPrimaryClass : ''}`}
                aria-label={`Alternar tamanho da fonte. Próximo: ${nextFontSize}`}
              >
                <Type size={20} strokeWidth={2.1} />
              </button>

              <button
                onClick={onBookmarkList}
                className={`${iconCardClass} ${bookmarkCount > 0 ? iconCardPrimaryClass : ''}`}
                aria-label="Ver marcadores"
              >
                <Bookmark size={20} strokeWidth={2.1} />
              </button>

              <button
                onClick={onOpenVocabulary}
                className={iconCardClass}
                aria-label="Vocabulário"
              >
                <GraduationCap size={20} strokeWidth={2.1} />
              </button>

              <button
                onClick={onTtsToggle}
                className={`${iconCardClass} ${ttsIsPlaying ? iconCardPrimaryClass : ''}`}
                aria-label={ttsIsPlaying ? 'Parar leitura' : 'Iniciar leitura'}
              >
                {ttsIsPlaying
                  ? <VolumeX size={20} strokeWidth={2.1} />
                  : <Volume2 size={20} strokeWidth={2.1} />}
                {ttsEngine === 'speechify' && (
                  <span className="sr-only">Speechify AI ativo</span>
                )}
              </button>
            </div>
          </div>
        </div>
      </div>
    </>
  )
}
