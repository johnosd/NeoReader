import { describe, expect, it } from 'vitest'

import { isCfiInLocation } from '@/utils/cfi'

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
