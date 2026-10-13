import { Lock, LockOpen } from 'lucide-react'
import { useBookLockStore } from '../store/bookLockStore'
import { useI18n } from '../i18n'
import { cn } from '../utils/cn'

// Cadeado de livro protegido (feature 024). Quem usa decide QUANDO mostrar
// (`book.isProtected`); aqui só o estado fechado/aberto vem do store.
export function BookLockBadge({ className }: { className?: string }) {
  const { t } = useI18n()
  const unlocked = useBookLockStore((state) => state.unlocked)
  const Icon = unlocked ? LockOpen : Lock

  return (
    <span
      role="img"
      aria-label={t(unlocked ? 'bookLock.badge.unlocked' : 'bookLock.badge.locked')}
      className={cn(
        'inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-black/70 text-white',
        'border border-white/15',
        className,
      )}
    >
      <Icon size={11} aria-hidden="true" />
    </span>
  )
}
