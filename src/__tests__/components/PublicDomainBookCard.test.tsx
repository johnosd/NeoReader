import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { PublicDomainBookCard } from '@/components/PublicDomainBookCard'
import type { PublicDomainCatalogEntry } from '@/services/PublicDomainCatalogService'
import type { PublicDomainDownloadState } from '@/services/PublicDomainDownloadCoordinator'

const entry: PublicDomainCatalogEntry = {
  id: 'jane-austen_pride-and-prejudice',
  title: 'Pride and Prejudice',
  author: 'Jane Austen',
  authorSlug: 'jane-austen',
  titleSlug: 'pride-and-prejudice',
}

function stateFor(status: PublicDomainDownloadState['status']): PublicDomainDownloadState {
  return { entryId: entry.id, status }
}

describe('PublicDomainBookCard', () => {
  it('mostra titulo/autor e dispara onDownload ao tocar no estado idle', () => {
    const onDownload = vi.fn()
    render(<PublicDomainBookCard entry={entry} state={stateFor('idle')} onDownload={onDownload} onOpenDownloaded={vi.fn()} />)

    expect(screen.getByText('Pride and Prejudice')).toBeTruthy()
    expect(screen.getByText('Jane Austen')).toBeTruthy()

    fireEvent.click(screen.getByRole('button'))
    expect(onDownload).toHaveBeenCalledWith(entry)
  })

  it('mostra o spinner de progresso e ignora toque durante o download', () => {
    const onDownload = vi.fn()
    render(<PublicDomainBookCard entry={entry} state={stateFor('downloading')} onDownload={onDownload} onOpenDownloaded={vi.fn()} />)

    expect(screen.getByText('Baixando...')).toBeTruthy()
    expect(screen.queryByRole('button')).toBeNull()
  })

  it('mostra "Na biblioteca" apos sucesso e abre o livro ao tocar (nao baixa de novo)', () => {
    const onDownload = vi.fn()
    const onOpenDownloaded = vi.fn()
    render(<PublicDomainBookCard entry={entry} state={stateFor('success')} onDownload={onDownload} onOpenDownloaded={onOpenDownloaded} />)

    expect(screen.getByText('Na biblioteca')).toBeTruthy()

    fireEvent.click(screen.getByRole('button'))
    expect(onOpenDownloaded).toHaveBeenCalledWith(entry)
    expect(onDownload).not.toHaveBeenCalled()
  })

  it('mostra retry apos erro e permite tocar de novo pra tentar', () => {
    const onDownload = vi.fn()
    render(<PublicDomainBookCard entry={entry} state={stateFor('error')} onDownload={onDownload} onOpenDownloaded={vi.fn()} />)

    expect(screen.getByText('Tentar novamente')).toBeTruthy()

    fireEvent.click(screen.getByRole('button'))
    expect(onDownload).toHaveBeenCalledWith(entry)
  })

  it('cai pro fallback de texto quando a capa remota falha ao carregar', () => {
    render(<PublicDomainBookCard entry={entry} state={stateFor('idle')} onDownload={vi.fn()} onOpenDownloaded={vi.fn()} />)

    const img = screen.getByRole('img')
    fireEvent.error(img)

    expect(screen.queryByRole('img')).toBeNull()
    expect(screen.getAllByText('Pride and Prejudice').length).toBeGreaterThan(0)
  })
})
