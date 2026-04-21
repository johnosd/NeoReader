import { useEffect, type ReactNode } from 'react'
import { cn } from '../../utils/cn'

interface BottomSheetProps {
  open: boolean
  onClose: () => void
  title?: string
  children: ReactNode
  className?: string
}

export function BottomSheet({ open, onClose, title, children, className }: BottomSheetProps) {
  // ESC fecha o sheet (acessibilidade keyboard) e trava scroll do body quando aberto.
  useEffect(() => {
    if (!open) return
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)
    const prevOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = prevOverflow
    }
  }, [open, onClose])

  return (
    <>
      <div
        aria-hidden={!open}
        onClick={onClose}
        className={cn(
          'fixed inset-0 z-[2000] bg-black/70 transition-opacity duration-300',
          open ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none',
        )}
      />
      <div
        role="dialog"
        aria-modal="true"
        className={cn(
          'fixed left-0 right-0 bottom-0 z-[2001] bg-bg-elevated',
          'rounded-t-lg max-h-[90vh] overflow-y-auto',
          'transition-transform duration-300 ease-out',
          open ? 'translate-y-0' : 'translate-y-full',
          className,
        )}
        style={{ paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}
      >
        <div className="sticky top-0 z-10 bg-bg-elevated">
          <div className="flex justify-center pt-2 pb-1">
            <span className="block w-10 h-1 rounded-pill bg-white/15" />
          </div>
          {title && (
            <div className="px-4 pt-2 pb-3 border-b border-border">
              <h2 className="text-lg font-bold text-text-primary">{title}</h2>
            </div>
          )}
        </div>
        <div className="p-4">{children}</div>
      </div>
    </>
  )
}
