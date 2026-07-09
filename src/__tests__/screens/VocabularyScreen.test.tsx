import { render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { VocabularyScreen } from '@/screens/VocabularyScreen'
import { getAllVocabItems, getVocabItemsByBookId } from '@/db/vocabulary'
import type { VocabItem } from '@/types/vocabulary'

const mocks = vi.hoisted(() => ({
  items: [] as VocabItem[],
}))

vi.mock('dexie-react-hooks', () => ({
  useLiveQuery: vi.fn((query: () => unknown) => {
    void query()
    return mocks.items
  }),
}))

vi.mock('@/db/vocabulary', () => ({
  deleteVocabItem: vi.fn(),
  getAllVocabItems: vi.fn(async () => mocks.items),
  getVocabItemsByBookId: vi.fn(async () => mocks.items),
}))

vi.mock('@/hooks/useCapacitorAppListener', () => ({
  useCapacitorBackButton: vi.fn(),
}))

vi.mock('@/components/AdBannerSlot', () => ({
  AdBannerSlot: () => <div data-testid="ad-banner" />,
}))

function makeVocabItem(overrides: Partial<VocabItem> = {}): VocabItem {
  return {
    id: 1,
    bookId: 1,
    bookTitle: 'Livro aberto',
    sourceText: 'Original text',
    translatedText: 'Texto traduzido',
    sourceLang: 'en',
    targetLang: 'pt-BR',
    createdAt: new Date('2026-01-01T00:00:00Z'),
    ...overrides,
  }
}

describe('VocabularyScreen', () => {
  beforeEach(() => {
    mocks.items = [makeVocabItem()]
  })

  it('lista todo o vocabulario quando nenhum livro e informado', () => {
    render(<VocabularyScreen onBack={vi.fn()} />)

    expect(getAllVocabItems).toHaveBeenCalledOnce()
    expect(getVocabItemsByBookId).not.toHaveBeenCalled()
    expect(screen.getByText('Original text')).toBeTruthy()
  })

  it('lista apenas o vocabulario do livro informado', () => {
    render(<VocabularyScreen onBack={vi.fn()} bookId={42} />)

    expect(getVocabItemsByBookId).toHaveBeenCalledWith(42)
    expect(getAllVocabItems).not.toHaveBeenCalled()
    expect(screen.getByText('Livro aberto')).toBeTruthy()
  })
})
