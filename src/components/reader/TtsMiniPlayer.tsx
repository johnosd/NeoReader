import { ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight, LocateFixed, Pause, Play, Square, Timer } from 'lucide-react'
import speechifyIcon from '../../assets/tts-providers/speechify.svg'
import elevenLabsIcon from '../../assets/tts-providers/elevenlabs.svg'
import nativeTtsIcon from '../../assets/tts-providers/native-tts.svg'
import type { TtsProvider } from '../../types/tts'

export interface TtsSleepTimerOption {
  value: string
  label: string
}

interface TtsMiniPlayerProps {
  isPlaying: boolean
  activeProvider: TtsProvider
  fallbackFromProvider?: TtsProvider | null
  sleepTimerValue: string
  sleepTimerOptions: TtsSleepTimerOption[]
  sleepTimerRemainingLabel: string | null
  showBackToTtsLocation: boolean
  onPlayPause: () => void
  onBackToTtsLocation: () => void
  onPrevParagraph: () => void
  onPrevSentence: () => void
  onNextSentence: () => void
  onNextParagraph: () => void
  onSleepTimerChange: (value: string) => void
  onStop: () => void
}

const TTS_PROVIDER_META: Record<TtsProvider, { label: string; icon: string }> = {
  speechify: { label: 'Speechify', icon: speechifyIcon },
  elevenlabs: { label: 'ElevenLabs', icon: elevenLabsIcon },
  native: { label: 'TTS nativo', icon: nativeTtsIcon },
}

export function TtsMiniPlayer({
  isPlaying,
  activeProvider,
  fallbackFromProvider,
  sleepTimerValue,
  sleepTimerOptions,
  sleepTimerRemainingLabel,
  showBackToTtsLocation,
  onPlayPause,
  onBackToTtsLocation,
  onPrevParagraph,
  onPrevSentence,
  onNextSentence,
  onNextParagraph,
  onSleepTimerChange,
  onStop,
}: TtsMiniPlayerProps) {
  const activeMeta = TTS_PROVIDER_META[activeProvider]
  const fallbackMeta = fallbackFromProvider ? TTS_PROVIDER_META[fallbackFromProvider] : null

  return (
    <div
      className="absolute bottom-0 left-0 right-0 z-30 px-2 pt-0.5"
      style={{ paddingBottom: 'max(0.35rem, env(safe-area-inset-bottom))' }}
    >
      <div className="rounded-xl border border-white/10 bg-[rgba(15,7,24,0.9)] px-2.5 py-2 shadow-nav backdrop-blur-xl">
        <div className="flex items-center justify-between gap-2">
          <div className="flex min-w-0 flex-1 items-center gap-1.5 rounded-full border border-white/8 bg-white/[0.04] px-2 py-1">
            <img src={activeMeta.icon} alt="" className="h-4 w-4 shrink-0 object-contain" aria-hidden="true" />
            <span className="truncate text-[11px] font-semibold text-text-secondary">
              {fallbackMeta
                ? `${fallbackMeta.label} indisponível; usando ${activeMeta.label}`
                : activeMeta.label}
            </span>
          </div>

          <div className="flex shrink-0 items-center gap-1 rounded-full border border-white/8 bg-bg-surface-2/55 px-1.5 py-1 text-text-secondary">
            <Timer size={13} />
            {sleepTimerRemainingLabel && (
              <span className="max-w-[2.6rem] truncate text-[11px] font-semibold text-text-muted">
                {sleepTimerRemainingLabel}
              </span>
            )}

            <select
              value={sleepTimerValue}
              onChange={(event) => onSleepTimerChange(event.target.value)}
              className="w-[4.75rem] rounded-md border border-white/8 bg-[rgba(15,7,24,0.92)] px-1 py-0.5 text-[11px] font-semibold text-text-primary outline-none"
              aria-label="Timer de desligamento"
            >
              {sleepTimerOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>

          <button
            onPointerUp={onStop}
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-white/8 bg-bg-surface-2/80 text-text-muted transition-all duration-150 active:scale-[0.94] active:bg-white/10"
            aria-label="Encerrar leitura"
          >
            <Square size={14} fill="currentColor" />
          </button>
        </div>

        <div className="mt-1.5 flex items-center justify-center gap-1.5">
          <button
            onPointerUp={onPrevParagraph}
            className="flex h-9 w-9 items-center justify-center rounded-full border border-white/8 bg-bg-surface-2/80 text-text-secondary transition-all duration-150 active:scale-[0.94] active:bg-white/10"
            aria-label="Parágrafo anterior"
          >
            <ChevronsLeft size={18} />
          </button>

          <button
            onPointerUp={onPrevSentence}
            className="flex h-9 w-9 items-center justify-center rounded-full border border-white/8 bg-bg-surface-2/80 text-text-secondary transition-all duration-150 active:scale-[0.94] active:bg-white/10"
            aria-label="Frase anterior"
          >
            <ChevronLeft size={18} />
          </button>

          <button
            onPointerUp={onPlayPause}
            className="flex h-11 w-11 items-center justify-center rounded-full bg-indigo-primary text-white shadow-indigo-glow transition-all duration-150 active:scale-[0.94]"
            aria-label={isPlaying ? 'Pausar' : 'Retomar'}
          >
            {isPlaying
              ? <Pause size={19} fill="currentColor" />
              : <Play size={19} fill="currentColor" />}
          </button>

          <button
            onPointerUp={onNextSentence}
            className="flex h-9 w-9 items-center justify-center rounded-full border border-white/8 bg-bg-surface-2/80 text-text-secondary transition-all duration-150 active:scale-[0.94] active:bg-white/10"
            aria-label="Próxima frase"
          >
            <ChevronRight size={18} />
          </button>

          <button
            onPointerUp={onNextParagraph}
            className="flex h-9 w-9 items-center justify-center rounded-full border border-white/8 bg-bg-surface-2/80 text-text-secondary transition-all duration-150 active:scale-[0.94] active:bg-white/10"
            aria-label="Próximo parágrafo"
          >
            <ChevronsRight size={18} />
          </button>
        </div>

        {showBackToTtsLocation && (
          <button
            type="button"
            onPointerUp={onBackToTtsLocation}
            className="mt-1.5 flex h-8 w-full items-center justify-center gap-2 rounded-lg border border-indigo-primary/30 bg-indigo-primary/15 px-3 text-xs font-bold text-text-primary transition-all duration-150 active:scale-[0.98]"
          >
            <LocateFixed size={14} />
            Voltar ao áudio
          </button>
        )}

      </div>
    </div>
  )
}
