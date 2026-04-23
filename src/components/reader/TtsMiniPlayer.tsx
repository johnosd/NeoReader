import { ChevronLeft, ChevronRight, Pause, Play, Square } from 'lucide-react'

interface TtsMiniPlayerProps {
  isPlaying: boolean
  onPlayPause: () => void
  onPrev: () => void
  onNext: () => void
  onStop: () => void
}

export function TtsMiniPlayer({ isPlaying, onPlayPause, onPrev, onNext, onStop }: TtsMiniPlayerProps) {
  return (
    <div
      className="absolute bottom-0 left-0 right-0 z-30 px-4 pt-2"
      style={{ paddingBottom: 'max(0.75rem, env(safe-area-inset-bottom))' }}
    >
      <div className="rounded-[28px] border border-white/10 bg-[rgba(15,7,24,0.88)] px-4 py-4 shadow-nav backdrop-blur-xl">
        <div className="mb-3 flex items-start justify-between gap-3">
          <div>
            <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-purple-light/80">
              Leitura contínua
            </p>
            <p className="mt-1 text-sm leading-6 text-text-secondary">
              Toque em um parágrafo para reposicionar a narração.
            </p>
          </div>

          <button
            onPointerUp={onStop}
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-white/8 bg-bg-surface-2/80 text-text-muted transition-all duration-150 active:scale-[0.94] active:bg-white/10"
            aria-label="Encerrar leitura"
          >
            <Square size={16} fill="currentColor" />
          </button>
        </div>

        <div className="flex items-center justify-center gap-4">
          <button
            onPointerUp={onPrev}
            className="flex h-12 w-12 items-center justify-center rounded-full border border-white/8 bg-bg-surface-2/80 text-text-secondary transition-all duration-150 active:scale-[0.94] active:bg-white/10"
            aria-label="Parágrafo anterior"
          >
            <ChevronLeft size={22} />
          </button>

          <button
            onPointerUp={onPlayPause}
            className="flex h-14 w-14 items-center justify-center rounded-full bg-indigo-primary text-white shadow-indigo-glow transition-all duration-150 active:scale-[0.94]"
            aria-label={isPlaying ? 'Pausar' : 'Retomar'}
          >
            {isPlaying
              ? <Pause size={20} fill="currentColor" />
              : <Play size={20} fill="currentColor" />}
          </button>

          <button
            onPointerUp={onNext}
            className="flex h-12 w-12 items-center justify-center rounded-full border border-white/8 bg-bg-surface-2/80 text-text-secondary transition-all duration-150 active:scale-[0.94] active:bg-white/10"
            aria-label="Próximo parágrafo"
          >
            <ChevronRight size={22} />
          </button>
        </div>
      </div>
    </div>
  )
}
