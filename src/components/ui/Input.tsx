import { forwardRef, type InputHTMLAttributes, type ReactNode, useId } from 'react'
import { cn } from '../../utils/cn'

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string
  hint?: string
  error?: string
  leftIcon?: ReactNode
  rightSlot?: ReactNode   // conteúdo clicável/visual à direita (ex: botão show/hide)
  tone?: 'purple' | 'indigo'
}

export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  { label, hint, error, leftIcon, rightSlot, tone = 'purple', className, id, ...rest },
  ref,
) {
  // useId garante ID único para acessibilidade quando o consumidor não passa um.
  const autoId = useId()
  const inputId = id ?? autoId
  const focusBorder = tone === 'purple' ? 'focus:border-purple-primary' : 'focus:border-indigo-primary'

  return (
    <div className="w-full">
      {label && (
        <label htmlFor={inputId} className="block text-sm font-semibold text-text-primary mb-2">
          {label}
        </label>
      )}
      <div className="relative">
        {leftIcon && (
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted pointer-events-none">
            {leftIcon}
          </span>
        )}
        <input
          ref={ref}
          id={inputId}
          className={cn(
            'w-full h-14 px-4 rounded-md bg-white/5 border text-base text-text-primary',
            'placeholder:text-text-muted',
            'transition-colors duration-150 outline-none',
            leftIcon && 'pl-10',
            rightSlot && 'pr-10',
            error ? 'border-error' : 'border-border',
            !error && focusBorder,
            !error && 'focus:bg-white/10',
            className,
          )}
          {...rest}
        />
        {rightSlot && (
          <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center">
            {rightSlot}
          </div>
        )}
      </div>
      {(hint || error) && (
        <p className={cn('text-xs mt-2', error ? 'text-error' : 'text-text-muted')}>
          {error ?? hint}
        </p>
      )}
    </div>
  )
})
