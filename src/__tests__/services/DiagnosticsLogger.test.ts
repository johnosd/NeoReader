import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  createFlowId,
  logEvent,
  safeDiagnosticsJson,
  sanitizeDiagnosticsDetails,
} from '@/services/DiagnosticsLogger'

afterEach(() => {
  vi.restoreAllMocks()
})

function lastConsoleJson(spy: ReturnType<typeof vi.spyOn>) {
  const lastCall = spy.mock.calls.at(-1)
  if (!lastCall) throw new Error('Expected a console call.')
  return JSON.parse(String(lastCall[1])) as {
    eventName: string
    details?: Record<string, unknown>
  }
}

describe('DiagnosticsLogger', () => {
  it('cria flow ids estaveis e unicos por prefixo', () => {
    const first = createFlowId('reader open')
    const second = createFlowId('reader open')

    expect(first).toMatch(/^reader-open-/)
    expect(second).toMatch(/^reader-open-/)
    expect(first).not.toBe(second)
  })

  it('sanitiza secrets e URLs com query antes de logar', () => {
    const infoSpy = vi.spyOn(console, 'info').mockImplementation(() => undefined)

    logEvent('diagnostic.test', {
      details: {
        apiKey: 'secret-api-key',
        authorization: 'Bearer secret-token',
        url: 'https://api.example.com/search?api_key=secret-api-key&q=private+book+text',
      },
    })

    const event = lastConsoleJson(infoSpy)
    const serialized = JSON.stringify(event)

    expect(event.details?.apiKey).toBe('[redacted]')
    expect(event.details?.authorization).toBe('[redacted]')
    expect(event.details?.url).toBe('https://api.example.com/search?api_key=[redacted]&q=[redacted]')
    expect(serialized).not.toContain('secret-api-key')
    expect(serialized).not.toContain('private+book+text')
  })

  it('bloqueia texto de livro, traducao, audio e payload completo', () => {
    const sensitiveText = 'This is a private paragraph from the current book.'
    const sanitized = sanitizeDiagnosticsDetails({
      selectedText: sensitiveText,
      translatedText: 'Texto traduzido privado.',
      audioBase64: 'a'.repeat(200),
      payload: {
        body: sensitiveText,
      },
      textLength: sensitiveText.length,
    })
    const serialized = safeDiagnosticsJson(sanitized)

    expect(serialized).not.toContain(sensitiveText)
    expect(serialized).not.toContain('Texto traduzido privado')
    expect(sanitized.selectedText).toBe('[redacted:selectedtext]')
    expect(sanitized.translatedText).toBe('[redacted:translatedtext]')
    expect(sanitized.audioBase64).toBe('[redacted:audiobase64]')
    expect(sanitized.payload).toBe('[redacted:payload]')
    expect(sanitized.textLength).toBe(sensitiveText.length)
  })
})
