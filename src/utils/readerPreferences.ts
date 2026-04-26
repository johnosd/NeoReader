import type { CSSProperties } from 'react'
import type { ReaderFontFamily, ReaderLineHeight, ReaderTheme } from '../types/settings'

export const READER_LINE_HEIGHT_OPTIONS: Array<{ value: ReaderLineHeight; label: string }> = [
  { value: 'compact', label: 'Compacta' },
  { value: 'comfortable', label: 'Confortavel' },
  { value: 'relaxed', label: 'Relaxada' },
]

export const READER_THEME_OPTIONS: Array<{ value: ReaderTheme; label: string; description: string }> = [
  { value: 'dark', label: 'Noite suave', description: 'Escuro confortavel para leitura longa' },
  { value: 'black', label: 'AMOLED', description: 'Preto puro com alto contraste' },
  { value: 'paper', label: 'Papel', description: 'Claro neutro e limpo' },
  { value: 'warm', label: 'Papel quente', description: 'Claro quente com menos brilho' },
  { value: 'sepia', label: 'Sepia', description: 'Livro antigo, baixo brilho' },
  { value: 'sage', label: 'Sage', description: 'Verde suave para descanso visual' },
  { value: 'contrast', label: 'Alto contraste', description: 'Maxima legibilidade' },
]

export const READER_FONT_FAMILY_OPTIONS: Array<{ value: ReaderFontFamily; label: string; description: string }> = [
  { value: 'publisher', label: 'Original do livro', description: 'Preserva a fonte definida no EPUB' },
  { value: 'classic', label: 'Classica', description: 'Serifada tradicional para leitura' },
  { value: 'modern', label: 'Moderna', description: 'Sans limpa e familiar no Android' },
  { value: 'readable', label: 'Alta legibilidade', description: 'Espacada e clara para leitura continua' },
  { value: 'mono', label: 'Mono', description: 'Monoespacada para conteudo tecnico' },
]

export interface ReaderThemePalette {
  isDark: boolean
  background: string
  text: string
  heading: string
  link: string
  paragraphHighlight: string
  sentenceHighlight: string
  sentenceHighlightBorder: string
  sentenceHighlightHalo: string
  ttsHighlight: string
  translationSurface: string
  translationBorder: string
  translationGlow: string
  previewBorder: string
}

const READER_THEME_PALETTES: Record<ReaderTheme, ReaderThemePalette> = {
  dark: {
    isDark: true,
    background: '#101114',
    text: '#e8e2d8',
    heading: '#fff7ed',
    link: '#93c5fd',
    paragraphHighlight: 'rgba(147, 197, 253, 0.14)',
    sentenceHighlight: 'linear-gradient(180deg, rgba(147, 197, 253, 0.18), rgba(168, 85, 247, 0.12))',
    sentenceHighlightBorder: 'rgba(147, 197, 253, 0.16)',
    sentenceHighlightHalo: 'rgba(147, 197, 253, 0.05)',
    ttsHighlight: 'rgba(34, 197, 94, 0.15)',
    translationSurface: '#141820',
    translationBorder: 'rgba(147, 197, 253, 0.20)',
    translationGlow: 'rgba(147, 197, 253, 0.10)',
    previewBorder: 'rgba(255,255,255,0.08)',
  },
  black: {
    isDark: true,
    background: '#000000',
    text: '#f2f2f2',
    heading: '#ffffff',
    link: '#8ab4ff',
    paragraphHighlight: 'rgba(138, 180, 255, 0.18)',
    sentenceHighlight: 'linear-gradient(180deg, rgba(138, 180, 255, 0.20), rgba(34, 211, 238, 0.10))',
    sentenceHighlightBorder: 'rgba(138, 180, 255, 0.20)',
    sentenceHighlightHalo: 'rgba(138, 180, 255, 0.06)',
    ttsHighlight: 'rgba(74, 222, 128, 0.16)',
    translationSurface: '#080808',
    translationBorder: 'rgba(255,255,255,0.14)',
    translationGlow: 'rgba(255,255,255,0.08)',
    previewBorder: 'rgba(255,255,255,0.12)',
  },
  paper: {
    isDark: false,
    background: '#f8fafc',
    text: '#1f2937',
    heading: '#0f172a',
    link: '#2563eb',
    paragraphHighlight: 'rgba(37, 99, 235, 0.10)',
    sentenceHighlight: 'linear-gradient(180deg, rgba(37, 99, 235, 0.14), rgba(14, 165, 233, 0.08))',
    sentenceHighlightBorder: 'rgba(37, 99, 235, 0.12)',
    sentenceHighlightHalo: 'rgba(37, 99, 235, 0.04)',
    ttsHighlight: 'rgba(34, 197, 94, 0.10)',
    translationSurface: 'rgba(255, 255, 255, 0.98)',
    translationBorder: 'rgba(59, 130, 246, 0.16)',
    translationGlow: 'rgba(59, 130, 246, 0.08)',
    previewBorder: 'rgba(15, 23, 42, 0.12)',
  },
  warm: {
    isDark: false,
    background: '#fff7ed',
    text: '#3f3328',
    heading: '#1f140d',
    link: '#b45309',
    paragraphHighlight: 'rgba(180, 83, 9, 0.10)',
    sentenceHighlight: 'linear-gradient(180deg, rgba(245, 158, 11, 0.15), rgba(14, 165, 233, 0.06))',
    sentenceHighlightBorder: 'rgba(180, 83, 9, 0.12)',
    sentenceHighlightHalo: 'rgba(180, 83, 9, 0.04)',
    ttsHighlight: 'rgba(22, 163, 74, 0.11)',
    translationSurface: 'rgba(255, 251, 245, 0.98)',
    translationBorder: 'rgba(180, 83, 9, 0.16)',
    translationGlow: 'rgba(180, 83, 9, 0.08)',
    previewBorder: 'rgba(80, 60, 40, 0.14)',
  },
  sepia: {
    isDark: false,
    background: '#f4ecd8',
    text: '#3f3126',
    heading: '#261a12',
    link: '#7c3aed',
    paragraphHighlight: 'rgba(124, 58, 237, 0.10)',
    sentenceHighlight: 'linear-gradient(180deg, rgba(124, 58, 237, 0.12), rgba(14, 165, 233, 0.08))',
    sentenceHighlightBorder: 'rgba(124, 58, 237, 0.12)',
    sentenceHighlightHalo: 'rgba(124, 58, 237, 0.04)',
    ttsHighlight: 'rgba(16, 185, 129, 0.12)',
    translationSurface: 'rgba(255, 249, 237, 0.98)',
    translationBorder: 'rgba(124, 58, 237, 0.18)',
    translationGlow: 'rgba(124, 58, 237, 0.08)',
    previewBorder: 'rgba(80, 60, 40, 0.14)',
  },
  sage: {
    isDark: false,
    background: '#e8eddc',
    text: '#26311f',
    heading: '#17210f',
    link: '#166534',
    paragraphHighlight: 'rgba(22, 101, 52, 0.10)',
    sentenceHighlight: 'linear-gradient(180deg, rgba(22, 163, 74, 0.14), rgba(20, 184, 166, 0.08))',
    sentenceHighlightBorder: 'rgba(22, 101, 52, 0.12)',
    sentenceHighlightHalo: 'rgba(22, 101, 52, 0.04)',
    ttsHighlight: 'rgba(16, 185, 129, 0.13)',
    translationSurface: 'rgba(246, 250, 238, 0.98)',
    translationBorder: 'rgba(22, 101, 52, 0.16)',
    translationGlow: 'rgba(22, 101, 52, 0.08)',
    previewBorder: 'rgba(38, 49, 31, 0.14)',
  },
  contrast: {
    isDark: false,
    background: '#ffffff',
    text: '#000000',
    heading: '#000000',
    link: '#0047cc',
    paragraphHighlight: 'rgba(0, 71, 204, 0.14)',
    sentenceHighlight: 'linear-gradient(180deg, rgba(0, 71, 204, 0.18), rgba(0, 0, 0, 0.04))',
    sentenceHighlightBorder: 'rgba(0, 71, 204, 0.24)',
    sentenceHighlightHalo: 'rgba(0, 71, 204, 0.06)',
    ttsHighlight: 'rgba(0, 128, 64, 0.16)',
    translationSurface: '#ffffff',
    translationBorder: 'rgba(0, 0, 0, 0.22)',
    translationGlow: 'rgba(0, 0, 0, 0.08)',
    previewBorder: 'rgba(0, 0, 0, 0.22)',
  },
}

const READER_LINE_HEIGHT_VALUES: Record<ReaderLineHeight, number> = {
  compact: 1.55,
  comfortable: 1.7,
  relaxed: 1.9,
}

const READER_FONT_FAMILIES: Record<ReaderFontFamily, string | null> = {
  publisher: null,
  classic: 'Georgia, Charter, "Times New Roman", serif',
  modern: 'Inter, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
  readable: 'Inter, Verdana, "Noto Sans", Arial, sans-serif',
  mono: '"JetBrains Mono", ui-monospace, SFMono-Regular, Consolas, monospace',
}

export function getReaderLineHeightValue(lineHeight: ReaderLineHeight): number {
  return READER_LINE_HEIGHT_VALUES[lineHeight]
}

export function getReaderThemePalette(theme: ReaderTheme): ReaderThemePalette {
  return READER_THEME_PALETTES[theme] ?? READER_THEME_PALETTES.dark
}

export function getReaderThemePreviewStyle(theme: ReaderTheme): CSSProperties {
  const palette = getReaderThemePalette(theme)
  return {
    backgroundColor: palette.background,
    color: palette.text,
    borderColor: palette.previewBorder,
  }
}

export function getReaderFontFamilyValue(fontFamily: ReaderFontFamily): string | null {
  return READER_FONT_FAMILIES[fontFamily] ?? READER_FONT_FAMILIES.classic
}

export function getReaderFontPreviewStyle(fontFamily: ReaderFontFamily): CSSProperties {
  const family = getReaderFontFamilyValue(fontFamily)
  return family ? { fontFamily: family } : {}
}
