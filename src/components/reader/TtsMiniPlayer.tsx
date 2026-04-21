import { ChevronLeft, ChevronRight, Pause, Play, Square } from 'lucide-react'

interface TtsMiniPlayerProps {
  isPlaying: boolean
  onPlayPause: () => void
  onPrev: () => void
  onNext: () => void
  onStop: () => void
}

// Mini player fixo na base da tela durante leitura TTS.
// Permanece visível mesmo quando o chrome está oculto — é o controle primário do audiobook.
// ⏮ vai para o início do parágrafo anterior (ou início do atual se estiver no meio)
// ▶/⏸ retoma/pausa do ponto exato onde parou
// ⏭ pula para o próximo parágrafo
// ⏹ (canto direito) encerra TTS e esconde o player
export function TtsMiniPlayer({ isPlaying, onPlayPause, onPrev, onNext, onStop }: TtsMiniPlayerProps) {
  return (
    <div className="absolute bottom-0 left-0 right-0 z-30 flex flex-col items-center pt-2 pb-3 bg-bg-reader border-t border-indigo-primary/25">
      {/* Indicador de modo leitura contínua */}
      <p className="text-center mb-2 text-[11px] text-text-muted tracking-wide">
        Leitura contínua · toque em parágrafo para navegar
      </p>

      <div className="flex items-center justify-center gap-8 w-full relative">
        {/* Parágrafo anterior */}
        <button
          onPointerUp={onPrev}
          className="p-2 rounded-full text-text-secondary active:opacity-50"
          aria-label="Parágrafo anterior"
        >
          <ChevronLeft size={24} />
        </button>

        {/* Play / Pause — botão principal */}
        <button
          onPointerUp={onPlayPause}
          className="p-3 rounded-full bg-indigo-primary text-white active:opacity-70"
          aria-label={isPlaying ? 'Pausar' : 'Retomar'}
        >
          {isPlaying
            ? <Pause size={20} fill="currentColor" />
            : <Play size={20} fill="currentColor" />
          }
        </button>

        {/* Próximo parágrafo */}
        <button
          onPointerUp={onNext}
          className="p-2 rounded-full text-text-secondary active:opacity-50"
          aria-label="Próximo parágrafo"
        >
          <ChevronRight size={24} />
        </button>

        {/* Stop — encerra o TTS e esconde o player */}
        <button
          onPointerUp={onStop}
          className="p-2 rounded-full text-text-muted active:opacity-50 absolute right-4"
          aria-label="Encerrar leitura"
        >
          <Square size={18} fill="currentColor" />
        </button>
      </div>
    </div>
  )
}
