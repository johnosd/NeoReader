import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../db/database'
import type { Book } from '../types/book'

// useLiveQuery é como um SELECT reativo: re-renderiza automaticamente
// quando os dados no IndexedDB mudam. Equivale a um Observable/stream.
export function useLibrary(): { books: Book[] | undefined; isEmpty: boolean } {
  const books = useLiveQuery(
    () => db.books.orderBy('addedAt').reverse().toArray(),
    [], // dependências — array vazio = roda uma vez e fica observando
  )

  return {
    books,
    // undefined = ainda carregando; [] = carregado e vazio
    isEmpty: books !== undefined && books.length === 0,
  }
}
