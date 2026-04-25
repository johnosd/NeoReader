import { describe, expect, it } from 'vitest'
import {
  findCurrentTocPath,
  flattenVisibleTocItems,
  getTocAncestorPaths,
  normalizeTocHref,
} from '@/utils/toc'

describe('toc utilities', () => {
  it('normalizes encoded hrefs and relative path segments', () => {
    expect(normalizeTocHref('/OPS/Navigation/../Text/Chapter%201.xhtml?x=1#start'))
      .toBe('OPS/Text/Chapter 1.xhtml#start')
  })

  it('prefers the deepest toc item when parent and child share the same href', () => {
    const toc: TocItem[] = [
      {
        label: 'Part I',
        href: 'Text/chapter.xhtml',
        subitems: [
          { label: 'Chapter 1', href: 'Text/chapter.xhtml' },
        ],
      },
    ]

    expect(findCurrentTocPath(toc, 'Text/chapter.xhtml', 'Chapter 1')).toBe('0.0')
  })

  it('matches a subchapter by document and label when the reader has no fragment', () => {
    const toc: TocItem[] = [
      {
        label: 'Part I',
        href: 'Text/chapter.xhtml#part',
        subitems: [
          { label: 'Chapter 1', href: 'Text/chapter.xhtml#chapter-1' },
          { label: 'Chapter 2', href: 'Text/chapter.xhtml#chapter-2' },
        ],
      },
    ]

    expect(findCurrentTocPath(toc, 'Text/chapter.xhtml', 'Chapter 2')).toBe('0.1')
  })

  it('matches hrefs when one side has an OPF-relative prefix', () => {
    const toc: TocItem[] = [
      { label: 'Chapter 1', href: 'OPS/Text/chapter1.xhtml' },
    ]

    expect(findCurrentTocPath(toc, 'Text/chapter1.xhtml')).toBe('0')
  })

  it('returns ancestor paths and visible items consistently', () => {
    const toc: TocItem[] = [
      {
        label: 'Part I',
        href: 'part.xhtml',
        subitems: [
          { label: 'Chapter 1', href: 'chapter1.xhtml' },
        ],
      },
    ]

    expect(getTocAncestorPaths('0.0')).toEqual(['0'])
    expect(flattenVisibleTocItems(toc, new Set()).map(({ path }) => path)).toEqual(['0'])
    expect(flattenVisibleTocItems(toc, new Set(['0'])).map(({ path }) => path)).toEqual(['0', '0.0'])
  })
})
