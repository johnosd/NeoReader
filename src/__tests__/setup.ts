import { vi, afterEach } from 'vitest'
import { cleanup } from '@testing-library/react'

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

// Flag global: quando definida, o próximo open() rejeitará com esse erro.
// Permite simular arquivos EPUB inválidos/corrompidos em testes de erro.
let _nextOpenError: Error | null = null

export function failNextOpen(err: Error) { _nextOpenError = err }

// Mock de foliate-view: custom element controlável pelos testes.
// A importação de 'foliate-js/view.js' registra o elemento real; aqui substituímos
// por uma implementação mínima que expõe fireFoliate() para disparar eventos sintéticos.
class FoliateViewMock extends HTMLElement {
  private _fCbs = new Map<string, Array<(e: { detail: unknown }) => void>>()

  // Intercepta addEventListener para 'load' e 'relocate' (eventos foliate-js)
  // Os outros eventos (resize etc.) seguem para o HTMLElement nativo.
  override addEventListener(
    event: string,
    cb: EventListenerOrEventListenerObject,
    options?: boolean | AddEventListenerOptions,
  ) {
    if (event === 'load' || event === 'relocate') {
      if (!this._fCbs.has(event)) this._fCbs.set(event, [])
      this._fCbs.get(event)!.push(cb as (e: { detail: unknown }) => void)
    } else {
      super.addEventListener(event, cb, options)
    }
  }

  // Permite ao teste disparar eventos foliate (load, relocate) com detail arbitrário
  fireFoliate(event: string, detail: unknown) {
    this._fCbs.get(event)?.forEach(cb => cb({ detail }))
  }

  // API do foliate-js usada pelo EpubViewer
  open = vi.fn(() => {
    if (_nextOpenError) {
      const err = _nextOpenError
      _nextOpenError = null
      return Promise.reject(err)
    }
    return Promise.resolve()
  })
  init = vi.fn(() => Promise.resolve())
  close = vi.fn()
  renderer = {
    setAttribute: vi.fn(),
    setStyles: vi.fn(),
  }
  book = {
    sections: Array(3).fill(null), // 3 seções = capítulos
    toc: [],
  }
}

if (!customElements.get('foliate-view')) {
  customElements.define('foliate-view', FoliateViewMock)
}

// Exporta o tipo para uso nos testes
export type { FoliateViewMock }
