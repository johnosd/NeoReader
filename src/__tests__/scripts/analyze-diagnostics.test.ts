import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  analyzeDiagnosticsPaths,
  analyzeDiagnosticsText,
  renderMarkdownReport,
} from '../../../scripts/analyze-diagnostics.mjs'

const __dirname = dirname(fileURLToPath(import.meta.url))
const fixturesDir = resolve(__dirname, '..', 'fixtures', 'diagnostics')

function readFixture(name: string) {
  return readFileSync(resolve(fixturesDir, name), 'utf8')
}

describe('analyze-diagnostics', () => {
  it('parseia NeoReaderEvent e NeoReaderImport e monta rankings principais', () => {
    const report = analyzeDiagnosticsText(
      readFixture('sample-logcat.log'),
      'sample-logcat.log',
      { generatedAt: '2026-06-14T13:00:00.000Z' },
    )

    expect(report.summary.totalEvents).toBe(7)
    expect(report.summary.malformedLines).toBe(0)
    expect(report.networkTimeouts).toHaveLength(1)
    expect(report.ttsFallbacks).toHaveLength(1)
    expect(report.providerFailures[0]).toEqual(expect.objectContaining({
      provider: 'speechify',
      fallbacks: 1,
    }))
    expect(report.topErrors.some((error) => error.errorMessage === 'HTTP 500')).toBe(true)
    expect(report.topErrors.some((error) => error.errorMessage === 'bad epub')).toBe(true)
    expect(report.slowOperations[0]).toEqual(expect.objectContaining({
      eventName: 'network.timeout',
      durationMs: 10000,
    }))
    expect(report.problematicFlows.some((flow) => flow.flowId === 'web-1')).toBe(true)
  })

  it('tolera JSON malformado e detecta sinais Android relevantes', () => {
    const report = analyzeDiagnosticsText(readFixture('malformed-android.log'), 'malformed-android.log')

    expect(report.summary.totalEvents).toBe(0)
    expect(report.summary.malformedLines).toBe(1)
    expect(report.androidSummary.byKind.crash).toBe(1)
    expect(report.androidSummary.byKind.anr).toBe(1)
    expect(report.androidSummary.byKind.jank).toBe(2)
    expect(report.androidSummary.byKind.memory).toBe(1)
    expect(report.androidSignals.some((signal) => signal.frames === 45)).toBe(true)
    expect(report.androidSignals.some((signal) => signal.durationMs === 1234)).toBe(true)
  })

  it('gera relatorio Markdown com resumo e proximas acoes', () => {
    const report = analyzeDiagnosticsText(readFixture('sample-logcat.log'), 'sample-logcat.log')
    const markdown = renderMarkdownReport(report)

    expect(markdown).toContain('# NeoReader diagnostics report')
    expect(markdown).toContain('## Top errors')
    expect(markdown).toContain('## Suggested next actions')
    expect(markdown).toContain('Speechify error: 500')
    expect(markdown).toContain('bad epub')
  })

  it('analisa arquivos por caminho e preserva contagem de linhas dos artefatos', async () => {
    const report = await analyzeDiagnosticsPaths([
      resolve(fixturesDir, 'sample-logcat.log'),
      resolve(fixturesDir, 'malformed-android.log'),
    ], { generatedAt: '2026-06-14T13:00:00.000Z' })

    expect(report.artifacts).toHaveLength(2)
    expect(report.summary.totalLines).toBeGreaterThan(0)
    expect(report.artifacts.every((artifact) => artifact.lineCount > 0)).toBe(true)
  })
})
