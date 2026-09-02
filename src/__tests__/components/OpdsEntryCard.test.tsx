import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { OpdsEntryCard, OpdsFolderListRow } from '@/components/OpdsEntryCard'
import type { OpdsDownloadState, OpdsFeedEntry } from '@/types/opds'

const publicationEntry: OpdsFeedEntry = {
  id: 'urn:book-1',
  title: 'Dune',
  author: 'Frank Herbert',
  kind: 'publication',
  acquisitionUrl: 'https://example.com/1.epub',
  coverUrl: 'https://example.com/1.jpg',
}

const navigationEntry: OpdsFeedEntry = {
  id: 'urn:folder-1',
  title: 'Ficção Científica',
  kind: 'navigation',
  navigationUrl: 'https://example.com/folder-1',
}

function stateFor(status: OpdsDownloadState['status']): OpdsDownloadState {
  return { key: publicationEntry.id, status }
}

describe('OpdsEntryCard', () => {
  it('mostra título/autor e dispara onDownload ao tocar no estado idle', () => {
    const onDownload = vi.fn()
    render(<OpdsEntryCard entry={publicationEntry} state={stateFor('idle')} onDownload={onDownload} onOpenDownloaded={vi.fn()} />)

    expect(screen.getByText('Dune')).toBeTruthy()
    expect(screen.getByText('Frank Herbert')).toBeTruthy()

    fireEvent.click(screen.getByRole('button'))
    expect(onDownload).toHaveBeenCalledWith(publicationEntry)
  })

  it('mostra o spinner de progresso e ignora toque durante o download', () => {
    const onDownload = vi.fn()
    render(<OpdsEntryCard entry={publicationEntry} state={stateFor('downloading')} onDownload={onDownload} onOpenDownloaded={vi.fn()} />)

    expect(screen.getByText('Baixando...')).toBeTruthy()
    expect(screen.queryByRole('button')).toBeNull()
  })

  it('mostra "Na biblioteca" após sucesso e abre o livro ao tocar (não baixa de novo)', () => {
    const onDownload = vi.fn()
    const onOpenDownloaded = vi.fn()
    render(<OpdsEntryCard entry={publicationEntry} state={stateFor('success')} onDownload={onDownload} onOpenDownloaded={onOpenDownloaded} />)

    expect(screen.getByText('Na biblioteca')).toBeTruthy()
    fireEvent.click(screen.getByRole('button'))
    expect(onOpenDownloaded).toHaveBeenCalledWith(publicationEntry)
    expect(onDownload).not.toHaveBeenCalled()
  })

  it('mostra o motivo específico do erro (ex: já está na biblioteca) em vez do texto genérico, e permite tentar de novo', () => {
    const onDownload = vi.fn()
    const state: OpdsDownloadState = { key: publicationEntry.id, status: 'error', errorMessage: 'Este livro ja esta na biblioteca.' }
    render(<OpdsEntryCard entry={publicationEntry} state={state} onDownload={onDownload} onOpenDownloaded={vi.fn()} />)

    expect(screen.getByText('Este livro ja esta na biblioteca.')).toBeTruthy()
    expect(screen.queryByText('Nao foi possivel baixar. Toque para tentar de novo.')).toBeNull()
    fireEvent.click(screen.getByRole('button'))
    expect(onDownload).toHaveBeenCalledWith(publicationEntry)
  })

  it('cai no texto genérico quando o erro não tem uma mensagem específica', () => {
    const state: OpdsDownloadState = { key: publicationEntry.id, status: 'error' }
    render(<OpdsEntryCard entry={publicationEntry} state={state} onDownload={vi.fn()} onOpenDownloaded={vi.fn()} />)

    expect(screen.getByText('Nao foi possivel baixar. Toque para tentar de novo.')).toBeTruthy()
  })

  it('mostra mensagem de offline quando o erro foi por falta de conexão, mesmo com errorMessage técnico presente', () => {
    const state: OpdsDownloadState = { key: publicationEntry.id, status: 'error', errorMessage: 'network fail', offline: true }
    render(<OpdsEntryCard entry={publicationEntry} state={state} onDownload={vi.fn()} onOpenDownloaded={vi.fn()} />)

    expect(screen.getByText('Sem conexao. Toque para tentar de novo.')).toBeTruthy()
    expect(screen.queryByText('network fail')).toBeNull()
  })

  it('cai pro fallback de texto quando a capa remota falha ao carregar', () => {
    render(<OpdsEntryCard entry={publicationEntry} state={stateFor('idle')} onDownload={vi.fn()} onOpenDownloaded={vi.fn()} />)

    const img = screen.getByRole('img')
    fireEvent.error(img)

    expect(screen.queryByRole('img')).toBeNull()
    expect(screen.getAllByText('Dune').length).toBeGreaterThan(0)
  })

  it('entry de navegação (pasta) mostra título e chama onOpenFolder ao tocar (FR-013)', () => {
    const onOpenFolder = vi.fn()
    render(
      <OpdsEntryCard
        entry={navigationEntry}
        state={{ key: navigationEntry.id, status: 'idle' }}
        onDownload={vi.fn()}
        onOpenDownloaded={vi.fn()}
        onOpenFolder={onOpenFolder}
      />,
    )

    expect(screen.getByText('Ficção Científica')).toBeTruthy()
    fireEvent.click(screen.getByRole('button'))
    expect(onOpenFolder).toHaveBeenCalledWith(navigationEntry)
  })

  it('OpdsFolderListRow mostra título e chama onOpenFolder ao tocar (layout de lista pra página só de pastas)', () => {
    const onOpenFolder = vi.fn()
    render(<OpdsFolderListRow entry={navigationEntry} onOpenFolder={onOpenFolder} />)

    expect(screen.getByText('Ficção Científica')).toBeTruthy()
    fireEvent.click(screen.getByRole('button'))
    expect(onOpenFolder).toHaveBeenCalledWith(navigationEntry)
  })
})
