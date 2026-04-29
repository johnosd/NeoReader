import { render, screen, fireEvent } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { Book } from '@/types/book'

const mocks = vi.hoisted(() => ({
  libraryProps: null as Record<string, unknown> | null,
  bookDetailsProps: null as Record<string, unknown> | null,
  readerProps: null as Record<string, unknown> | null,
  vocabularyProps: null as Record<string, unknown> | null,
  settingsProps: null as Record<string, unknown> | null,
}))

const testBook: Book = {
  id: 1,
  title: 'Livro de Teste',
  author: 'Autor',
  fileBlob: new Blob(['epub']),
  addedAt: new Date(),
  lastOpenedAt: null,
}

vi.mock('@/screens/LibraryScreen', () => ({
  LibraryScreen: (props: Record<string, unknown>) => {
    mocks.libraryProps = props
    return (
      <div data-testid="library">
        <button data-testid="open-book" onClick={() => (props.onOpenBook as (b: Book) => void)(testBook)}>
          Abrir livro
        </button>
        <button data-testid="open-vocabulary" onClick={() => (props.onOpenVocabulary as () => void)()}>
          Vocabulário
        </button>
        <button data-testid="open-settings" onClick={() => (props.onOpenSettings as () => void)()}>
          Configurações
        </button>
      </div>
    )
  },
}))

vi.mock('@/screens/BookDetailsScreen', () => ({
  BookDetailsScreen: (props: Record<string, unknown>) => {
    mocks.bookDetailsProps = props
    return (
      <div data-testid="book-details">
        <button data-testid="back" onClick={() => (props.onBack as () => void)()}>Voltar</button>
        <button data-testid="read" onClick={() => (props.onRead as (b: Book) => void)(testBook)}>Ler</button>
        <button data-testid="open-settings" onClick={() => (props.onOpenSettings as () => void)()}>
          Configurações
        </button>
      </div>
    )
  },
}))

vi.mock('@/screens/ReaderScreen', () => ({
  ReaderScreen: (props: Record<string, unknown>) => {
    mocks.readerProps = props
    return (
      <div data-testid="reader">
        <button data-testid="back" onClick={() => (props.onBack as () => void)()}>Voltar</button>
        <button data-testid="open-vocabulary" onClick={() => (props.onOpenVocabulary as () => void)()}>
          Vocabulário
        </button>
      </div>
    )
  },
}))

vi.mock('@/screens/VocabularyScreen', () => ({
  VocabularyScreen: (props: Record<string, unknown>) => {
    mocks.vocabularyProps = props
    return (
      <div data-testid="vocabulary">
        <button data-testid="back" onClick={() => (props.onBack as () => void)()}>Voltar</button>
      </div>
    )
  },
}))

vi.mock('@/screens/SettingsScreen', () => ({
  SettingsScreen: (props: Record<string, unknown>) => {
    mocks.settingsProps = props
    return (
      <div data-testid="settings">
        <button data-testid="back" onClick={() => (props.onBack as () => void)()}>Voltar</button>
      </div>
    )
  },
}))

vi.mock('@/components/ui', () => ({
  ErrorBoundary: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}))

import App from '@/App'

function assertScreen(testId: string) {
  // getByTestId lança se não encontrar — serve como asserção
  screen.getByTestId(testId)
}

function assertNoScreen(testId: string) {
  expect(screen.queryByTestId(testId)).toBeNull()
}

describe('App — navigation stack', () => {
  beforeEach(() => {
    mocks.libraryProps = null
    mocks.bookDetailsProps = null
    mocks.readerProps = null
    mocks.vocabularyProps = null
    mocks.settingsProps = null
    render(<App />)
  })

  it('começa na biblioteca', () => {
    assertScreen('library')
    assertNoScreen('book-details')
    assertNoScreen('reader')
  })

  it('Library → BookDetails → Reader', () => {
    fireEvent.click(screen.getByTestId('open-book'))
    assertScreen('book-details')

    fireEvent.click(screen.getByTestId('read'))
    assertScreen('reader')
    assertNoScreen('book-details')
  })

  it('Reader → Back → BookDetails', () => {
    fireEvent.click(screen.getByTestId('open-book'))
    fireEvent.click(screen.getByTestId('read'))
    assertScreen('reader')

    fireEvent.click(screen.getByTestId('back'))
    assertScreen('book-details')
    assertNoScreen('reader')
  })

  it('BookDetails → Back → Library', () => {
    fireEvent.click(screen.getByTestId('open-book'))
    assertScreen('book-details')

    fireEvent.click(screen.getByTestId('back'))
    assertScreen('library')
    assertNoScreen('book-details')
  })

  it('Library → Vocabulary → Back → Library', () => {
    fireEvent.click(screen.getByTestId('open-vocabulary'))
    assertScreen('vocabulary')

    fireEvent.click(screen.getByTestId('back'))
    assertScreen('library')
    assertNoScreen('vocabulary')
  })

  it('Reader → Vocabulary → Back → Reader', () => {
    fireEvent.click(screen.getByTestId('open-book'))
    fireEvent.click(screen.getByTestId('read'))
    fireEvent.click(screen.getByTestId('open-vocabulary'))
    assertScreen('vocabulary')

    fireEvent.click(screen.getByTestId('back'))
    assertScreen('reader')
    assertNoScreen('vocabulary')
  })

  it('Library → Settings → Back → Library', () => {
    fireEvent.click(screen.getByTestId('open-settings'))
    assertScreen('settings')

    fireEvent.click(screen.getByTestId('back'))
    assertScreen('library')
  })

  it('BookDetails → Settings → Back → BookDetails (não Library)', () => {
    fireEvent.click(screen.getByTestId('open-book'))
    fireEvent.click(screen.getByTestId('open-settings'))
    assertScreen('settings')

    fireEvent.click(screen.getByTestId('back'))
    // Era o bug do settingsReturnScreen — agora pop() resolve corretamente
    assertScreen('book-details')
    assertNoScreen('library')
  })

  it('passa o livro correto para ReaderScreen', () => {
    fireEvent.click(screen.getByTestId('open-book'))
    fireEvent.click(screen.getByTestId('read'))

    expect(mocks.readerProps?.book).toEqual(expect.objectContaining({ id: 1, title: 'Livro de Teste' }))
  })
})
