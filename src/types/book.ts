// Representa um livro armazenado no IndexedDB
export interface Book {
  id?: number          // auto-increment pelo Dexie
  title: string
  author: string
  coverBlob: Blob | null  // imagem da capa extraída do EPUB
  fileBlob: Blob          // arquivo .epub completo
  addedAt: Date
  lastOpenedAt: Date | null
}

// Progresso de leitura — CFI é o "endereço" de um ponto no EPUB
export interface ReadingProgress {
  id?: number
  bookId: number
  cfi: string       // EPUB Canonical Fragment Identifier (ex: "epubcfi(/6/4!/4/2/2:0)")
  percentage: number // 0-100
  updatedAt: Date
}

// Marcador salvo pelo usuário em uma posição específica do livro
export interface Bookmark {
  id?: number
  bookId: number
  cfi: string
  label: string       // nome do capítulo atual ou "X%" como fallback
  percentage: number  // para exibição na lista
  // Campos opcionais (ausentes em registros antigos — backward compat)
  sectionIndex?: number  // índice da spine; permite filtrar bookmarks por seção
  paraIndex?: number     // índice do parágrafo na seção; usado para injetar marcador visual
  snippet?: string       // trecho inicial do parágrafo (max 150 chars) para contexto na lista
  color?: string         // 'indigo' | 'emerald' | 'amber' | 'rose'
  createdAt: Date
}
