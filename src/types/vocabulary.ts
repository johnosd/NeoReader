// Palavra ou frase salva pelo usuário a partir de uma tradução no leitor
export interface VocabItem {
  id?: number
  bookId: number
  bookTitle: string      // denormalizado — evita join ao listar o vocabulário
  sourceText: string     // parágrafo/frase original em inglês
  translatedText: string // tradução em português
  sourceLang: string     // 'en'
  targetLang: string     // 'pt-BR'
  createdAt: Date
}

// Cache de traduções no IndexedDB para evitar chamadas repetidas à API
export interface TranslationCache {
  id?: number
  textHash: number       // djb2 hash de (langpair + sourceText) — chave de lookup
  sourceText: string
  translatedText: string
  sourceLang: string
  targetLang: string
  createdAt: Date
}
