import { db } from './database'
import type { Highlight } from '../types/highlight'

// Highlights são locais (feature 010) — sem scheduleXxxDriveSync, diferente de
// bookmarks/vocabulary. Não adicionar sync aqui sem revisitar o design.
export async function addHighlight(highlight: Omit<Highlight, 'id'>): Promise<number> {
  return db.highlights.add(highlight)
}

// Retorna os highlights de um livro ordenados pela posição em que aparecem no
// texto (não por data de criação) — é assim que a lista da tela de detalhes
// e a repintura por seção precisam deles.
export async function getHighlightsByBookId(bookId: number): Promise<Highlight[]> {
  const items = await db.highlights.where('bookId').equals(bookId).toArray()
  return items.sort((a, b) => a.percentage - b.percentage)
}

// Cor e estilo mudam independentemente (o menu de gerenciar aplica cada toque
// na hora, FR-022) — patch parcial em vez de duas funções quase idênticas.
export async function updateHighlightAppearance(
  id: number,
  patch: Partial<Pick<Highlight, 'color' | 'style'>>,
): Promise<void> {
  await db.highlights.update(id, patch)
}

export async function deleteHighlight(id: number): Promise<void> {
  await db.highlights.delete(id)
}

// Texto vazio/só espaço em branco remove a nota (undefined) em vez de gravar
// string vazia — evita uma "nota fantasma" sem conteúdo (feature 013, FR-006).
export async function updateHighlightNote(id: number, note: string | null): Promise<void> {
  const trimmed = note?.trim()
  await db.highlights.update(id, { note: trimmed || undefined })
}
