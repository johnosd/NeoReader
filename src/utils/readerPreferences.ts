import type { CSSProperties } from 'react'
import type { ReaderLineHeight, ReaderTheme } from '../types/settings'

export const READER_LINE_HEIGHT_OPTIONS: Array<{ value: ReaderLineHeight; label: string }> = [
  { value: 'compact', label: 'Compacta' },
  { value: 'comfortable', label: 'Confortável' },
  { value: 'relaxed', label: 'Relaxada' },
]

export const READER_THEME_OPTIONS: Array<{ value: ReaderTheme; label: string }> = [
  { value: 'dark', label: 'Noite' },
  { value: 'sepia', label: 'Sépia' },
  { value: 'paper', label: 'Papel' },
]

export interface ReaderThemePalette {
  background: string
  text: string
  heading: string
  link: string
  paragraphHighlight: string
  sentenceHighlight: string
  ttsHighlight: string
  previewBorder: string
}

const READER_THEME_PALETTES: Record<ReaderTheme, ReaderThemePalette> = {
  dark: {
    background: '#0a0a0a',
    text: '#e8e8e8',
    heading: '#ffffff',
    link: '#818cf8',
    paragraphHighlight: 'rgba(99, 102, 241, 0.15)',
    sentenceHighlight: 'rgba(99, 102, 241, 0.25)',
    ttsHighlight: 'rgba(34, 197, 94, 0.15)',
    previewBorder: 'rgba(255,255,255,0.08)',
  },
  sepia: {
    background: '#f4ecd8',
    text: '#3f3126',
    heading: '#261a12',
    link: '#7c3aed',
    paragraphHighlight: 'rgba(124, 58, 237, 0.10)',
    sentenceHighlight: 'rgba(124, 58, 237, 0.16)',
    ttsHighlight: 'rgba(16, 185, 129, 0.12)',
    previewBorder: 'rgba(80, 60, 40, 0.14)',
  },
  paper: {
    background: '#f8fafc',
    text: '#1f2937',
    heading: '#0f172a',
    link: '#2563eb',
    paragraphHighlight: 'rgba(37, 99, 235, 0.10)',
    sentenceHighlight: 'rgba(37, 99, 235, 0.16)',
    ttsHighlight: 'rgba(34, 197, 94, 0.10)',
    previewBorder: 'rgba(15, 23, 42, 0.12)',
  },
}

const READER_LINE_HEIGHT_VALUES: Record<ReaderLineHeight, number> = {
  compact: 1.55,
  comfortable: 1.7,
  relaxed: 1.9,
}

export function getReaderLineHeightValue(lineHeight: ReaderLineHeight): number {
  return READER_LINE_HEIGHT_VALUES[lineHeight]
}

export function getReaderThemePalette(theme: ReaderTheme): ReaderThemePalette {
  return READER_THEME_PALETTES[theme]
}

export function getReaderThemePreviewStyle(theme: ReaderTheme): CSSProperties {
  const palette = getReaderThemePalette(theme)
  return {
    backgroundColor: palette.background,
    color: palette.text,
    borderColor: palette.previewBorder,
  }
}
