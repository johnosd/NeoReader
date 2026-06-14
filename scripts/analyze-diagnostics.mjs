import { mkdir, readFile, readdir, stat, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const EVENT_PREFIX = 'NeoReaderEvent '
const LEGACY_IMPORT_PREFIX = 'NeoReaderImport '
const DEFAULT_REPORT_DIR = 'reports'
const DEFAULT_MARKDOWN_REPORT = path.join(DEFAULT_REPORT_DIR, 'diagnostics-report.md')
const DEFAULT_JSON_REPORT = path.join(DEFAULT_REPORT_DIR, 'diagnostics-report.json')
const MAX_TABLE_ROWS = 10

const EVENT_STATUS = {
  START: 'start',
  SUCCESS: 'success',
  FAILURE: 'failure',
  TIMEOUT: 'timeout',
  FALLBACK: 'fallback',
}

export async function analyzeDiagnosticsPaths(inputPaths, options = {}) {
  const files = await collectInputFiles(inputPaths)
  const analyses = []

  for (const filePath of files) {
    const text = await readFile(filePath, 'utf8')
    analyses.push(analyzeDiagnosticsText(text, filePath))
  }

  return buildReport(
    analyses.flatMap((analysis) => analysis.events),
    analyses.flatMap((analysis) => analysis.androidSignals),
    analyses.flatMap((analysis) => analysis.malformedLines),
    files.map((filePath, index) => ({
      path: filePath,
      lineCount: analyses[index]?.summary.totalLines ?? 0,
    })),
    options.generatedAt,
  )
}

export function analyzeDiagnosticsText(text, artifactPath = 'inline.log', options = {}) {
  const events = []
  const androidSignals = []
  const malformedLines = []
  const lines = text.split(/\r?\n/)

  lines.forEach((line, index) => {
    if (!line.trim()) return

    const lineNumber = index + 1
    const parsedEvent = parseDiagnosticEventLine(line, artifactPath, lineNumber)
    if (parsedEvent.kind === 'event') {
      events.push(parsedEvent.event)
      return
    }
    if (parsedEvent.kind === 'malformed') {
      malformedLines.push(parsedEvent.malformed)
      return
    }

    const signal = parseAndroidSignal(line, artifactPath, lineNumber)
    if (signal) androidSignals.push(signal)
  })

  return buildReport(
    events,
    androidSignals,
    malformedLines,
    [{ path: artifactPath, lineCount: lines.length }],
    options.generatedAt,
  )
}

export function renderMarkdownReport(report) {
  const lines = [
    '# NeoReader diagnostics report',
    '',
    `Generated at: ${report.generatedAt}`,
    '',
    '## Executive summary',
    '',
    `- Artifacts analyzed: ${report.artifacts.length}`,
    `- Lines analyzed: ${report.summary.totalLines}`,
    `- Structured events: ${report.summary.totalEvents}`,
    `- Malformed diagnostic lines: ${report.summary.malformedLines}`,
    `- Error groups: ${report.topErrors.length}`,
    `- Slow operations with duration: ${report.slowOperations.length}`,
    `- Network timeouts: ${report.networkTimeouts.length}`,
    `- TTS fallbacks: ${report.ttsFallbacks.length}`,
    `- Android crash/ANR/jank/memory signals: ${report.androidSummary.totalSignals}`,
    '',
    '## Top errors',
    '',
    renderTable(
      ['Count', 'Event', 'Screen', 'Provider', 'Message'],
      report.topErrors.slice(0, MAX_TABLE_ROWS).map((item) => [
        item.count,
        item.eventName,
        item.screen ?? '',
        item.provider ?? '',
        item.errorMessage ?? '',
      ]),
    ),
    '',
    '## Slow operations',
    '',
    renderTable(
      ['Duration ms', 'Event', 'Status', 'Screen', 'Provider', 'Flow'],
      report.slowOperations.slice(0, MAX_TABLE_ROWS).map((event) => [
        event.durationMs ?? '',
        event.eventName,
        event.status ?? '',
        event.screen ?? '',
        event.provider ?? '',
        event.flowId ?? '',
      ]),
    ),
    '',
    '## Failures by provider',
    '',
    renderTable(
      ['Provider', 'Failures', 'Timeouts', 'Fallbacks'],
      report.providerFailures.map((item) => [
        item.provider,
        item.failures,
        item.timeouts,
        item.fallbacks,
      ]),
    ),
    '',
    '## Network timeouts',
    '',
    renderTable(
      ['Duration ms', 'URL', 'Flow'],
      report.networkTimeouts.slice(0, MAX_TABLE_ROWS).map((event) => [
        event.durationMs ?? '',
        stringDetail(event.details?.url),
        event.flowId ?? '',
      ]),
    ),
    '',
    '## TTS premium fallback',
    '',
    renderTable(
      ['Provider', 'Fallback', 'Reason/Error', 'Flow'],
      report.ttsFallbacks.slice(0, MAX_TABLE_ROWS).map((event) => [
        event.provider ?? '',
        stringDetail(event.details?.fallbackProvider),
        event.errorMessage ?? stringDetail(event.details?.reason),
        event.flowId ?? '',
      ]),
    ),
    '',
    '## Android signals',
    '',
    renderTable(
      ['Kind', 'Count'],
      Object.entries(report.androidSummary.byKind).map(([kind, count]) => [kind, count]),
    ),
    '',
    '## Problematic flows',
    '',
    renderTable(
      ['Flow', 'Events', 'Failures', 'Timeouts', 'Max duration ms'],
      report.problematicFlows.slice(0, MAX_TABLE_ROWS).map((flow) => [
        flow.flowId,
        flow.eventCount,
        flow.failures,
        flow.timeouts,
        flow.maxDurationMs,
      ]),
    ),
    '',
    '## Suggested next actions',
    '',
    ...report.suggestedActions.map((action) => `- ${action}`),
    '',
    '## Artifacts',
    '',
    renderTable(
      ['Path', 'Lines'],
      report.artifacts.map((artifact) => [artifact.path, artifact.lineCount]),
    ),
    '',
  ]

  return `${lines.join('\n')}\n`
}

export function renderJsonReport(report) {
  return `${JSON.stringify(report, null, 2)}\n`
}

export async function writeDiagnosticsReports(report, options = {}) {
  const markdownPath = options.markdownPath ?? DEFAULT_MARKDOWN_REPORT
  const jsonPath = options.jsonPath ?? DEFAULT_JSON_REPORT

  await mkdir(path.dirname(markdownPath), { recursive: true })
  await mkdir(path.dirname(jsonPath), { recursive: true })
  await writeFile(markdownPath, renderMarkdownReport(report), 'utf8')
  await writeFile(jsonPath, renderJsonReport(report), 'utf8')

  return { markdownPath, jsonPath }
}

export async function collectInputFiles(inputPaths) {
  const files = []
  for (const inputPath of inputPaths) {
    const resolved = path.resolve(inputPath)
    const info = await stat(resolved)
    if (info.isDirectory()) {
      files.push(...await collectFilesFromDirectory(resolved))
    } else {
      files.push(resolved)
    }
  }
  return files.sort((a, b) => a.localeCompare(b))
}

function parseDiagnosticEventLine(line, artifactPath, lineNumber) {
  const eventIndex = line.indexOf(EVENT_PREFIX)
  if (eventIndex >= 0) {
    return parseStructuredEvent(line, eventIndex, EVENT_PREFIX, 'NeoReaderEvent', artifactPath, lineNumber)
  }

  const legacyIndex = line.indexOf(LEGACY_IMPORT_PREFIX)
  if (legacyIndex >= 0) {
    return parseStructuredEvent(line, legacyIndex, LEGACY_IMPORT_PREFIX, 'NeoReaderImport', artifactPath, lineNumber)
  }

  return { kind: 'none' }
}

function parseStructuredEvent(line, prefixIndex, prefix, source, artifactPath, lineNumber) {
  const afterPrefix = line.slice(prefixIndex + prefix.length).trim()
  const jsonStart = afterPrefix.indexOf('{')
  if (jsonStart < 0) {
    return {
      kind: 'malformed',
      malformed: { artifactPath, lineNumber, source, reason: 'missing-json', line: line.trim() },
    }
  }

  const nameToken = afterPrefix.slice(0, jsonStart).trim().split(/\s+/)[0] ?? ''
  const jsonEnd = afterPrefix.lastIndexOf('}')
  const jsonText = jsonEnd >= jsonStart ? afterPrefix.slice(jsonStart, jsonEnd + 1) : afterPrefix.slice(jsonStart)

  try {
    const payload = JSON.parse(jsonText)
    return {
      kind: 'event',
      event: normalizeEvent(payload, nameToken, source, artifactPath, lineNumber),
    }
  } catch (error) {
    return {
      kind: 'malformed',
      malformed: {
        artifactPath,
        lineNumber,
        source,
        reason: error instanceof Error ? error.message : String(error),
        line: line.trim(),
      },
    }
  }
}

function normalizeEvent(payload, nameToken, source, artifactPath, lineNumber) {
  if (source === 'NeoReaderImport') {
    const stage = stringDetail(payload.stage) ?? nameToken
    const status = inferImportStatus(stage)
    return {
      source,
      artifactPath,
      lineNumber,
      eventName: status === EVENT_STATUS.FAILURE || status === EVENT_STATUS.TIMEOUT
        ? 'import.failure'
        : stage === 'start'
          ? 'import.start'
          : 'import.stage',
      legacyStage: stage,
      level: status === EVENT_STATUS.FAILURE || status === EVENT_STATUS.TIMEOUT ? 'error' : 'info',
      timestamp: stringDetail(payload.timestamp),
      sessionId: stringDetail(payload.sessionId),
      flowId: stringDetail(payload.importId),
      screen: 'import',
      provider: stringDetail(payload.provider),
      status,
      durationMs: numberDetail(payload.durationMs) ?? numberDetail(payload.elapsedMs),
      errorName: stringDetail(payload.error?.name),
      errorMessage: stringDetail(payload.error?.message),
      details: payload,
    }
  }

  return {
    source,
    artifactPath,
    lineNumber,
    eventName: stringDetail(payload.eventName) ?? nameToken,
    level: stringDetail(payload.level) ?? 'info',
    timestamp: stringDetail(payload.timestamp),
    sessionId: stringDetail(payload.sessionId),
    flowId: stringDetail(payload.flowId),
    screen: stringDetail(payload.screen),
    provider: stringDetail(payload.provider),
    status: stringDetail(payload.status),
    durationMs: numberDetail(payload.durationMs),
    errorName: stringDetail(payload.errorName),
    errorMessage: stringDetail(payload.errorMessage),
    details: payload.details && typeof payload.details === 'object' ? payload.details : {},
  }
}

function parseAndroidSignal(line, artifactPath, lineNumber) {
  const trimmed = line.trim()
  if (/AndroidRuntime|FATAL EXCEPTION|OutOfMemoryError/i.test(trimmed)) {
    return { kind: 'crash', artifactPath, lineNumber, message: trimmed }
  }
  if (/\bANR\b|Input dispatching timed out/i.test(trimmed)) {
    return { kind: 'anr', artifactPath, lineNumber, message: trimmed }
  }
  if (/Choreographer|Skipped\s+\d+\s+frames|Davey!/i.test(trimmed)) {
    return {
      kind: 'jank',
      artifactPath,
      lineNumber,
      message: trimmed,
      frames: extractNumber(trimmed, /Skipped\s+(\d+)\s+frames/i),
      durationMs: extractNumber(trimmed, /duration[=:](\d+)/i),
    }
  }
  if (/\bGC\b|Background concurrent copying GC|Clamp target GC heap|low memory|meminfo/i.test(trimmed)) {
    return { kind: 'memory', artifactPath, lineNumber, message: trimmed }
  }
  return null
}

function buildReport(events, androidSignals, malformedLines, artifacts, generatedAt = new Date().toISOString()) {
  const topErrors = groupErrors(events)
  const slowOperations = events
    .filter((event) => typeof event.durationMs === 'number')
    .sort((a, b) => b.durationMs - a.durationMs)
    .slice(0, MAX_TABLE_ROWS)
  const networkTimeouts = events.filter((event) => (
    event.eventName === 'network.timeout' || event.status === EVENT_STATUS.TIMEOUT
  ))
  const ttsFallbacks = events.filter((event) => (
    event.eventName === 'tts.provider.fallback' ||
    stringDetail(event.details?.fallbackProvider) === 'native'
  ))
  const providerFailures = groupProviderFailures(events)
  const problematicFlows = groupProblematicFlows(events)
  const androidSummary = summarizeAndroidSignals(androidSignals)

  return {
    generatedAt,
    artifacts,
    summary: {
      totalLines: artifacts.reduce((sum, artifact) => sum + artifact.lineCount, 0),
      totalEvents: events.length,
      malformedLines: malformedLines.length,
    },
    events,
    malformedLines: malformedLines.slice(0, 20),
    topErrors,
    slowOperations,
    networkTimeouts,
    ttsFallbacks,
    providerFailures,
    androidSignals,
    androidSummary,
    problematicFlows,
    suggestedActions: suggestActions({
      events,
      topErrors,
      slowOperations,
      networkTimeouts,
      ttsFallbacks,
      androidSummary,
      malformedLines,
    }),
  }
}

function groupErrors(events) {
  const groups = new Map()
  for (const event of events) {
    const isFailure = event.level === 'error' ||
      event.status === EVENT_STATUS.FAILURE ||
      event.status === EVENT_STATUS.TIMEOUT ||
      Boolean(event.errorMessage) ||
      /\.failure$|\.error/.test(event.eventName)
    if (!isFailure) continue

    const key = [
      event.eventName,
      event.screen ?? '',
      event.provider ?? '',
      event.errorMessage ?? '',
    ].join('|')
    const current = groups.get(key) ?? {
      count: 0,
      eventName: event.eventName,
      screen: event.screen,
      provider: event.provider,
      errorMessage: event.errorMessage,
      samples: [],
    }
    current.count += 1
    if (current.samples.length < 3) {
      current.samples.push({ artifactPath: event.artifactPath, lineNumber: event.lineNumber, flowId: event.flowId })
    }
    groups.set(key, current)
  }
  return Array.from(groups.values()).sort((a, b) => b.count - a.count)
}

function groupProviderFailures(events) {
  const groups = new Map()
  for (const event of events) {
    if (!event.provider) continue

    const current = groups.get(event.provider) ?? {
      provider: event.provider,
      failures: 0,
      timeouts: 0,
      fallbacks: 0,
    }
    if (event.status === EVENT_STATUS.TIMEOUT) current.timeouts += 1
    if (event.status === EVENT_STATUS.FALLBACK || event.eventName === 'tts.provider.fallback') current.fallbacks += 1
    if (event.status === EVENT_STATUS.FAILURE || event.level === 'error' || event.errorMessage) current.failures += 1
    groups.set(event.provider, current)
  }
  return Array.from(groups.values()).sort((a, b) => (
    (b.failures + b.timeouts + b.fallbacks) - (a.failures + a.timeouts + a.fallbacks)
  ))
}

function groupProblematicFlows(events) {
  const groups = new Map()
  for (const event of events) {
    if (!event.flowId) continue
    const current = groups.get(event.flowId) ?? {
      flowId: event.flowId,
      eventCount: 0,
      failures: 0,
      timeouts: 0,
      maxDurationMs: 0,
      eventNames: new Set(),
    }
    current.eventCount += 1
    current.eventNames.add(event.eventName)
    if (event.status === EVENT_STATUS.FAILURE || event.level === 'error' || event.errorMessage) current.failures += 1
    if (event.status === EVENT_STATUS.TIMEOUT) current.timeouts += 1
    current.maxDurationMs = Math.max(current.maxDurationMs, event.durationMs ?? 0)
    groups.set(event.flowId, current)
  }

  return Array.from(groups.values())
    .map((flow) => ({ ...flow, eventNames: Array.from(flow.eventNames) }))
    .filter((flow) => flow.failures > 0 || flow.timeouts > 0 || flow.maxDurationMs > 3000)
    .sort((a, b) => (
      (b.failures - a.failures) ||
      (b.timeouts - a.timeouts) ||
      (b.maxDurationMs - a.maxDurationMs)
    ))
}

function summarizeAndroidSignals(androidSignals) {
  const byKind = {}
  for (const signal of androidSignals) {
    byKind[signal.kind] = (byKind[signal.kind] ?? 0) + 1
  }
  return {
    totalSignals: androidSignals.length,
    byKind,
  }
}

function suggestActions({ events, topErrors, slowOperations, networkTimeouts, ttsFallbacks, androidSummary, malformedLines }) {
  const actions = []
  if (events.length === 0) {
    actions.push('Capture logs while navigating the app and filter for NeoReaderEvent to generate actionable diagnostics.')
  }
  if (topErrors.length > 0) {
    const first = topErrors[0]
    actions.push(`Investigate the top error group first: ${first.eventName}${first.errorMessage ? ` - ${first.errorMessage}` : ''}.`)
  }
  if (networkTimeouts.length > 0) {
    actions.push('Review network timeout clusters by URL/provider; consider cache, retry policy, timeout tuning or clearer fallback UI.')
  }
  if (ttsFallbacks.length > 0) {
    actions.push('Review TTS premium fallback reasons; validate API keys, credits, selected voices and provider availability.')
  }
  if (slowOperations.some((event) => (event.durationMs ?? 0) > 3000)) {
    actions.push('Profile the slowest reader/import/network flows and compare before/after durations in the next optimization pass.')
  }
  if ((androidSummary.byKind.crash ?? 0) > 0 || (androidSummary.byKind.anr ?? 0) > 0) {
    actions.push('Prioritize Android crash/ANR signals before UI polish; capture the surrounding logcat window for stack context.')
  }
  if ((androidSummary.byKind.jank ?? 0) > 0) {
    actions.push('For jank signals, capture gfxinfo framestats or Perfetto around the affected flow.')
  }
  if (malformedLines.length > 0) {
    actions.push('Inspect malformed diagnostic lines; they may indicate truncated logcat output or a parser format mismatch.')
  }
  if (actions.length === 0) {
    actions.push('No obvious errors found. Capture longer sessions around import, reader open, translation and TTS to build a baseline.')
  }
  return actions
}

async function collectFilesFromDirectory(directoryPath) {
  const entries = await readdir(directoryPath, { withFileTypes: true })
  const files = []
  for (const entry of entries) {
    const resolved = path.join(directoryPath, entry.name)
    if (entry.isDirectory()) {
      files.push(...await collectFilesFromDirectory(resolved))
    } else if (/\.(log|txt)$/i.test(entry.name)) {
      files.push(resolved)
    }
  }
  return files
}

function inferImportStatus(stage) {
  if (stage === 'start' || stage.endsWith('-start')) return EVENT_STATUS.START
  if (/timeout/i.test(stage)) return EVENT_STATUS.TIMEOUT
  if (/failed|aborted|invalid/i.test(stage)) return EVENT_STATUS.FAILURE
  if (/finished|computed|parsed|opened|acquired|released/i.test(stage)) return EVENT_STATUS.SUCCESS
  return undefined
}

function renderTable(headers, rows) {
  if (rows.length === 0) return '_No data._'
  const headerLine = `| ${headers.map(escapeCell).join(' | ')} |`
  const separator = `| ${headers.map(() => '---').join(' | ')} |`
  const body = rows.map((row) => `| ${row.map(escapeCell).join(' | ')} |`)
  return [headerLine, separator, ...body].join('\n')
}

function escapeCell(value) {
  return String(value ?? '')
    .replace(/\r?\n/g, ' ')
    .replace(/\|/g, '\\|')
}

function stringDetail(value) {
  return typeof value === 'string' && value.trim() ? value : undefined
}

function numberDetail(value) {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined
}

function extractNumber(text, pattern) {
  const match = text.match(pattern)
  if (!match) return undefined
  const value = Number(match[1])
  return Number.isFinite(value) ? value : undefined
}

function parseArgs(argv) {
  const inputs = []
  let markdownPath
  let jsonPath
  let printHelp = false

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]
    if (arg === '--help' || arg === '-h') {
      printHelp = true
    } else if (arg === '--out') {
      markdownPath = argv[index + 1]
      index += 1
    } else if (arg === '--json') {
      jsonPath = argv[index + 1]
      index += 1
    } else {
      inputs.push(arg)
    }
  }

  return { inputs, markdownPath, jsonPath, printHelp }
}

function usage() {
  return [
    'Usage: npm run diagnostics:analyze -- <log-file-or-folder> [more inputs] [--out reports/diagnostics-report.md] [--json reports/diagnostics-report.json]',
    '',
    'Examples:',
    '  npm run diagnostics:analyze -- logcat.txt',
    '  npm run diagnostics:analyze -- logs/android --out reports/session.md --json reports/session.json',
  ].join('\n')
}

async function main(argv) {
  const args = parseArgs(argv)
  if (args.printHelp || args.inputs.length === 0) {
    console.log(usage())
    process.exitCode = args.printHelp ? 0 : 1
    return
  }

  const report = await analyzeDiagnosticsPaths(args.inputs)
  const output = await writeDiagnosticsReports(report, {
    markdownPath: args.markdownPath,
    jsonPath: args.jsonPath,
  })

  console.log(`Diagnostics report written: ${output.markdownPath}`)
  console.log(`Diagnostics JSON written: ${output.jsonPath}`)
  console.log(`Events: ${report.summary.totalEvents}; malformed: ${report.summary.malformedLines}; android signals: ${report.androidSummary.totalSignals}`)
}

const isCli = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
if (isCli) {
  main(process.argv.slice(2)).catch((error) => {
    console.error(error instanceof Error ? error.message : String(error))
    process.exitCode = 1
  })
}
