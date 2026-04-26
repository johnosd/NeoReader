import { Check } from 'lucide-react'
import type { ReactNode } from 'react'
import type { FontSize, ReaderFontFamily, ReaderLineHeight, ReaderTheme } from '../../types/settings'
import {
  READER_FONT_FAMILY_OPTIONS,
  READER_LINE_HEIGHT_OPTIONS,
  READER_THEME_OPTIONS,
  getReaderFontPreviewStyle,
  getReaderLineHeightValue,
  getReaderThemePalette,
  getReaderThemePreviewStyle,
} from '../../utils/readerPreferences'

export type ReaderStyleMode = 'comfortable' | 'original'
type ControlSurface = 'base' | 'surface'

const READER_FONT_SIZE_OPTIONS: Array<{
  value: FontSize
  label: string
  description: string
  className: string
}> = [
  { value: 'sm', label: 'A', description: 'Pequena', className: 'text-sm' },
  { value: 'md', label: 'A', description: 'Media', className: 'text-base' },
  { value: 'lg', label: 'A', description: 'Grande', className: 'text-lg' },
  { value: 'xl', label: 'A', description: 'Extra', className: 'text-xl' },
]

const READER_FONT_PREVIEW_PX: Record<FontSize, number> = {
  sm: 14,
  md: 16,
  lg: 18,
  xl: 20,
}

const READER_STYLE_MODE_OPTIONS: Array<{
  value: ReaderStyleMode
  label: string
  description: string
}> = [
  { value: 'comfortable', label: 'Confortavel', description: 'Forca fonte e cores' },
  { value: 'original', label: 'Original', description: 'Respeita o EPUB' },
]

function choiceClass(active: boolean, surface: ControlSurface, extra = '') {
  const inactiveSurface = surface === 'base'
    ? 'border-border bg-bg-base text-text-secondary hover:border-white/20'
    : 'border-border bg-bg-surface text-text-secondary hover:border-white/20'
  const activeSurface = 'border-purple-primary/60 bg-purple-primary/15 text-purple-light shadow-[0_0_0_1px_rgba(168,85,247,0.18)]'

  return [
    'relative rounded-md border transition-all duration-150 active:scale-[0.98]',
    active ? activeSurface : inactiveSurface,
    extra,
  ].filter(Boolean).join(' ')
}

function ActiveMark({ active }: { active: boolean }) {
  if (!active) return null

  return (
    <span className="absolute right-2 top-2 inline-flex h-5 w-5 items-center justify-center rounded-full bg-purple-primary text-white">
      <Check size={13} strokeWidth={3} />
    </span>
  )
}

function MiniLines({ lineHeight }: { lineHeight: ReaderLineHeight }) {
  const gap = lineHeight === 'compact' ? 3 : lineHeight === 'comfortable' ? 5 : 7

  return (
    <span className="flex h-8 w-10 shrink-0 flex-col justify-center" style={{ gap }}>
      <span className="h-0.5 w-8 rounded-full bg-current opacity-80" />
      <span className="h-0.5 w-10 rounded-full bg-current opacity-60" />
      <span className="h-0.5 w-7 rounded-full bg-current opacity-40" />
    </span>
  )
}

export function ReaderModeControl({
  value,
  onChange,
  surface = 'surface',
}: {
  value: ReaderStyleMode
  onChange: (value: ReaderStyleMode) => void
  surface?: ControlSurface
}) {
  return (
    <div className="grid grid-cols-2 gap-2">
      {READER_STYLE_MODE_OPTIONS.map((option) => {
        const active = value === option.value

        return (
          <button
            key={option.value}
            type="button"
            onClick={() => onChange(option.value)}
            className={choiceClass(active, surface, 'min-h-[74px] px-3 py-3 pr-9 text-left')}
            aria-pressed={active}
          >
            <ActiveMark active={active} />
            <span className="block text-sm font-semibold">{option.label}</span>
            <span className="mt-1 block text-xs leading-snug text-text-muted">{option.description}</span>
          </button>
        )
      })}
    </div>
  )
}

export function ReaderThemeControl({
  value,
  onChange,
  surface = 'surface',
}: {
  value: ReaderTheme
  onChange: (value: ReaderTheme) => void
  surface?: ControlSurface
}) {
  return (
    <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
      {READER_THEME_OPTIONS.map((option) => {
        const active = value === option.value
        const palette = getReaderThemePalette(option.value)

        return (
          <button
            key={option.value}
            type="button"
            onClick={() => onChange(option.value)}
            className={choiceClass(active, surface, 'min-h-[76px] px-3 py-3 pr-9 text-left')}
            aria-pressed={active}
          >
            <ActiveMark active={active} />
            <span className="flex items-center gap-3">
              <span
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md border"
                style={{ backgroundColor: palette.background, borderColor: palette.previewBorder }}
              >
                <span
                  className="h-4 w-4 rounded-full"
                  style={{ backgroundColor: palette.text }}
                />
              </span>
              <span className="min-w-0">
                <span className="block truncate text-sm font-semibold">{option.label}</span>
                <span className="mt-0.5 block text-xs leading-snug text-text-muted">{option.description}</span>
              </span>
            </span>
          </button>
        )
      })}
    </div>
  )
}

export function ReaderFontControl({
  value,
  onChange,
  surface = 'surface',
}: {
  value: ReaderFontFamily
  onChange: (value: ReaderFontFamily) => void
  surface?: ControlSurface
}) {
  return (
    <div className="grid grid-cols-1 gap-2">
      {READER_FONT_FAMILY_OPTIONS.map((option) => {
        const active = value === option.value

        return (
          <button
            key={option.value}
            type="button"
            onClick={() => onChange(option.value)}
            className={choiceClass(active, surface, 'min-h-[70px] px-3 py-3 pr-9 text-left')}
            aria-pressed={active}
          >
            <ActiveMark active={active} />
            <span className="flex items-center justify-between gap-3">
              <span className="min-w-0">
                <span className="block truncate text-sm font-semibold" style={getReaderFontPreviewStyle(option.value)}>
                  {option.label}
                </span>
                <span className="mt-1 block text-xs leading-snug text-text-muted">
                  {option.description}
                </span>
              </span>
              <span
                className="shrink-0 text-xl font-semibold text-text-primary/80"
                style={getReaderFontPreviewStyle(option.value)}
                aria-hidden="true"
              >
                Aa
              </span>
            </span>
          </button>
        )
      })}
    </div>
  )
}

export function ReaderFontSizeControl({
  value,
  onChange,
  surface = 'surface',
}: {
  value: FontSize
  onChange: (value: FontSize) => void
  surface?: ControlSurface
}) {
  return (
    <div className="grid grid-cols-4 gap-2">
      {READER_FONT_SIZE_OPTIONS.map((option) => {
        const active = value === option.value

        return (
          <button
            key={option.value}
            type="button"
            onClick={() => onChange(option.value)}
            className={choiceClass(active, surface, `min-h-[58px] px-2 py-2 text-center ${option.className}`)}
            aria-label={`Fonte ${option.description}`}
            aria-pressed={active}
          >
            <span className="block font-semibold leading-none">{option.label}</span>
            <span className="mt-1 block text-[10px] font-semibold uppercase tracking-[0.06em] text-text-muted">
              {option.description}
            </span>
          </button>
        )
      })}
    </div>
  )
}

export function ReaderLineHeightControl({
  value,
  onChange,
  surface = 'surface',
}: {
  value: ReaderLineHeight
  onChange: (value: ReaderLineHeight) => void
  surface?: ControlSurface
}) {
  return (
    <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
      {READER_LINE_HEIGHT_OPTIONS.map((option) => {
        const active = value === option.value

        return (
          <button
            key={option.value}
            type="button"
            onClick={() => onChange(option.value)}
            className={choiceClass(active, surface, 'flex min-h-[62px] items-center gap-3 px-3 py-3 text-left')}
            aria-pressed={active}
          >
            <MiniLines lineHeight={option.value} />
            <span className="text-sm font-semibold">{option.label}</span>
          </button>
        )
      })}
    </div>
  )
}

export function ReaderPreviewPanel({
  theme,
  fontFamily,
  fontSize,
  lineHeight,
  children,
}: {
  theme: ReaderTheme
  fontFamily: ReaderFontFamily
  fontSize: FontSize
  lineHeight: ReaderLineHeight
  children: ReactNode
}) {
  const previewStyle = {
    ...getReaderThemePreviewStyle(theme),
    ...getReaderFontPreviewStyle(fontFamily),
  }

  return (
    <div className="rounded-md border px-4 py-4" style={previewStyle}>
      <p
        style={{
          ...getReaderFontPreviewStyle(fontFamily),
          fontSize: READER_FONT_PREVIEW_PX[fontSize],
          lineHeight: getReaderLineHeightValue(lineHeight),
          color: previewStyle.color,
        }}
      >
        {children}
      </p>
    </div>
  )
}
