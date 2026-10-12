import { db } from './database'
import { getBookById } from './books'

// Upsert por [catalogId+entryId] (índice único): re-download depois de excluir
// o livro, ou banco com vínculo órfão de versões antigas, só atualiza o bookId
// em vez de estourar ConstraintError com `add` (R06). Transação rw para o
// get+update/add não intercalar com outra escrita.
export async function recordDownload(catalogId: number, entryId: string, bookId: number): Promise<void> {
  await db.transaction('rw', db.opdsDownloadedEntries, async () => {
    const existing = await db.opdsDownloadedEntries.where('[catalogId+entryId]').equals([catalogId, entryId]).first()
    if (existing?.id != null) {
      await db.opdsDownloadedEntries.update(existing.id, { bookId, downloadedAt: new Date() })
      return
    }
    await db.opdsDownloadedEntries.add({ catalogId, entryId, bookId, downloadedAt: new Date() })
  })
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
