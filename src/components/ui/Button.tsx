import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from 'react'
import { cn } from '../../utils/cn'

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'outline'
type Tone = 'purple' | 'indigo'
type Size = 'md' | 'sm'

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant
  tone?: Tone
  size?: Size
  fullWidth?: boolean
  leftIcon?: ReactNode
  rightIcon?: ReactNode
}

// Monta classes por variante. `tone` só afeta primary/outline (onde a cor de destaque aparece).
function variantClasses(variant: Variant, tone: Tone): string {
  const accent = tone === 'purple' ? 'bg-purple-primary' : 'bg-indigo-primary'
  const accentActive = tone === 'purple' ? 'active:bg-purple-light' : 'active:bg-indigo-primary/90'
  const outlineColor = tone === 'purple' ? 'border-purple-primary text-purple-light' : 'border-indigo-primary text-indigo-primary'
  const outlineActive = tone === 'purple' ? 'active:bg-purple-primary/15' : 'active:bg-indigo-primary/15'

  switch (variant) {
    case 'primary':
      return `${accent} ${accentActive} text-white`
    case 'secondary':
      return 'bg-white/15 text-text-primary active:bg-white/25'
    case 'ghost':
      return 'bg-transparent text-text-primary active:bg-white/5'
    case 'danger':
      return 'bg-error/20 text-error active:bg-error/30'
    case 'outline':
      return `bg-transparent border ${outlineColor} ${outlineActive}`
  }
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  {
    variant = 'primary',
    tone = 'purple',
    size = 'md',
    fullWidth = true,
    leftIcon,
    rightIcon,
    className,
    children,
    disabled,
    ...rest
  },
  ref,
) {
  const sizeClasses = size === 'sm' ? 'h-10 px-4 text-sm' : 'h-14 px-4 text-base'

  return (
    <button
      ref={ref}
      disabled={disabled}
      className={cn(
        'inline-flex items-center justify-center gap-2 rounded-pill font-semibold transition-all duration-150 ease-out',
        'active:scale-[0.97]',
        'disabled:opacity-50 disabled:pointer-events-none',
        fullWidth && 'w-full',
        sizeClasses,
        variantClasses(variant, tone),
        className,
      )}
      {...rest}
    >
      {leftIcon}
      {children}
      {rightIcon}
    </button>
  )
})
