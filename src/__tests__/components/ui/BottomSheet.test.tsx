import { fireEvent, render, screen } from '@testing-library/react'
import { useState } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { BottomSheet } from '@/components/ui/BottomSheet'

// R16 (code review 2026-10-10): sheet fechado não pode ser diálogo acessível nem focável.
describe('BottomSheet', () => {
  it('fechado: fica inert e fora da árvore de acessibilidade', () => {
    render(
      <BottomSheet open={false} onClose={() => undefined} title="Fechado">
        <button>Ação escondida</button>
      </BottomSheet>,
    )
    // getByRole ignora nós aria-hidden: nem o diálogo nem o botão podem aparecer.
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(screen.queryByRole('button', { name: 'Ação escondida' })).toBeNull()
    const dialog = screen.getByText('Ação escondida').closest('[role="dialog"]')
    expect(dialog?.hasAttribute('inert')).toBe(true)
    expect(dialog?.getAttribute('aria-hidden')).toBe('true')
  })

  it('aberto: nome acessível vem do título e o foco vai para o diálogo', () => {
    render(
      <BottomSheet open onClose={() => undefined} title="Ordenar">
        <button>Opção</button>
      </BottomSheet>,
    )
    const dialog = screen.getByRole('dialog', { name: 'Ordenar' })
    expect(dialog.hasAttribute('inert')).toBe(false)
    expect(document.activeElement).toBe(dialog)
  })

  it('Escape fecha e o foco volta ao acionador', () => {
    function Harness() {
      const [open, setOpen] = useState(false)
      return (
        <>
          <button onClick={() => setOpen(true)}>Abrir</button>
          <BottomSheet open={open} onClose={() => setOpen(false)} title="Sheet">
            <button>Dentro</button>
          </BottomSheet>
        </>
      )
    }
    render(<Harness />)
    const trigger = screen.getByRole('button', { name: 'Abrir' })
    trigger.focus()
    fireEvent.click(trigger)
    expect(document.activeElement).toBe(screen.getByRole('dialog', { name: 'Sheet' }))

    fireEvent.keyDown(document, { key: 'Escape' })
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(document.activeElement).toBe(trigger)
  })

  it('não rouba o foco de um filho com autoFocus', () => {
    const onClose = vi.fn()
    render(
      <BottomSheet open onClose={onClose} title="Nota">
        <textarea aria-label="Nota" autoFocus />
      </BottomSheet>,
    )
    expect(document.activeElement).toBe(screen.getByLabelText('Nota', { selector: 'textarea' }))
  })
})
