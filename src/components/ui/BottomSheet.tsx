import { useEffect, useId, useRef, type ReactNode } from 'react'
import { cn } from '../../utils/cn'

interface BottomSheetProps {
  open: boolean
  onClose: () => void
  title?: string
  children: ReactNode
  className?: string
}

export function BottomSheet({ open, onClose, title, children, className }: BottomSheetProps) {
  const dialogRef = useRef<HTMLDivElement>(null)
  // useId gera um id estável e único por instância — liga o <h2> ao diálogo (nome acessível).
  const titleId = useId()
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

  // Foco modal: ao abrir, guarda quem tinha o foco (o acionador) e leva o foco para o diálogo;
  // ao fechar (ou desmontar aberto), devolve o foco ao acionador. Efeito separado do de cima
  // porque `onClose` costuma ser uma arrow nova a cada render — rodar isto a cada render
  // ficaria puxando o foco de volta.
  useEffect(() => {
    if (!open) return
    const trigger = document.activeElement instanceof HTMLElement ? document.activeElement : null
    const dialog = dialogRef.current
    // Não rouba o foco de um filho que já se focou (ex.: autoFocus do textarea do HighlightComposerSheet;
    // efeitos de filhos rodam antes dos do pai). preventScroll evita salto durante a animação.
    if (dialog && !dialog.contains(document.activeElement)) dialog.focus({ preventScroll: true })
    return () => {
      // isConnected: o acionador pode ter saído da tela enquanto o sheet estava aberto.
      if (trigger?.isConnected) trigger.focus({ preventScroll: true })
    }
  }, [open])

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
      {/* Fechado, o sheet continua montado (anima a saída e preserva o estado dos filhos),
          mas fica `inert` (nada focável/clicável) e fora da árvore de acessibilidade. */}
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={title ? titleId : undefined}
        aria-hidden={!open}
        inert={!open}
        tabIndex={-1}
        className={cn(
          'fixed left-0 right-0 bottom-0 z-[2001] bg-bg-elevated outline-none',
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
              <h2 id={titleId} className="text-lg font-bold text-text-primary">{title}</h2>
            </div>
          )}
        </div>
        <div className="p-4">{children}</div>
      </div>
    </>
  )
}
