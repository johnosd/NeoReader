import type { CefrLevel, WordLensData } from '@/types/wordLens'
import { classifyWordLensTokens, tokenizeWordLensText, type WordLensMatch } from '@/utils/wordLens'

const WORD_LENS_SELECTOR = '.nr-word-lens'
// Keep generous headroom below the 8 ms reader budget because a DOM operation
// or a preempted WebView callback can finish after the last deadline check.
const DEFAULT_BATCH_BUDGET_MS = 4
const MAX_BATCH_OPERATIONS = 32
const TIMED_OUT_BATCH_OPERATIONS = 1
const IDLE_DEADLINE_HEADROOM_MS = 2
const EXCLUDED_ANCESTOR_SELECTOR = [
  'script',
  'style',
  'noscript',
  'textarea',
  'input',
  'select',
  'option',
  'button',
  'svg',
  'math',
  '#nr-translation-block',
  '#nr-para-remainder',
  '.nr-vocab',
  '.nr-tts-word',
  '.nr-hl-sentence',
  WORD_LENS_SELECTOR,
  '[data-nr-ui]',
].join(',')

interface IdleDeadlineLike {
  didTimeout?: boolean
  timeRemaining(): number
}

export interface WordLensDocumentOptions {
  enabled: boolean
  level: CefrLevel
  data: WordLensData | null
  batchBudgetMs?: number
}

export interface WordLensDocumentMetrics {
  cancelled: boolean
  processingMs: number
  textNodes: number
  tokens: number
  matches: number
  maxBatchMs: number
}

export interface WordLensDocumentTask {
  cancel(): void
  completed: Promise<WordLensDocumentMetrics>
}

type Stage = 'clear' | 'normalize' | 'mark'

function now(doc: Document): number {
  return doc.defaultView?.performance?.now?.() ?? performance.now()
}

function unwrapWordLensElement(element: Element, parents: Set<Node>): void {
  const parent = element.parentNode
  if (!parent) return
  parents.add(parent)
  while (element.firstChild) parent.insertBefore(element.firstChild, element)
  element.remove()
}

function isEligibleTextNode(node: Text): boolean {
  return Boolean(node.data.trim() && !node.parentElement?.closest(EXCLUDED_ANCESTOR_SELECTOR))
}

function wrapMatch(node: Text, match: WordLensMatch): void {
  if (match.end > node.data.length) return
  node.splitText(match.end)
  const selected = node.splitText(match.start)
  const span = node.ownerDocument.createElement('span')
  span.className = `nr-word-lens nr-word-lens-${match.level.toLowerCase()}`
  span.dataset.nrCefrLevel = match.level
  selected.parentNode?.insertBefore(span, selected)
  span.appendChild(selected)
}

export function scheduleWordLensDocument(
  doc: Document,
  options: WordLensDocumentOptions,
): WordLensDocumentTask {
  const budgetMs = Math.max(1, Math.min(options.batchBudgetMs ?? DEFAULT_BATCH_BUDGET_MS, 16))
  let existingHighlights: Element[] | null = null
  const parentsToNormalize = new Set<Node>()
  const metrics: WordLensDocumentMetrics = {
    cancelled: false,
    processingMs: 0,
    textNodes: 0,
    tokens: 0,
    matches: 0,
    maxBatchMs: 0,
  }
  const shouldMark = options.enabled && options.level !== 'C2' && options.data !== null && Boolean(doc.body)
  const idleWindow = doc.defaultView
  let stage: Stage = 'clear'
  let clearIndex = 0
  let normalizeIndex = 0
  let normalizeParents: Node[] = []
  let walker: TreeWalker | null = null
  let nextTextNode: Text | null = null
  let pendingTextNode: Text | null = null
  let pendingMatches: WordLensMatch[] = []
  let pendingMatchIndex = -1
  let cancelled = false
  let settled = false
  let idleHandle: number | null = null
  let timeoutHandle: ReturnType<typeof setTimeout> | null = null
  let resolveCompleted!: (value: WordLensDocumentMetrics) => void

  const completed = new Promise<WordLensDocumentMetrics>((resolve) => {
    resolveCompleted = resolve
  })

  function finish(wasCancelled = false): void {
    if (settled) return
    settled = true
    metrics.cancelled = wasCancelled
    resolveCompleted(metrics)
  }

  function cancelScheduledCallback(): void {
    if (idleHandle !== null) idleWindow?.cancelIdleCallback?.(idleHandle)
    if (timeoutHandle !== null) clearTimeout(timeoutHandle)
    idleHandle = null
    timeoutHandle = null
  }

  function scheduleNext(): void {
    if (cancelled) {
      finish(true)
      return
    }
    if (idleWindow?.requestIdleCallback) {
      idleHandle = idleWindow.requestIdleCallback(runBatch, { timeout: 50 })
      return
    }
    timeoutHandle = setTimeout(() => runBatch(), 0)
  }

  function hasBudget(startedAt: number, deadline?: IdleDeadlineLike): boolean {
    if (now(doc) - startedAt >= budgetMs) return false
    if (!deadline || deadline.didTimeout) return true
    return deadline.timeRemaining() > IDLE_DEADLINE_HEADROOM_MS
  }

  function prepareMarkStage(): void {
    if (!shouldMark || !doc.body) {
      finish()
      return
    }
    walker = doc.createTreeWalker(doc.body, 4)
    nextTextNode = walker.nextNode() as Text | null
    stage = 'mark'
  }

  function runBatch(deadline?: IdleDeadlineLike): void {
    idleHandle = null
    timeoutHandle = null
    if (cancelled) {
      finish(true)
      return
    }

    const startedAt = now(doc)
    let operations = 0
    const operationLimit = deadline?.didTimeout ? TIMED_OUT_BATCH_OPERATIONS : MAX_BATCH_OPERATIONS
    while (hasBudget(startedAt, deadline) && operations < operationLimit) {
      if (stage === 'clear') {
        existingHighlights ??= Array.from(doc.querySelectorAll(WORD_LENS_SELECTOR))
        const element = existingHighlights[clearIndex]
        if (element) {
          clearIndex += 1
          unwrapWordLensElement(element, parentsToNormalize)
          operations += 1
          continue
        }
        normalizeParents = Array.from(parentsToNormalize)
        stage = 'normalize'
      }

      if (stage === 'normalize') {
        const parent = normalizeParents[normalizeIndex]
        if (parent) {
          normalizeIndex += 1
          parent.normalize()
          operations += 1
          continue
        }
        prepareMarkStage()
        if (settled) break
      }

      if (stage === 'mark') {
        const pendingMatch = pendingMatches[pendingMatchIndex]
        if (pendingTextNode && pendingMatch) {
          wrapMatch(pendingTextNode, pendingMatch)
          pendingMatchIndex -= 1
          operations += 1
          if (pendingMatchIndex < 0) {
            pendingTextNode = null
            pendingMatches = []
          }
          continue
        }

        const textNode = nextTextNode
        if (!textNode || !walker) {
          finish()
          break
        }
        nextTextNode = walker.nextNode() as Text | null
        if (!isEligibleTextNode(textNode)) continue

        metrics.textNodes += 1
        const tokens = tokenizeWordLensText(textNode.data)
        metrics.tokens += tokens.length
        const matches = classifyWordLensTokens(tokens, options.level, options.data!)
        metrics.matches += matches.length
        operations += 1
        if (matches.length > 0) {
          pendingTextNode = textNode
          pendingMatches = matches
          pendingMatchIndex = matches.length - 1
        }
      }
    }

    const batchMs = now(doc) - startedAt
    metrics.processingMs += batchMs
    metrics.maxBatchMs = Math.max(metrics.maxBatchMs, batchMs)
    if (!settled) scheduleNext()
  }

  scheduleNext()
  return {
    cancel: () => {
      if (cancelled || settled) return
      cancelled = true
      cancelScheduledCallback()
      finish(true)
    },
    completed,
  }
}
