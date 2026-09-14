import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { TtsMiniPlayer } from '@/components/reader/TtsMiniPlayer'

function renderMiniPlayer(bottomOffsetPx = 0, isTranslated = false) {
  return render(
    <TtsMiniPlayer
      isPlaying={false}
      activeProvider="native"
      providerAvailability={{
        native: true,
        speechify: false,
        elevenlabs: false,
        fishaudio: false,
      }}
      isTranslated={isTranslated}
      ttsRate={1}
      showBackToTtsLocation={false}
      bottomOffsetPx={bottomOffsetPx}
      onPlayPause={vi.fn()}
      onBackToTtsLocation={vi.fn()}
      onPrevParagraph={vi.fn()}
      onPrevSentence={vi.fn()}
      onNextSentence={vi.fn()}
      onNextParagraph={vi.fn()}
      onProviderChange={vi.fn()}
      onRateChange={vi.fn()}
      onStop={vi.fn()}
    />,
  )
}

describe('TtsMiniPlayer', () => {
  it('aplica offset inferior quando informado', () => {
    renderMiniPlayer(22)

    expect(screen.getByTestId('tts-mini-player').style.bottom).toBe('22px')
  })

  it('mantem o rodape padrao sem offset', () => {
    renderMiniPlayer()

    expect(screen.getByTestId('tts-mini-player').style.bottom).toBe('0px')
  })

  it('mostra o indicador de leitura traduzida quando isTranslated=true (feature 018)', () => {
    renderMiniPlayer(0, true)

    expect(screen.getByLabelText('Lendo traduzido')).toBeTruthy()
  })

  it('não mostra o indicador de leitura traduzida por padrão', () => {
    renderMiniPlayer()

    expect(screen.queryByLabelText('Lendo traduzido')).toBeNull()
  })
})
