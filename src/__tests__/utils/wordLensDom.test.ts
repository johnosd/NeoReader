import { describe, expect, it, vi } from 'vitest'

import type { WordLensData } from '@/types/wordLens'
import { scheduleWordLensDocument } from '@/utils/wordLensDom'

const data: WordLensData = {
  levels: {
    apple: 1,
    acquire: 3,
    elaborate: 4,
    ubiquitous: 5,
    aberration: 6,
  },
  lemmas: { acquired: 'acquire' },
  packVersion: 'test',
}

function makeDocument(html: string): Document {
  return new DOMParser().parseFromString(`<html><body>${html}</body></html>`, 'text/html')
}

describe('wordLensDom', () => {
  it('marca somente palavras estritamente acima do nível sem alterar o texto', async () => {
    const doc = makeDocument('<p>Apple acquired elaborate ubiquitous aberration.</p>')
    const originalText = doc.body.textContent
    const metrics = await scheduleWordLensDocument(doc, {
      enabled: true,
      level: 'B1',
      data,
    }).completed

    expect(Array.from(doc.querySelectorAll('.nr-word-lens')).map((el) => el.textContent))
      .toEqual(['elaborate', 'ubiquitous', 'aberration'])
    expect(doc.body.textContent).toBe(originalText)
    expect(doc.querySelector('.nr-word-lens')?.getAttribute('data-nr-lemma')).toBe('elaborate')
    expect(metrics).toMatchObject({ cancelled: false, textNodes: 1, tokens: 5, matches: 3 })
  })

  it('preserva elementos inline e ignora subárvores reservadas', async () => {
    const doc = makeDocument(`
      <p>Before <em>ubiquitous</em> after.</p>
      <p class="nr-vocab">ubiquitous</p>
      <div id="nr-translation-block">aberration</div>
      <p><span class="nr-tts-word">elaborate</span></p>
      <script>ubiquitous</script>
      <p><img alt="ubiquitous">aberration</p>
    `)
    await scheduleWordLensDocument(doc, { enabled: true, level: 'B1', data }).completed

    expect(doc.querySelector('em > .nr-word-lens')?.textContent).toBe('ubiquitous')
    expect(doc.querySelector('.nr-vocab .nr-word-lens')).toBeNull()
    expect(doc.querySelector('#nr-translation-block .nr-word-lens')).toBeNull()
    expect(doc.querySelector('.nr-tts-word .nr-word-lens')).toBeNull()
    expect(doc.querySelectorAll('.nr-word-lens')).toHaveLength(2)
    expect(doc.querySelector('img')).not.toBeNull()
  })

  it('é idempotente e reaplica um nível novo depois de limpar a geração anterior', async () => {
    const doc = makeDocument('<p>elaborate ubiquitous aberration</p>')
    await scheduleWordLensDocument(doc, { enabled: true, level: 'B1', data }).completed
    await scheduleWordLensDocument(doc, { enabled: true, level: 'C1', data }).completed

    expect(Array.from(doc.querySelectorAll('.nr-word-lens')).map((el) => el.textContent))
      .toEqual(['aberration'])
    expect(doc.querySelector('.nr-word-lens .nr-word-lens')).toBeNull()
  })

  it('remove resultados parciais quando desligado ou em C2', async () => {
    const doc = makeDocument('<p><span class="nr-word-lens" data-nr-cefr-level="C1">ubiquitous</span></p>')
    await scheduleWordLensDocument(doc, { enabled: false, level: 'B1', data: null }).completed
    expect(doc.querySelector('.nr-word-lens')).toBeNull()
    expect(doc.body.textContent).toBe('ubiquitous')

    await scheduleWordLensDocument(doc, { enabled: true, level: 'C2', data }).completed
    expect(doc.querySelector('.nr-word-lens')).toBeNull()
  })

  it('cancela lote obsoleto sem continuar processando', async () => {
    const doc = makeDocument(`<p>${'ubiquitous '.repeat(2_000)}</p>`)
    const task = scheduleWordLensDocument(doc, { enabled: true, level: 'B1', data, batchBudgetMs: 1 })
    task.cancel()

    await expect(task.completed).resolves.toMatchObject({ cancelled: true })
    expect(doc.querySelector('.nr-word-lens')).toBeNull()
  })

  it('executa somente uma operacao quando o callback idle expira', async () => {
    const doc = makeDocument('<p>elaborate ubiquitous aberration</p>')
    const callbacks: Array<(deadline: { didTimeout: boolean; timeRemaining(): number }) => void> = []
    const requestIdleCallback = vi.fn((callback: (deadline: { didTimeout: boolean; timeRemaining(): number }) => void) => {
      callbacks.push(callback)
      return callbacks.length
    })
    Object.defineProperty(doc, 'defaultView', {
      configurable: true,
      value: {
        performance,
        requestIdleCallback,
        cancelIdleCallback: vi.fn(),
      },
    })

    const task = scheduleWordLensDocument(doc, { enabled: true, level: 'B1', data })
    let callbacksRun = 0
    while (callbacks.length > 0 && callbacksRun < 20) {
      callbacks.shift()!({ didTimeout: true, timeRemaining: () => 0 })
      callbacksRun += 1
    }

    const metrics = await task.completed
    expect(metrics.matches).toBe(3)
    expect(callbacksRun).toBeGreaterThan(3)
    expect(requestIdleCallback).toHaveBeenCalledTimes(callbacksRun)
    expect(doc.querySelectorAll('.nr-word-lens')).toHaveLength(3)
  })

  it('mantém lotes limitados no benchmark de capítulo grande', async () => {
    // Mais de 64 matches força múltiplos lotes mesmo em uma única Text node,
    // sem monopolizar o runner paralelo com milhares de mutações jsdom.
    const doc = makeDocument(`<p>${'Apple ubiquitous aberration. '.repeat(100)}</p>`)
    const metrics = await scheduleWordLensDocument(doc, {
      enabled: true,
      level: 'B1',
      data,
      batchBudgetMs: 4,
    }).completed

    expect(metrics.matches).toBe(200)
    expect(metrics.maxBatchOperations).toBeLessThanOrEqual(4)
    expect(doc.querySelectorAll('.nr-word-lens')).toHaveLength(200)
  })
})
