import { useState } from 'react'
import { BottomSheet, Button } from '../ui'
import type { Highlight } from '../../types/highlight'
import { useI18n } from '../../i18n'

// Mesmo limite documentado em spec.md FR-003 — sem formatação rica, só texto
// simples multi-linha.
const NOTE_MAX_LENGTH = 2000

interface HighlightNoteSheetProps {
  open: boolean
  highlight: Highlight | null
  onSave: (note: string) => void
  onClose: () => void
}

// IMPORTANTE: o chamador deve passar `key={highlight?.id ?? 'closed'}` (ver
// ReaderScreen.tsx). É isso que reseta `text` pro valor certo a cada
// abertura — nunca um useEffect fazendo setState (React recomenda `key` em
// vez de efeito só pra "resetar estado quando uma prop muda").
export function HighlightNoteSheet({ open, highlight, onSave, onClose }: HighlightNoteSheetProps) {
  const { t } = useI18n()
  const [text, setText] = useState(highlight?.note ?? '')

  return (
    <BottomSheet open={open} onClose={onClose} title={t('highlightNote.title')}>
      <div className="space-y-3">
        <textarea
          value={text}
          onChange={(event) => setText(event.target.value)}
          maxLength={NOTE_MAX_LENGTH}
          placeholder={t('highlightNote.placeholder')}
          rows={6}
          autoFocus
          className="w-full resize-none rounded-md border border-border bg-white/5 p-4 text-base text-text-primary outline-none transition-colors duration-150 placeholder:text-text-muted focus:border-purple-primary focus:bg-white/10"
        />
        <p className="text-right text-xs tabular-nums text-text-muted">
          {t('highlightNote.charLimit', { count: text.length, max: NOTE_MAX_LENGTH })}
        </p>
        <div className="flex gap-3">
          <Button variant="secondary" onClick={onClose}>
            {t('highlightNote.cancel')}
          </Button>
          <Button variant="primary" onClick={() => onSave(text)}>
            {t('highlightNote.save')}
          </Button>
        </div>
      </div>
    </BottomSheet>
  )
}
