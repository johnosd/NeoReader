import { useState } from 'react'
import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { PinPad } from '@/components/PinPad'

function Harness({ onChange, disabled }: { onChange?: (value: string) => void; disabled?: boolean }) {
  const [value, setValue] = useState('')
  return (
    <PinPad
      value={value}
      disabled={disabled}
      onChange={(next) => { setValue(next); onChange?.(next) }}
    />
  )
}

describe('PinPad', () => {
  it('digitar monta o PIN e apagar remove o último dígito', () => {
    const onChange = vi.fn()
    render(<Harness onChange={onChange} />)

    fireEvent.click(screen.getByRole('button', { name: 'Dígito 1' }))
    fireEvent.click(screen.getByRole('button', { name: 'Dígito 2' }))
    fireEvent.click(screen.getByRole('button', { name: 'Dígito 0' }))
    expect(onChange).toHaveBeenLastCalledWith('120')

    fireEvent.click(screen.getByRole('button', { name: 'Apagar último dígito' }))
    expect(onChange).toHaveBeenLastCalledWith('12')
  })

  it('limita o PIN a 6 dígitos', () => {
    const onChange = vi.fn()
    render(<Harness onChange={onChange} />)

    for (const digit of '1234567') {
      fireEvent.click(screen.getByRole('button', { name: `Dígito ${digit}` }))
    }

    expect(onChange).toHaveBeenLastCalledWith('123456')
  })

  it('desabilitado ignora toques', () => {
    const onChange = vi.fn()
    render(<Harness onChange={onChange} disabled />)

    fireEvent.click(screen.getByRole('button', { name: 'Dígito 5' }))

    expect(onChange).not.toHaveBeenCalled()
  })

  it('anuncia só a quantidade de dígitos, nunca os dígitos', () => {
    render(<Harness />)
    fireEvent.click(screen.getByRole('button', { name: 'Dígito 7' }))
    fireEvent.click(screen.getByRole('button', { name: 'Dígito 3' }))

    const status = screen.getByRole('status')
    expect(status.textContent).toBe('2 dígitos digitados')
    expect(document.body.textContent).not.toContain('73')
  })

  it('aceita o teclado físico', () => {
    const onChange = vi.fn()
    render(<Harness onChange={onChange} />)

    const group = screen.getByRole('group', { name: 'Teclado numérico do PIN' })
    fireEvent.keyDown(group, { key: '4' })
    fireEvent.keyDown(group, { key: '9' })
    fireEvent.keyDown(group, { key: 'Backspace' })

    expect(onChange).toHaveBeenLastCalledWith('4')
  })
})
