import type { Book, ReadingProgress, ReadingStatus } from '../types/book'
import { clampPercentage, fractionToPercentage } from './progress'

interface ResolvedReadingState {
  percentage: number
  readingStatus: ReadingStatus
}

export function resolveProgressPercentage(progress?: Pick<ReadingProgress, 'fraction' | 'percentage'> | null): number {
  if (!progress) return 0
  if (typeof progress.fraction === 'number') return fractionToPercentage(progress.fraction)
  return clampPercentage(progress.percentage ?? 0)
}

export function deriveReadingStatus(
  percentage: number,
  currentStatus?: ReadingStatus | null,
): ReadingStatus {
  const normalized = clampPercentage(percentage)

  if (normalized >= 100) return 'finished'
  if (normalized <= 0) return currentStatus === 'finished' ? 'finished' : 'unread'
  return 'reading'
}

export function resolveReadingState(
  book?: Pick<Book, 'readingStatus'> | null,
  progress?: Pick<ReadingProgress, 'fraction' | 'percentage'> | null,
): ResolvedReadingState {
  const percentage = resolveProgressPercentage(progress)
  return {
    percentage,
    readingStatus: deriveReadingStatus(percentage, book?.readingStatus),
  }
}
