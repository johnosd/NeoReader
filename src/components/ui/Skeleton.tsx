import { cn } from '../../utils/cn'

interface SkeletonProps {
  className?: string
  variant?: 'block' | 'card' | 'text'
}

export function Skeleton({ className, variant = 'block' }: SkeletonProps) {
  const base = 'animate-pulse bg-white/5 overflow-hidden'
  const shape =
    variant === 'card' ? 'rounded-md aspect-[2/3]' : variant === 'text' ? 'h-4 rounded-sm' : 'rounded-md'

  return <div className={cn(base, shape, className)} />
}
