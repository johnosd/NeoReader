import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { ReaderProgressFooter } from '@/components/reader/ReaderProgressFooter'

describe('ReaderProgressFooter', () => {
  it('mostra o nome do capitulo e o percentual lido do capitulo', () => {
    render(<ReaderProgressFooter sectionLabel="Chapter 2" chapterPercentage={42} />)

    expect(screen.getByText('Chapter 2')).toBeTruthy()
    expect(screen.getByText('Cap. 42%')).toBeTruthy()
  })

  it('usa fallback quando o nome do capitulo nao esta disponivel', () => {
    render(<ReaderProgressFooter sectionLabel="" chapterPercentage={18} />)

    expect(screen.getByText('Capitulo atual')).toBeTruthy()
    expect(screen.getByText('Cap. 18%')).toBeTruthy()
  })

  it('usa fallback quando o percentual do capitulo nao esta disponivel', () => {
    render(<ReaderProgressFooter sectionLabel="Chapter 1" chapterPercentage={null} />)

    expect(screen.getByText('Chapter 1')).toBeTruthy()
    expect(screen.getByText('--%')).toBeTruthy()
  })
})
