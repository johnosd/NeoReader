import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Highlight } from '@/types/highlight'

const mocks = vi.hoisted(() => {
  const byBookToArray = vi.fn()
  return {
    add: vi.fn(async () => 1),
    update: vi.fn(async () => undefined),
    delete: vi.fn(async () => undefined),
    byBookToArray,
    whereEquals: vi.fn(() => ({ toArray: byBookToArray })),
  }
})

vi.mock('@/db/database', () => ({
  db: {
    highlights: {
      add: mocks.add,
      update: mocks.update,
      delete: mocks.delete,
      where: vi.fn(() => ({ equals: mocks.whereEquals })),
    },
  },
}))

import { addHighlight, deleteHighlight, getHighlightsByBookId, updateHighlightAppearance, updateHighlightNote } from '@/db/highlights'

function makeHighlight(overrides: Partial<Highlight> = {}): Omit<Highlight, 'id'> {
  return {
    bookId: 42,
    cfi: 'epubcfi(/6/8!/4/2/10/2,/1:0,/1:20)',
    paraCfi: 'epubcfi(/6/8!/4/2/10/2:0)',
    text: 'texto selecionado',
    color: 'indigo',
    sectionIndex: 0,
    percentage: 10,
    createdAt: new Date('2026-09-06T00:00:00Z'),
    ...overrides,
  }
}

describe('highlights repository', () => {
  beforeEach(() => {
    mocks.add.mockClear()
    mocks.update.mockClear()
    mocks.delete.mockClear()
    mocks.byBookToArray.mockReset()
    mocks.whereEquals.mockClear()
  })

  it('cria highlight local, sem nenhum agendamento de sync', async () => {
    await expect(addHighlight(makeHighlight())).resolves.toBe(1)

    expect(mocks.add).toHaveBeenCalledWith(expect.objectContaining({
      bookId: 42,
      cfi: 'epubcfi(/6/8!/4/2/10/2,/1:0,/1:20)',
      color: 'indigo',
    }))
  })

  it('retorna os highlights de um livro ordenados pela posicao no texto, nao por data', async () => {
    mocks.byBookToArray.mockResolvedValue([
      { id: 1, ...makeHighlight({ percentage: 80, createdAt: new Date('2026-09-01T00:00:00Z') }) },
      { id: 2, ...makeHighlight({ percentage: 10, createdAt: new Date('2026-09-06T00:00:00Z') }) },
      { id: 3, ...makeHighlight({ percentage: 45, createdAt: new Date('2026-09-03T00:00:00Z') }) },
    ])

    const items = await getHighlightsByBookId(42)

    expect(mocks.whereEquals).toHaveBeenCalledWith(42)
    expect(items.map((item) => item.id)).toEqual([2, 3, 1])
  })

  // FR-016: dois highlights com intervalos sobrepostos coexistem como registros
  // distintos — nenhum merge, nenhuma recusa de criação. Ancora o comportamento
  // caso alguém tente "otimizar" com dedupe por CFI mais adiante.
  it('mantem highlights sobrepostos (inclusive com o mesmo inicio) como registros independentes', async () => {
    const overlapping = makeHighlight({ cfi: 'epubcfi(/6/8!/4/2/10/2,/1:0,/1:30)', percentage: 10 })
    const sameStart = makeHighlight({ cfi: 'epubcfi(/6/8!/4/2/10/2,/1:0,/1:12)', percentage: 10 })

    mocks.add.mockResolvedValueOnce(1).mockResolvedValueOnce(2)

    await expect(addHighlight(overlapping)).resolves.toBe(1)
    await expect(addHighlight(sameStart)).resolves.toBe(2)

    expect(mocks.add).toHaveBeenCalledTimes(2)
    expect(mocks.add).toHaveBeenNthCalledWith(1, expect.objectContaining({ cfi: overlapping.cfi }))
    expect(mocks.add).toHaveBeenNthCalledWith(2, expect.objectContaining({ cfi: sameStart.cfi }))
  })

  it('atualiza a cor de um highlight', async () => {
    await updateHighlightAppearance(7, { color: 'rose' })

    expect(mocks.update).toHaveBeenCalledWith(7, { color: 'rose' })
  })

  it('atualiza o estilo de um highlight', async () => {
    await updateHighlightAppearance(7, { style: 'underline' })

    expect(mocks.update).toHaveBeenCalledWith(7, { style: 'underline' })
  })

  // FR-007 (feature 013): nota vive no mesmo registro do highlight — apagar o
  // highlight já apaga a nota junto, sem cascata dedicada. Esta chamada é a
  // mesma de antes; a garantia vem da modelagem (ver plan.md), não de lógica
  // nova aqui.
  it('remove um highlight permanentemente (sem soft delete) — nota vai junto, mesma linha', async () => {
    await deleteHighlight(7)

    expect(mocks.delete).toHaveBeenCalledWith(7)
  })

  it('grava a nota de um highlight, trimada', async () => {
    await updateHighlightNote(7, '  Reflexão sobre o trecho.  ')

    expect(mocks.update).toHaveBeenCalledWith(7, { note: 'Reflexão sobre o trecho.' })
  })

  it('remove a nota ao salvar null (FR-006)', async () => {
    await updateHighlightNote(7, null)

    expect(mocks.update).toHaveBeenCalledWith(7, { note: undefined })
  })

  it('remove a nota ao salvar só espaços em branco (FR-006)', async () => {
    await updateHighlightNote(7, '   ')

    expect(mocks.update).toHaveBeenCalledWith(7, { note: undefined })
  })
})
