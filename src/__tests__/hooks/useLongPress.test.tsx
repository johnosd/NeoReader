import { act, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useLongPress } from '@/hooks/useLongPress'

function Pressable({ onLongPress, onClick }: { onLongPress: () => void; onClick: () => void }) {
  const handlers = useLongPress({ onLongPress })
  return (
    <div {...handlers}>
      <button type="button" onClick={onClick}>livro</button>
    </div>
  )
}

function setup() {
  const onLongPress = vi.fn()
  const onClick = vi.fn()
  render(<Pressable onLongPress={onLongPress} onClick={onClick} />)
  return { onLongPress, onClick, target: screen.getByRole('button', { name: 'livro' }) }
}

describe('useLongPress', () => {
  beforeEach(() => { vi.useFakeTimers() })
  afterEach(() => { vi.useRealTimers() })

  it('dispara onLongPress depois de 500 ms segurando', () => {
    const { onLongPress, target } = setup()
    fireEvent.pointerDown(target, { button: 0, clientX: 10, clientY: 10 })
    act(() => { vi.advanceTimersByTime(499) })
    expect(onLongPress).not.toHaveBeenCalled()
    act(() => { vi.advanceTimersByTime(1) })
    expect(onLongPress).toHaveBeenCalledTimes(1)
  })

  it('não dispara se o dedo soltar antes do tempo', () => {
    const { onLongPress, target } = setup()
    fireEvent.pointerDown(target, { button: 0, clientX: 10, clientY: 10 })
    act(() => { vi.advanceTimersByTime(300) })
    fireEvent.pointerUp(target)
    act(() => { vi.advanceTimersByTime(500) })
    expect(onLongPress).not.toHaveBeenCalled()
  })

  it('movimento acima de 10 px (scroll) cancela o long-press', () => {
    const { onLongPress, target } = setup()
    fireEvent.pointerDown(target, { button: 0, clientX: 10, clientY: 10 })
    fireEvent.pointerMove(target, { clientX: 10, clientY: 25 })
    act(() => { vi.advanceTimersByTime(600) })
    expect(onLongPress).not.toHaveBeenCalled()
  })

  it('tremida pequena do dedo (até 10 px) não cancela', () => {
    const { onLongPress, target } = setup()
    fireEvent.pointerDown(target, { button: 0, clientX: 10, clientY: 10 })
    fireEvent.pointerMove(target, { clientX: 14, clientY: 16 })
    act(() => { vi.advanceTimersByTime(500) })
    expect(onLongPress).toHaveBeenCalledTimes(1)
  })

  it('pointercancel (browser assumiu o scroll) cancela o long-press', () => {
    const { onLongPress, target } = setup()
    fireEvent.pointerDown(target, { button: 0, clientX: 10, clientY: 10 })
    fireEvent.pointerCancel(target)
    act(() => { vi.advanceTimersByTime(600) })
    expect(onLongPress).not.toHaveBeenCalled()
  })

  it('botão direito do mouse não inicia long-press', () => {
    const { onLongPress, target } = setup()
    fireEvent.pointerDown(target, { button: 2, clientX: 10, clientY: 10 })
    act(() => { vi.advanceTimersByTime(600) })
    expect(onLongPress).not.toHaveBeenCalled()
  })

  it('engole o click que vem ao soltar o dedo depois do long-press', () => {
    const { onLongPress, onClick, target } = setup()
    fireEvent.pointerDown(target, { button: 0, clientX: 10, clientY: 10 })
    act(() => { vi.advanceTimersByTime(500) })
    fireEvent.pointerUp(target)
    fireEvent.click(target)
    expect(onLongPress).toHaveBeenCalledTimes(1)
    expect(onClick).not.toHaveBeenCalled()
  })

  it('toque curto continua chamando o onClick normal', () => {
    const { onClick, target } = setup()
    fireEvent.pointerDown(target, { button: 0, clientX: 10, clientY: 10 })
    fireEvent.pointerUp(target)
    fireEvent.click(target)
    expect(onClick).toHaveBeenCalledTimes(1)
  })

  it('soltar fora do elemento após long-press não engole o próximo toque', () => {
    const { onClick, target } = setup()
    fireEvent.pointerDown(target, { button: 0, clientX: 10, clientY: 10 })
    act(() => { vi.advanceTimersByTime(500) })
    // Sem click aqui: o dedo saiu do elemento antes de soltar.
    fireEvent.pointerDown(target, { button: 0, clientX: 10, clientY: 10 })
    fireEvent.pointerUp(target)
    fireEvent.click(target)
    expect(onClick).toHaveBeenCalledTimes(1)
  })

  it('bloqueia o menu de contexto nativo', () => {
    const { target } = setup()
    const event = new MouseEvent('contextmenu', { bubbles: true, cancelable: true })
    target.dispatchEvent(event)
    expect(event.defaultPrevented).toBe(true)
  })
})
