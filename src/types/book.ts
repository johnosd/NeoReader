import type { FontSize, ReaderLineHeight, ReaderTheme } from './settings'
import type { TtsProvider } from './tts'

export type ReadingStatus = 'unread' | 'reading' | 'finished'
export type BookCoverSource = 'epub-extracted' | 'manual-upload' | 'legacy-inline'

// Representa um livro armazenado no IndexedDB
export interface Book {
  id?: number          // auto-increment pelo Dexie
  title: string
  author: string
  fileBlob: Blob          // arquivo .epub completo
  addedAt: Date
  lastOpenedAt: Date | null
  readingStatus?: ReadingStatus
  isFavorite?: boolean    // marcado pelo usuÃ¡rio na tela de detalhes
}

export interface BookCover {
  bookId: number
  blob: Blob
  source: BookCoverSource
  updatedAt: Date
}

// Configurações específicas de leitura por livro
export interface BookSettings {
  id?: number
  bookId: number
  fontSize?: FontSize
  lineHeight?: ReaderLineHeight
  readerTheme?: ReaderTheme
  bookLanguage?: string | null
  translationTargetLang?: string | null
  ttsProvider?: TtsProvider
  ttsRate?: number
  ttsSpeechifyVoiceId?: string | null
  ttsSpeechifyVoiceLabel?: string | null
  ttsSpeechifyVoiceAvatarUrl?: string | null
  ttsElevenLabsVoiceId?: string | null
  ttsElevenLabsVoiceLabel?: string | null
  ttsNativeVoiceKey?: string | null
  ttsNativeVoiceLabel?: string | null
}

// Progresso de leitura — CFI é o "endereço" de um ponto no EPUB
export interface ReadingProgress {
  id?: number
  bookId: number
  cfi: string       // EPUB Canonical Fragment Identifier (ex: "epubcfi(/6/4!/4/2/2:0)")
  percentage: number // 0-100
  fraction?: number
  sectionHref?: string
  sectionLabel?: string
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
