import { defineConfig, mergeConfig } from 'vitest/config'
import base from '../../vitest.config'

export default mergeConfig(base, defineConfig({
  test: {
    include: ['reports/code-review-2026-10-10/*.probe.ts?(x)'],
    maxWorkers: 2,
    reporters: ['verbose'],
  },
}))
