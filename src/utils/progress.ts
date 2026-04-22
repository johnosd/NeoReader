export function clampPercentage(value: number): number {
  if (!Number.isFinite(value)) return 0
  return Math.max(0, Math.min(100, Math.round(value)))
}

export function normalizeFraction(value?: number | null): number | undefined {
  if (typeof value !== 'number' || !Number.isFinite(value)) return undefined
  return Math.max(0, Math.min(1, value))
}

export function fractionToPercentage(fraction?: number | null): number {
  const normalized = normalizeFraction(fraction)
  return normalized === undefined ? 0 : clampPercentage(normalized * 100)
}
