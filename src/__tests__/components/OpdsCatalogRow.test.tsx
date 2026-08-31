import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { OpdsCatalogRow } from '@/components/OpdsCatalogRow'
import type { OpdsDownloadState, OpdsFeedEntry } from '@/types/opds'

const entries: OpdsFeedEntry[] = [
  { id: 'a', title: 'Dune', kind: 'publication', acquisitionUrl: 'https://example.com/a.epub', coverUrl: 'https://example.com/a.jpg' },
  { id: 'b', title: 'Foundation', kind: 'publication', acquisitionUrl: 'https://example.com/b.epub', coverUrl: 'https://example.com/b.jpg' },
]

function idleState(): OpdsDownloadState {
  return { key: 'x', status: 'idle' }
}

describe('OpdsCatalogRow', () => {
  it('mostra o nome do catálogo e os itens da amostra', () => {
    render(
      <OpdsCatalogRow
        catalogName="Project Gutenberg"
        entries={entries}
        loading={false}
        getState={idleState}
        onDownload={vi.fn()}
        onOpenDownloaded={vi.fn()}
      />,
    )

    expect(screen.getByText('Project Gutenberg')).toBeTruthy()
    expect(screen.getByText('Dune')).toBeTruthy()
    expect(screen.getByText('Foundation')).toBeTruthy()
  })

  it('não mostra os itens enquanto loading', () => {
    render(
      <OpdsCatalogRow
        catalogName="Project Gutenberg"
        entries={entries}
        loading
        getState={idleState}
        onDownload={vi.fn()}
        onOpenDownloaded={vi.fn()}
      />,
    )

    expect(screen.queryByText('Dune')).toBeNull()
  })

  it('não mostra "ver mais" quando onSeeMore não é passado (US1, antes da US3 existir)', () => {
    render(
      <OpdsCatalogRow
        catalogName="Project Gutenberg"
        entries={entries}
        loading={false}
        getState={idleState}
        onDownload={vi.fn()}
        onOpenDownloaded={vi.fn()}
      />,
    )

    expect(screen.queryByText('Ver mais')).toBeNull()
  })

  it('mostra e dispara "ver mais" quando onSeeMore é passado', () => {
    const onSeeMore = vi.fn()
    render(
      <OpdsCatalogRow
        catalogName="Project Gutenberg"
        entries={entries}
        loading={false}
        getState={idleState}
        onDownload={vi.fn()}
        onOpenDownloaded={vi.fn()}
        onSeeMore={onSeeMore}
      />,
    )

    fireEvent.click(screen.getByText('Ver mais'))
    expect(onSeeMore).toHaveBeenCalledTimes(1)
  })

  it('dispara onDownload com a entry certa ao tocar num card', () => {
    const onDownload = vi.fn()
    render(
      <OpdsCatalogRow
        catalogName="Project Gutenberg"
        entries={entries}
        loading={false}
        getState={idleState}
        onDownload={onDownload}
        onOpenDownloaded={vi.fn()}
      />,
    )

    fireEvent.click(screen.getAllByRole('button')[0]!)
    expect(onDownload).toHaveBeenCalledWith(entries[0])
  })

  it('mostra erro isolado (não os itens) e não mostra "ver mais" quando error=true (US5)', () => {
    const onSeeMore = vi.fn()
    render(
      <OpdsCatalogRow
        catalogName="Catálogo quebrado"
        entries={entries}
        loading={false}
        error
        getState={idleState}
        onDownload={vi.fn()}
        onOpenDownloaded={vi.fn()}
        onSeeMore={onSeeMore}
      />,
    )

    expect(screen.queryByText('Dune')).toBeNull()
    expect(screen.queryByText('Ver mais')).toBeNull()
  })

  it('mostra mensagem de "sem conexão" quando offline, e genérica quando não', () => {
    const { rerender } = render(
      <OpdsCatalogRow
        catalogName="Catálogo"
        entries={[]}
        loading={false}
        error
        offline
        getState={idleState}
        onDownload={vi.fn()}
        onOpenDownloaded={vi.fn()}
      />,
    )
    expect(screen.getByText('Verifique sua conexao e tente novamente.')).toBeTruthy()

    rerender(
      <OpdsCatalogRow
        catalogName="Catálogo"
        entries={[]}
        loading={false}
        error
        offline={false}
        getState={idleState}
        onDownload={vi.fn()}
        onOpenDownloaded={vi.fn()}
      />,
    )
    expect(screen.getByText('Nao foi possivel carregar')).toBeTruthy()
  })

  it('dispara onRetry ao tocar no bloco de erro', () => {
    const onRetry = vi.fn()
    render(
      <OpdsCatalogRow
        catalogName="Catálogo"
        entries={[]}
        loading={false}
        error
        onRetry={onRetry}
        getState={idleState}
        onDownload={vi.fn()}
        onOpenDownloaded={vi.fn()}
      />,
    )

    fireEvent.click(screen.getByRole('button'))
    expect(onRetry).toHaveBeenCalledTimes(1)
  })
})
