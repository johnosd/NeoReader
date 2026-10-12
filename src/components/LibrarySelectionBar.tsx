import { ListChecks, X } from 'lucide-react'
import { useI18n } from '../i18n'

interface LibrarySelectionBarProps {
  count: number
  onExit: () => void
  onOpenActions: () => void
}

// Barra do modo de seleção da Biblioteca (feature 023, FR-005). É `fixed` e fica
// SOBRE o cabeçalho (que continua no DOM, só invisível): trocar um cabeçalho de ~250 px por uma
// barra de ~64 px deslocaria a lista debaixo do dedo no instante do long-press, e rolando a lista
// um cabeçalho em fluxo normal ficaria fora da tela com o modo ativo.
export function LibrarySelectionBar({ count, onExit, onOpenActions }: LibrarySelectionBarProps) {
  const { t } = useI18n()

  return (
    <div className="fixed inset-x-0 top-0 z-40 flex items-center gap-3 border-b border-white/10 bg-bg-surface px-5 pb-3 pt-10">
      <button
        type="button"
        onClick={onExit}
        aria-label={t('library.selection.exit')}
        className="flex h-11 w-11 shrink-0 items-center justify-center rounded-md border border-border bg-white/5 text-text-secondary transition-transform active:scale-95"
      >
        <X size={20} />
      </button>
      <p role="status" className="min-w-0 flex-1 truncate text-lg font-bold text-text-primary">
        {count === 1 ? t('library.selection.count.one') : t('library.selection.count.many', { count })}
      </p>
      <button
        type="button"
        onClick={onOpenActions}
        aria-label={t('library.selection.actions')}
        className="flex h-11 w-11 shrink-0 items-center justify-center rounded-md bg-purple-primary text-white shadow-purple-glow transition-transform active:scale-95"
      >
        <ListChecks size={20} />
      </button>
    </div>
  )
}
