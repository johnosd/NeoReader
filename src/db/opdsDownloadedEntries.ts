import { db } from './database'
import { getBookById } from './books'

export async function recordDownload(catalogId: number, entryId: string, bookId: number): Promise<void> {
  await db.opdsDownloadedEntries.add({ catalogId, entryId, bookId, downloadedAt: new Date() })
}

// Devolve o bookId só se o vínculo existir E o Book referenciado ainda
// existir de fato — o usuário pode ter removido o livro da Biblioteca depois
// do download, e nesse caso o item deve voltar a aparecer como não baixado
// (mesmo espírito da reconciliação por findBookByFileName da feature 002).
export async function findDownloadedBookId(catalogId: number, entryId: string): Promise<number | null> {
  const entry = await db.opdsDownloadedEntries.where('[catalogId+entryId]').equals([catalogId, entryId]).first()
  if (entry == null) return null

  const book = await getBookById(entry.bookId)
  return book ? entry.bookId : null
}
