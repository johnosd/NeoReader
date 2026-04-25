import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { TocDrawer } from '@/components/reader/TocDrawer'

describe('TocDrawer', () => {
  it('navega direto para o primeiro capítulo útil ao tocar em um agrupamento', () => {
    const onSelect = vi.fn()

    render(
      <TocDrawer
        open
        toc={[
          {
            label: 'Part I',
            href: 'part-1.xhtml',
            subitems: [
              { label: 'Chapter 1', href: 'chapter-1.xhtml' },
              { label: 'Chapter 2', href: 'chapter-2.xhtml' },
            ],
          },
        ]}
        onSelect={onSelect}
        onClose={vi.fn()}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: 'Part I' }))

    expect(onSelect).toHaveBeenCalledWith('chapter-1.xhtml')
  })

  it('mantém navegação normal para itens folha', () => {
    const onSelect = vi.fn()

    render(
      <TocDrawer
        open
        toc={[
          { label: 'Chapter 1', href: 'chapter-1.xhtml' },
        ]}
        onSelect={onSelect}
        onClose={vi.fn()}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: 'Chapter 1' }))

    expect(onSelect).toHaveBeenCalledWith('chapter-1.xhtml')
  })

  it('marca o capitulo atual no indice', () => {
    render(
      <TocDrawer
        open
        toc={[
          {
            label: 'Part I',
            href: 'part-1.xhtml',
            subitems: [
              { label: 'Chapter 1', href: 'chapter-1.xhtml' },
              { label: 'Chapter 2', href: 'chapter-2.xhtml' },
            ],
          },
        ]}
        currentHref="chapter-2.xhtml"
        onSelect={vi.fn()}
        onClose={vi.fn()}
      />,
    )

    expect(screen.getByText('Agora')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Chapter 2' })).toBeTruthy()
  })

  it('marca pelo rotulo quando o leitor informa apenas o arquivo da secao', () => {
    render(
      <TocDrawer
        open
        toc={[
          {
            label: 'Part I',
            href: 'chapter.xhtml#part',
            subitems: [
              { label: 'Chapter 1', href: 'chapter.xhtml#chapter-1' },
              { label: 'Chapter 2', href: 'chapter.xhtml#chapter-2' },
            ],
          },
        ]}
        currentHref="chapter.xhtml"
        currentLabel="Chapter 2"
        onSelect={vi.fn()}
        onClose={vi.fn()}
      />,
    )

    expect(screen.getByText('Agora')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Chapter 2' })).toBeTruthy()
  })
})
