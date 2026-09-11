import { useState } from 'react'
import { Highlighter, Underline, Waves } from 'lucide-react'
import { BottomSheet, Button } from '../ui'
import { ANNOTATION_COLORS } from '../../utils/annotationColors'
import type { Highlight, HighlightStyle } from '../../types/highlight'
import { useI18n } from '../../i18n'
import { cn } from '../../utils/cn'

// Mesmo limite de HighlightNoteSheet (feature 013) — sem formatação rica.
const NOTE_MAX_LENGTH = 2000

const STYLES: HighlightStyle[] = ['background', 'underline', 'squiggly']

const STYLE_ICON: Record<HighlightStyle, typeof Highlighter> = {
  background: Highlighter,
  underline: Underline,
  squiggly: Waves,
}

interface HighlightComposerSheetProps {
  open: boolean
  // Presente = modo EDIÇÃO (pré-preenche cor/estilo/nota do highlight já
  // existente); ausente = modo CRIAÇÃO (usa defaultColor/defaultStyle, nota
  // sempre começa vazia). Nenhuma prop "mode" separada — o dado já diz qual
  // caso é, evitar os dois poderem discordar (feature 016, FR-001/FR-005).
  highlight?: Highlight | null
  defaultColor?: string
  defaultStyle?: HighlightStyle
  onSave: (result: { color: string; style: HighlightStyle; note: string }) => void
  onClose: () => void
}

// IMPORTANTE: o chamador deve passar `key` que mude a cada abertura nova
// (ex: `key={highlight?.id ?? draft?.cfi ?? 'closed'}`) — mesmo mecanismo já
// documentado no HighlightNoteSheet original: reset de estado via `key` do
// React, nunca via useEffect+setState.
export function HighlightComposerSheet({
  open,
  highlight,
  defaultColor = 'indigo',
  defaultStyle = 'background',
  onSave,
  onClose,
}: HighlightComposerSheetProps) {
  const { t } = useI18n()
  const [color, setColor] = useState(highlight?.color ?? defaultColor)
  const [style, setStyle] = useState<HighlightStyle>(highlight?.style ?? defaultStyle)
  const [note, setNote] = useState(highlight?.note ?? '')

  return (
    <BottomSheet open={open} onClose={onClose} title={t('highlightComposer.title')}>
      <div className="space-y-4">
        <div className="flex items-center justify-center gap-3">
          {STYLES.map((s) => {
            const Icon = STYLE_ICON[s]
            return (
              <button
                key={s}
                type="button"
                aria-pressed={style === s}
                aria-label={t(`reader.selectionMenu.style.${s}`)}
                onClick={() => setStyle(s)}
                className={cn(
                  'flex h-11 w-11 items-center justify-center rounded-full border transition-colors duration-150',
                  style === s
                    ? 'border-purple-primary bg-purple-primary/20 text-purple-light'
                    : 'border-white/10 bg-white/5 text-text-secondary',
                )}
              >
                <Icon size={18} />
              </button>
            )
          })}
        </div>

        <div className="flex flex-wrap items-center justify-center gap-3">
          {ANNOTATION_COLORS.map((c) => (
            <button
              key={c.key}
              type="button"
              aria-pressed={color === c.key}
              aria-label={t('bookmark.color', { label: t(c.labelKey) })}
              onClick={() => setColor(c.key)}
              className="h-8 w-8 rounded-full transition-transform active:scale-90"
              style={{
                backgroundColor: c.hex,
                outline: color === c.key ? `2px solid ${c.hex}` : 'none',
                outlineOffset: '3px',
              }}
            />
          ))}
        </div>

        <textarea
          value={note}
          onChange={(event) => setNote(event.target.value)}
          maxLength={NOTE_MAX_LENGTH}
          placeholder={t('highlightNote.placeholder')}
          rows={4}
          autoFocus
          className="w-full resize-none rounded-md border border-border bg-white/5 p-4 text-base text-text-primary outline-none transition-colors duration-150 placeholder:text-text-muted focus:border-purple-primary focus:bg-white/10"
        />
        <p className="text-right text-xs tabular-nums text-text-muted">
          {t('highlightNote.charLimit', { count: note.length, max: NOTE_MAX_LENGTH })}
        </p>

        <div className="flex gap-3">
          <Button variant="secondary" onClick={onClose}>
            {t('highlightNote.cancel')}
          </Button>
          <Button variant="primary" onClick={() => onSave({ color, style, note })}>
            {t('highlightNote.save')}
          </Button>
        </div>
      </div>
    </BottomSheet>
  )
}
