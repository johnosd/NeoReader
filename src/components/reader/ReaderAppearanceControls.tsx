import { Check, Minus, Plus } from 'lucide-react'
import type { ReactNode } from 'react'
import type { FontSize, ReaderFontFamily, ReaderLineHeight, ReaderTheme } from '../../types/settings'
import { useI18n, type MessageKey } from '../../i18n'
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
  descriptionKey: MessageKey
  px: number
}> = [
  { value: 'sm', descriptionKey: 'reader.fontSize.sm', px: 16 },
  { value: 'md', descriptionKey: 'reader.fontSize.md', px: 18 },
  { value: 'lg', descriptionKey: 'reader.fontSize.lg', px: 22 },
  { value: 'xl', descriptionKey: 'reader.fontSize.xl', px: 26 },
]

const READER_FONT_PREVIEW_PX: Record<FontSize, number> = {
  sm: 16,
  md: 18,
  lg: 22,
  xl: 26,
}

const READER_STYLE_MODE_OPTIONS: Array<{
  value: ReaderStyleMode
  labelKey: MessageKey
  descriptionKey: MessageKey
}> = [
  { value: 'comfortable', labelKey: 'reader.mode.comfortable.label', descriptionKey: 'reader.mode.comfortable.description' },
  { value: 'original', labelKey: 'reader.mode.original.label', descriptionKey: 'reader.mode.original.description' },
]

const READER_THEME_LABEL_KEYS: Record<ReaderTheme, MessageKey> = {
  dark: 'reader.theme.dark',
  black: 'reader.theme.black',
  paper: 'reader.theme.paper',
  warm: 'reader.theme.warm',
  sepia: 'reader.theme.sepia',
  sage: 'reader.theme.sage',
  contrast: 'reader.theme.contrast',
}

const READER_FONT_LABEL_KEYS: Record<ReaderFontFamily, MessageKey> = {
  publisher: 'reader.font.publisher',
  classic: 'reader.font.classic',
  modern: 'reader.font.modern',
  readable: 'reader.font.readable',
  mono: 'reader.font.mono',
}

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

function getFontSizeIndex(value: FontSize) {
  return Math.max(0, READER_FONT_SIZE_OPTIONS.findIndex((option) => option.value === value))
}

function getFontSizeMeta(value: FontSize) {
  return READER_FONT_SIZE_OPTIONS[getFontSizeIndex(value)] ?? READER_FONT_SIZE_OPTIONS[1]
}

function getLineHeightLabel(value: ReaderLineHeight) {
  return getReaderLineHeightValue(value).toFixed(2).replace(/0$/, '')
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
  const { t } = useI18n()

  return (
    <div className="grid grid-cols-2 gap-2">
      {READER_STYLE_MODE_OPTIONS.map((option) => {
        const active = value === option.value
        const label = t(option.labelKey)
        const description = t(option.descriptionKey)

        return (
          <button
            key={option.value}
            type="button"
            onClick={() => onChange(option.value)}
            className={choiceClass(active, surface, 'min-h-[74px] px-3 py-3 pr-9 text-left')}
            aria-pressed={active}
          >
            <ActiveMark active={active} />
            <span className="block text-sm font-semibold">{label}</span>
            <span className="mt-1 block text-xs leading-snug text-text-muted">{description}</span>
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
  const { t } = useI18n()
  const inactiveFrame = surface === 'base'
    ? 'border-white/10'
    : 'border-border'

  return (
    <div className="grid auto-cols-[98px] grid-flow-col gap-2 overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
      {READER_THEME_OPTIONS.map((option) => {
        const active = value === option.value
        const palette = getReaderThemePalette(option.value)
        const mutedLine = palette.isDark ? 'rgba(255,255,255,0.20)' : 'rgba(15,23,42,0.22)'
        const strongLine = palette.isDark ? 'rgba(255,255,255,0.34)' : 'rgba(15,23,42,0.32)'
        const label = t(READER_THEME_LABEL_KEYS[option.value])

        return (
          <button
            key={option.value}
            type="button"
            onClick={() => onChange(option.value)}
            className={[
              'h-[72px] overflow-hidden rounded-md border text-left transition-all duration-150 active:scale-[0.98]',
              active
                ? 'border-purple-light shadow-[0_0_0_1px_rgba(168,85,247,0.35)]'
                : inactiveFrame,
            ].join(' ')}
            style={{ backgroundColor: palette.background }}
            aria-pressed={active}
            aria-label={t('reader.theme.aria', { label })}
          >
            <span className="flex h-full flex-col justify-between px-2 py-2">
              <span>
                <span
                  className="mb-2 block text-[10px] font-semibold"
                  style={{ color: palette.text, opacity: 0.5 }}
                  aria-hidden="true"
                >
                  Aa
                </span>
                <span className="flex flex-col gap-1">
                  <span className="h-0.5 w-16 rounded-full" style={{ backgroundColor: strongLine }} />
                  <span className="h-0.5 w-12 rounded-full" style={{ backgroundColor: mutedLine }} />
                  <span className="h-0.5 w-14 rounded-full" style={{ backgroundColor: mutedLine }} />
                </span>
              </span>
              <span
                className="block truncate text-center text-[11px] font-bold"
                style={{ color: active ? '#c084fc' : palette.text, opacity: active ? 1 : 0.62 }}
              >
                {label}
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
  const { t } = useI18n()
  const inactiveFrame = surface === 'base'
    ? 'border-white/10 bg-purple-primary/10'
    : 'border-border bg-bg-surface'

  return (
    <div className="grid auto-cols-[112px] grid-flow-col gap-2 overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
      {READER_FONT_FAMILY_OPTIONS.map((option) => {
        const active = value === option.value
        const label = t(READER_FONT_LABEL_KEYS[option.value])

        return (
          <button
            key={option.value}
            type="button"
            onClick={() => onChange(option.value)}
            className={[
              'flex h-[52px] items-center justify-center rounded-md border px-3 text-center transition-all duration-150 active:scale-[0.98]',
              active
                ? 'border-purple-light bg-purple-primary/15 text-purple-light shadow-[0_0_0_1px_rgba(168,85,247,0.22)]'
                : `${inactiveFrame} text-text-secondary`,
            ].join(' ')}
            aria-pressed={active}
            aria-label={t('reader.font.aria', { label })}
          >
            <span
              className="block max-w-full truncate text-sm font-semibold"
              style={getReaderFontPreviewStyle(option.value)}
            >
              {label}
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
}: {
  value: FontSize
  onChange: (value: FontSize) => void
  surface?: ControlSurface
}) {
  const { t } = useI18n()
  const activeIndex = getFontSizeIndex(value)
  const activeMeta = getFontSizeMeta(value)
  const progress = (activeIndex / (READER_FONT_SIZE_OPTIONS.length - 1)) * 100
  const canDecrease = activeIndex > 0
  const canIncrease = activeIndex < READER_FONT_SIZE_OPTIONS.length - 1

  function setByIndex(index: number) {
    const next = READER_FONT_SIZE_OPTIONS[Math.min(Math.max(index, 0), READER_FONT_SIZE_OPTIONS.length - 1)]
    if (next.value !== value) onChange(next.value)
  }

  return (
    <div>
      <div className="mb-3 flex items-center justify-between">
        <span className="text-xs font-semibold text-text-muted">{t(activeMeta.descriptionKey)}</span>
        <span className="font-mono text-sm font-bold text-purple-light">{activeMeta.px}px</span>
      </div>
      <div className="flex items-center gap-4">
        <button
          type="button"
          onClick={() => setByIndex(activeIndex - 1)}
          disabled={!canDecrease}
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-purple-primary/25 bg-purple-primary/10 text-text-primary transition-transform active:scale-95 disabled:opacity-40"
          aria-label={t('reader.fontSize.decrease')}
        >
          <Minus size={18} />
        </button>

        <div className="relative h-8 flex-1">
          <div className="absolute left-0 right-0 top-1/2 h-1 -translate-y-1/2 rounded-full bg-white/10" />
          <div
            className="absolute left-0 top-1/2 h-1 -translate-y-1/2 rounded-full bg-purple-light"
            style={{ width: `${progress}%` }}
          />
          {READER_FONT_SIZE_OPTIONS.map((option, index) => (
            <button
              key={option.value}
              type="button"
              onClick={() => setByIndex(index)}
              className={[
                'absolute top-1/2 h-5 w-5 -translate-x-1/2 -translate-y-1/2 rounded-full border transition-all',
                index === activeIndex
                  ? 'border-purple-light bg-purple-light shadow-[0_0_12px_rgba(168,85,247,0.65)]'
                  : 'border-transparent bg-transparent',
              ].join(' ')}
              style={{ left: `${(index / (READER_FONT_SIZE_OPTIONS.length - 1)) * 100}%` }}
              aria-label={t('reader.fontSize.option', { label: t(option.descriptionKey) })}
              aria-pressed={index === activeIndex}
            />
          ))}
        </div>

        <button
          type="button"
          onClick={() => setByIndex(activeIndex + 1)}
          disabled={!canIncrease}
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-purple-primary/25 bg-purple-primary/10 text-text-primary transition-transform active:scale-95 disabled:opacity-40"
          aria-label={t('reader.fontSize.increase')}
        >
          <Plus size={18} />
        </button>
      </div>
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
    <div className="grid grid-cols-3 gap-2">
      {READER_LINE_HEIGHT_OPTIONS.map((option) => {
        const active = value === option.value

        return (
          <button
            key={option.value}
            type="button"
            onClick={() => onChange(option.value)}
            className={choiceClass(active, surface, 'flex min-h-[62px] flex-col items-center justify-center gap-2 px-2 py-3 text-center')}
            aria-pressed={active}
          >
            <MiniLines lineHeight={option.value} />
            <span className="font-mono text-sm font-semibold">{getLineHeightLabel(option.value)}</span>
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
