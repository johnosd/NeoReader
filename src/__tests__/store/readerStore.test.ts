import { describe, it, expect, beforeEach } from 'vitest'
import { useReaderStore } from '@/store/readerStore'

// Reseta o store Zustand antes de cada teste para garantir isolamento
beforeEach(() => {
  useReaderStore.getState().reset()
})

describe('readerStore — estado inicial', () => {
  it('começa com valores zerados', () => {
    const state = useReaderStore.getState()
    expect(state.cfi).toBe('')
    expect(state.percentage).toBe(0)
    expect(state.toc).toEqual([])
    expect(state.tocLabel).toBe('')
  })
})

describe('readerStore — setCfi', () => {
  it('atualiza cfi, percentage e tocLabel', () => {
    useReaderStore.getState().setCfi('epubcfi(/6/4)', 42, 'Capítulo 2')

    const state = useReaderStore.getState()
    expect(state.cfi).toBe('epubcfi(/6/4)')
    expect(state.percentage).toBe(42)
    expect(state.tocLabel).toBe('Capítulo 2')
  })

  it('usa string vazia quando tocLabel é undefined', () => {
    useReaderStore.getState().setCfi('epubcfi(/6/2)', 10, undefined)

    expect(useReaderStore.getState().tocLabel).toBe('')
  })
})

describe('readerStore — setToc', () => {
  it('atualiza a lista de capítulos', () => {
    const toc = [{ label: 'Intro', href: 'intro.xhtml', subitems: [] }]
    useReaderStore.getState().setToc(toc)

    expect(useReaderStore.getState().toc).toEqual(toc)
  })
})

describe('readerStore — reset', () => {
  it('limpa todo o estado para valores iniciais', () => {
    useReaderStore.getState().setCfi('epubcfi(/6/4)', 80, 'Epílogo')
    useReaderStore.getState().setToc([{ label: 'Ch1', href: 'ch1.xhtml', subitems: [] }])

    useReaderStore.getState().reset()

    const state = useReaderStore.getState()
    expect(state.cfi).toBe('')
    expect(state.percentage).toBe(0)
    expect(state.toc).toEqual([])
    expect(state.tocLabel).toBe('')
  })
})
