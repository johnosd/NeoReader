import { Check } from 'lucide-react'

// Círculo de seleção da Biblioteca (feature 023, FR-004): vazio = "dá pra marcar",
// preenchido com check = marcado. Decorativo (aria-hidden): o estado já vai no
// aria-pressed/aria-label do item que o contém.
export function SelectionCheck({ selected }: { selected: boolean }) {
  return (
    <span
      aria-hidden="true"
      className={[
        'flex h-6 w-6 shrink-0 items-center justify-center rounded-full border-2 transition-colors',
        selected
          ? 'border-purple-light bg-purple-primary text-white'
          : 'border-white/70 bg-black/30 text-transparent',
      ].join(' ')}
    >
      <Check size={14} strokeWidth={3} />
    </span>
  )
}
