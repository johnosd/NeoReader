import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { ImageZoomModal } from '@/components/reader/ImageZoomModal'

describe('ImageZoomModal', () => {
  it('renderiza imagem com dialog acessivel e foco no botao fechar', () => {
    render(
      <ImageZoomModal
        src="blob:reader-image"
        alt="Mapa do capitulo"
        onClose={vi.fn()}
      />,
    )

    const dialog = screen.getByRole('dialog', { name: 'Imagem do leitor' })
    const closeButton = screen.getByRole('button', { name: 'Fechar' })

    expect(dialog.getAttribute('aria-modal')).toBe('true')
    expect(screen.getByRole('img', { name: 'Mapa do capitulo' })).toBeTruthy()
    expect(document.activeElement).toBe(closeButton)
  })

  it('fecha pelo botao e pela tecla Escape', () => {
    const onClose = vi.fn()

    render(
      <ImageZoomModal
        src="blob:reader-image"
        onClose={onClose}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: 'Fechar' }))
    fireEvent.keyDown(document, { key: 'Escape' })

    expect(onClose).toHaveBeenCalledTimes(2)
  })

  it('nao fecha ao tocar na imagem, mas fecha ao tocar no fundo', () => {
    const onClose = vi.fn()

    render(
      <ImageZoomModal
        src="blob:reader-image"
        alt="Ilustracao"
        onClose={onClose}
      />,
    )

    fireEvent.click(screen.getByRole('img', { name: 'Ilustracao' }))
    expect(onClose).not.toHaveBeenCalled()

    fireEvent.click(screen.getByRole('dialog', { name: 'Imagem do leitor' }))
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('permite ampliar com gesto de pinca e arrastar a imagem ampliada', () => {
    const onClose = vi.fn()

    render(
      <ImageZoomModal
        src="blob:reader-image"
        alt="Ilustracao"
        onClose={onClose}
      />,
    )

    const image = screen.getByRole('img', { name: 'Ilustracao' })
    const surface = image.parentElement as HTMLElement

    fireEvent.pointerDown(surface, {
      pointerId: 1,
      pointerType: 'touch',
      clientX: 100,
      clientY: 100,
      button: 0,
    })
    fireEvent.pointerDown(surface, {
      pointerId: 2,
      pointerType: 'touch',
      clientX: 200,
      clientY: 100,
      button: 0,
    })
    fireEvent.pointerMove(surface, {
      pointerId: 2,
      pointerType: 'touch',
      clientX: 300,
      clientY: 100,
      button: 0,
    })

    expect(image.style.transform).toContain('scale(2)')

    const transformAfterPinch = image.style.transform

    fireEvent.pointerUp(surface, {
      pointerId: 2,
      pointerType: 'touch',
      clientX: 300,
      clientY: 100,
      button: 0,
    })
    fireEvent.pointerMove(surface, {
      pointerId: 1,
      pointerType: 'touch',
      clientX: 140,
      clientY: 125,
      button: 0,
    })

    expect(image.style.transform).not.toBe(transformAfterPinch)
    expect(image.style.transform).toContain('scale(2)')
    expect(onClose).not.toHaveBeenCalled()
  })
})
