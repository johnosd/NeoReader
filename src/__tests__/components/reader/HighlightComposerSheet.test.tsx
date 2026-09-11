import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { HighlightComposerSheet } from '@/components/reader/HighlightComposerSheet'
import type { Highlight } from '@/types/highlight'

function makeHighlight(overrides: Partial<Highlight> = {}): Highlight {
  return {
    id: 9,
    bookId: 1,
    cfi: 'epubcfi(/6/8!/4/2/10/2,/1:0,/1:20)',
    paraCfi: 'epubcfi(/6/8!/4/2/10/2:0)',
    text: 'texto selecionado',
    color: 'rose',
    style: 'underline',
    sectionIndex: 0,
    percentage: 10,
    createdAt: new Date('2026-09-06T00:00:00Z'),
    ...overrides,
  }
}

describe('HighlightComposerSheet', () => {
  it('modo criacao: cor/estilo default vem das props, nota comeca vazia', () => {
    render(
      <HighlightComposerSheet
        open
        defaultColor="amber"
        defaultStyle="squiggly"
        onSave={vi.fn()}
        onClose={vi.fn()}
      />,
    )

    expect(screen.getByLabelText('Cor Ambar').getAttribute('aria-pressed')).toBe('true')
    expect(screen.getByLabelText('Cor Indigo').getAttribute('aria-pressed')).toBe('false')
    expect(screen.getByLabelText('Risco ondulado').getAttribute('aria-pressed')).toBe('true')
    expect(screen.getByLabelText('Fundo colorido').getAttribute('aria-pressed')).toBe('false')
    expect((screen.getByPlaceholderText('Escreva sua anotacao...') as HTMLTextAreaElement).value).toBe('')
  })

  it('modo edicao: cor/estilo/nota vem do highlight existente', () => {
    render(
      <HighlightComposerSheet
        open
        highlight={makeHighlight({ note: 'Reflexao existente' })}
        onSave={vi.fn()}
        onClose={vi.fn()}
      />,
    )

    expect(screen.getByLabelText('Cor Rosa').getAttribute('aria-pressed')).toBe('true')
    expect(screen.getByLabelText('Sublinhado').getAttribute('aria-pressed')).toBe('true')
    expect((screen.getByPlaceholderText('Escreva sua anotacao...') as HTMLTextAreaElement).value).toBe('Reflexao existente')
  })

  it('confirmar chama onSave com a cor/estilo/nota atuais da caixa (apos o usuario mudar)', () => {
    const onSave = vi.fn()
    render(
      <HighlightComposerSheet
        open
        defaultColor="indigo"
        defaultStyle="background"
        onSave={onSave}
        onClose={vi.fn()}
      />,
    )

    fireEvent.click(screen.getByLabelText('Cor Rosa'))
    fireEvent.click(screen.getByLabelText('Sublinhado'))
    fireEvent.change(screen.getByPlaceholderText('Escreva sua anotacao...'), {
      target: { value: 'Nota nova' },
    })
    fireEvent.click(screen.getByText('Salvar'))

    expect(onSave).toHaveBeenCalledWith({ color: 'rose', style: 'underline', note: 'Nota nova' })
  })

  it('cancelar chama onClose sem chamar onSave', () => {
    const onSave = vi.fn()
    const onClose = vi.fn()
    render(
      <HighlightComposerSheet
        open
        defaultColor="indigo"
        defaultStyle="background"
        onSave={onSave}
        onClose={onClose}
      />,
    )

    fireEvent.click(screen.getByLabelText('Cor Rosa'))
    fireEvent.click(screen.getByText('Cancelar'))

    expect(onClose).toHaveBeenCalledOnce()
    expect(onSave).not.toHaveBeenCalled()
  })
})
