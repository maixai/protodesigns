import { describe, expect, it } from 'vitest'
import { pageSizeForHeight } from '../../src/components/agent-plugin-pagination'

describe('pageSizeForHeight', () => {
  it('fits whole rows into the measured height', () => {
    expect(pageSizeForHeight(480, 120)).toBe(4)
    expect(pageSizeForHeight(539, 120)).toBe(4)
    expect(pageSizeForHeight(240, 120)).toBe(2)
  })

  it('keeps at least one row for short or invalid measurements', () => {
    expect(pageSizeForHeight(80, 120)).toBe(1)
    expect(pageSizeForHeight(0, 120)).toBe(1)
    expect(pageSizeForHeight(240, 0)).toBe(1)
    expect(pageSizeForHeight(Number.NaN, 120)).toBe(1)
    expect(pageSizeForHeight(240, Number.POSITIVE_INFINITY)).toBe(1)
  })
})
