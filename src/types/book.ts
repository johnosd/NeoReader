// Representa um livro armazenado no IndexedDB
export interface Book {
  id?: number          // auto-increment pelo Dexie
  title: string
  author: string
  coverBlob: Blob | null  // imagem da capa extraída do EPUB
  fileBlob: Blob          // arquivo .epub completo
  addedAt: Date
  lastOpenedAt: Date | null
  isFavorite?: boolean    // marcado pelo usuário na tela de detalhes
}

// Configurações específicas de leitura por livro
export interface BookSettings {
  id?: number
  bookId: number
  fontSize: import('./settings').FontSize
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
  snippet?: string       // trecho inicial do ponto salvo (max 150 chars) para contexto na lista
  color?: string         // 'indigo' | 'emerald' | 'amber' | 'rose'
  updatedAt?: Date       // ausente em registros antigos — fallback para createdAt
  deletedAt?: Date | null // soft delete: bookmark removido, mas preservado para restore/futuro sync
  // Campos legados do fluxo antigo — mantidos apenas para compatibilidade com dados existentes
  sectionIndex?: number
  paraIndex?: number
  createdAt: Date
}
