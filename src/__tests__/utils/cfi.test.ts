import { describe, expect, it } from 'vitest'

import { areCfisEquivalent, isCfiInLocation, normalizeCfi } from '@/utils/cfi'

describe('isCfiInLocation', () => {
  it('returns true when the cfi is inside the current location range', () => {
    expect(isCfiInLocation('epubcfi(/6/6!/4/4/54,/1:4,/1:15)', 'epubcfi(/6/6)')).toBe(true)
  })

  it('returns true for exact matches', () => {
    expect(isCfiInLocation('epubcfi(/6/6)', 'epubcfi(/6/6)')).toBe(true)
  })

  it('returns false for a cfi in a different section', () => {
    expect(isCfiInLocation('epubcfi(/6/8!/4/4/54,/1:4,/1:15)', 'epubcfi(/6/6)')).toBe(false)
  })

  it('returns false when cfi or location is missing', () => {
    expect(isCfiInLocation('epubcfi(/6/6)', null)).toBe(false)
    expect(isCfiInLocation('epubcfi(/6/6)', undefined)).toBe(false)
    expect(isCfiInLocation(null, 'epubcfi(/6/6)')).toBe(false)
    expect(isCfiInLocation(undefined, 'epubcfi(/6/6)')).toBe(false)
    expect(isCfiInLocation('', 'epubcfi(/6/6)')).toBe(false)
  })
})

describe('normalizeCfi', () => {
  it('collapses a range cfi to its start point', () => {
    expect(normalizeCfi('epubcfi(/6/8!/4/2/10/2,/1:0,/1:20)')).toBe('epubcfi(/6/8!/4/2/10/2/1:0)')
  })
})

describe('areCfisEquivalent', () => {
  it('treats a range and its collapsed start cfi as the same target', () => {
    expect(
      areCfisEquivalent(
        'epubcfi(/6/8!/4/2/10/2,/1:0,/1:20)',
        'epubcfi(/6/8!/4/2/10/2/1:0)',
      ),
    ).toBe(true)
  })
})
