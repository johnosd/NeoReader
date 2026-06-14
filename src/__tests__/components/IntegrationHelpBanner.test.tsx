import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { IntegrationHelpBanner } from '@/components/IntegrationHelpBanner'

describe('IntegrationHelpBanner', () => {
  beforeEach(() => {
    window.localStorage.clear()
  })

  it('persiste dismiss por tipo de banner', () => {
    render(
      <IntegrationHelpBanner
        title="YouTube"
        description="Configure a key"
        actionLabel="Configurar"
        dismissId="youtube-test"
        onAction={vi.fn()}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: 'Dispensar' }))

    expect(screen.queryByText('YouTube')).toBeNull()
    expect(window.localStorage.getItem('neoreader:integration-banner:youtube-test')).toBe('1')

    render(
      <IntegrationHelpBanner
        title="YouTube"
        description="Configure a key"
        dismissId="youtube-test"
      />,
    )

    expect(screen.queryByText('YouTube')).toBeNull()
  })
})
