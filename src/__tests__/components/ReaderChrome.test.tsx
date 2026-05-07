import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { ReaderChrome } from '@/components/reader/ReaderChrome'

function renderChrome(overrides: Partial<Parameters<typeof ReaderChrome>[0]> = {}) {
  return render(
    <ReaderChrome
      visible
      title="Test Book"
      percentage={18}
      chapterPercentage={42}
      fontSize="md"
      bookmarkCount={3}
      ttsIsPlaying={false}
      ttsEngine="native"
      onBack={vi.fn()}
      onAppearanceOpen={vi.fn()}
      onBookmarkList={vi.fn()}
      onTocOpen={vi.fn()}
      onOpenVocabulary={vi.fn()}
      onTtsToggle={vi.fn()}
      onDismiss={vi.fn()}
      {...overrides}
    />,
  )
}

describe('ReaderChrome', () => {
  it('mostra progresso global e progresso do capitulo no topo', () => {
    renderChrome()

    expect(screen.getByText('Livro 18%')).toBeTruthy()
    expect(screen.getByText('Cap. 42%')).toBeTruthy()
    expect(screen.getByText('3 marcadores')).toBeTruthy()
  })

  it('omite o badge de capitulo quando o valor nao esta disponivel', () => {
    renderChrome({ chapterPercentage: null })

    expect(screen.getByText('Livro 18%')).toBeTruthy()
    expect(screen.queryByText(/Cap\./)).toBeNull()
  })
})
