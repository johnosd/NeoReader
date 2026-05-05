import { describe, it, expect, beforeEach } from 'vitest'
import { useReaderStore } from '@/store/readerStore'

beforeEach(() => {
  useReaderStore.getState().reset()
})

describe('readerStore - estado inicial', () => {
  it('comeca com valores zerados', () => {
    const state = useReaderStore.getState()
    expect(state.cfi).toBe('')
    expect(state.percentage).toBe(0)
    expect(state.chapterPercentage).toBeNull()
    expect(state.toc).toEqual([])
    expect(state.tocLabel).toBe('')
  })
})

describe('readerStore - setCfi', () => {
  it('atualiza cfi, percentage e tocLabel', () => {
    useReaderStore.getState().setCfi('epubcfi(/6/4)', 42, 'Capitulo 2')

    const state = useReaderStore.getState()
    expect(state.cfi).toBe('epubcfi(/6/4)')
    expect(state.percentage).toBe(42)
    expect(state.chapterPercentage).toBeNull()
    expect(state.tocLabel).toBe('Capitulo 2')
  })

  it('atualiza a porcentagem do capitulo quando informada', () => {
    useReaderStore.getState().setCfi('epubcfi(/6/4)', 42, 'Capitulo 2', 67)

    expect(useReaderStore.getState().chapterPercentage).toBe(67)
  })

  it('usa string vazia quando tocLabel e undefined', () => {
    useReaderStore.getState().setCfi('epubcfi(/6/2)', 10, undefined)

    expect(useReaderStore.getState().tocLabel).toBe('')
  })
})

describe('readerStore - setToc', () => {
  it('atualiza a lista de capitulos', () => {
    const toc = [{ label: 'Intro', href: 'intro.xhtml', subitems: [] }]
    useReaderStore.getState().setToc(toc)

    expect(useReaderStore.getState().toc).toEqual(toc)
  })
})

describe('readerStore - reset', () => {
  it('limpa todo o estado para valores iniciais', () => {
    useReaderStore.getState().setCfi('epubcfi(/6/4)', 80, 'Epilogo', 95)
    useReaderStore.getState().setToc([{ label: 'Ch1', href: 'ch1.xhtml', subitems: [] }])

    useReaderStore.getState().reset()

    const state = useReaderStore.getState()
    expect(state.cfi).toBe('')
    expect(state.percentage).toBe(0)
    expect(state.chapterPercentage).toBeNull()
    expect(state.toc).toEqual([])
    expect(state.tocLabel).toBe('')
  })
})
