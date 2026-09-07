import type { MessageKey } from '../i18n'

// Paleta compartilhada por marcadores e highlights (feature 010, FR-015: "sem
// criar tokens de cor novos"). Movida de BookmarkSheet.tsx — fonte única.
export const ANNOTATION_COLORS = [
  { key: 'indigo', hex: '#6366f1', labelKey: 'bookmark.color.indigo' },
  { key: 'purple', hex: '#a855f7', labelKey: 'bookmark.color.purple' },
  { key: 'emerald', hex: '#22c55e', labelKey: 'bookmark.color.emerald' },
  { key: 'cyan', hex: '#06b6d4', labelKey: 'bookmark.color.cyan' },
  { key: 'amber', hex: '#f59e0b', labelKey: 'bookmark.color.amber' },
  { key: 'orange', hex: '#f97316', labelKey: 'bookmark.color.orange' },
  { key: 'rose', hex: '#f43f5e', labelKey: 'bookmark.color.rose' },
  { key: 'pink', hex: '#ec4899', labelKey: 'bookmark.color.pink' },
] satisfies Array<{ key: string; hex: string; labelKey: MessageKey }>

export function annotationColorHex(color: string | undefined): string {
  return ANNOTATION_COLORS.find((c) => c.key === color)?.hex ?? '#6366f1'
}
