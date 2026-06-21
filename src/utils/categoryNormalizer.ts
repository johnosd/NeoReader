import type { BookCategory } from '../types/bookInfo'

// Ordem de exibição das rows na Home (do mais popular para o mais nichado)
export const CANONICAL_GENRE_ORDER = [
  'fiction',
  'mystery',
  'sci-fi-fantasy',
  'romance',
  'nonfiction',
  'business',
  'self-help',
  'history-bio',
  'science-tech',
  'kids-ya',
] as const

export type CanonicalGenre = typeof CANONICAL_GENRE_ORDER[number]

export const GENRE_LABELS: Record<CanonicalGenre, string> = {
  'fiction': 'Fiction',
  'mystery': 'Mystery & Thriller',
  'sci-fi-fantasy': 'Sci-Fi & Fantasy',
  'romance': 'Romance',
  'nonfiction': 'Non-Fiction',
  'business': 'Business',
  'self-help': 'Self-Help',
  'history-bio': 'History & Biography',
  'science-tech': 'Science & Tech',
  'kids-ya': 'Children & YA',
}

// Ordem importa: regras mais específicas primeiro para evitar falsos positivos.
// Ex: "juvenile fiction" deve cair em kids-ya, não em fiction.
const KEYWORD_MAP: Array<{ keywords: string[]; genre: CanonicalGenre }> = [
  {
    keywords: ['children', 'juvenile', 'young adult', 'ya,', ' ya ', 'middle grade', 'kids'],
    genre: 'kids-ya',
  },
  {
    keywords: ['mystery', 'thriller', 'crime', 'suspense', 'detective', 'noir'],
    genre: 'mystery',
  },
  {
    keywords: ['science fiction', 'sci-fi', 'fantasy', 'speculative', 'dystopian', 'cyberpunk'],
    genre: 'sci-fi-fantasy',
  },
  {
    keywords: ['romance', 'erotica', 'chick lit'],
    genre: 'romance',
  },
  {
    keywords: ['business', 'economics', 'management', 'finance', 'entrepreneur', 'investing', 'leadership', 'marketing'],
    genre: 'business',
  },
  {
    keywords: ['self-help', 'self help', 'personal development', 'motivational', 'productivity', 'mindfulness', 'habit'],
    genre: 'self-help',
  },
  {
    keywords: ['history', 'biography', 'memoir', 'historical', 'autobiography', 'war', 'politics'],
    genre: 'history-bio',
  },
  {
    keywords: ['science', 'technology', 'computers', 'medicine', 'health', 'physics', 'biology', 'psychology', 'math'],
    genre: 'science-tech',
  },
  {
    keywords: ['nonfiction', 'non-fiction', 'non fiction', 'true crime', 'narrative nonfiction', 'essay'],
    genre: 'nonfiction',
  },
  {
    keywords: ['fiction', 'literary', 'novel', 'contemporary', 'short stories'],
    genre: 'fiction',
  },
]

/**
 * Mapeia um array de BookCategory (bruto das APIs) para um gênero canônico.
 * Retorna null se nenhuma categoria for reconhecida.
 */
export function normalizeCategory(categories: BookCategory[]): CanonicalGenre | null {
  for (const cat of categories) {
    const lower = cat.label.toLowerCase()
    for (const { keywords, genre } of KEYWORD_MAP) {
      if (keywords.some(kw => lower.includes(kw))) return genre
    }
  }
  return null
}
