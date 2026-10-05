import { render } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { AddBookButton } from '@/components/AddBookButton'
import { I18nProvider } from '@/i18n'

vi.mock('@capacitor/core', () => ({
  Capacitor: { isNativePlatform: vi.fn(() => false) },
  registerPlugin: vi.fn(() => ({})),
}))

describe('AddBookButton (feature 022)', () => {
  it('o seletor de arquivo aceita EPUB e PDF', () => {
    const { container } = render(
      <I18nProvider>
        <AddBookButton />
      </I18nProvider>,
    )
    const accept = container.querySelector<HTMLInputElement>('input[type="file"]')!.accept
    expect(accept).toContain('.epub')
    expect(accept).toContain('.pdf')
    expect(accept).toContain('application/pdf')
  })
})
