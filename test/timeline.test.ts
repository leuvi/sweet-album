import { describe, expect, it } from 'vitest'
import { thinTicks, type Tick } from '../src/core/timeline'

/** Ten years, roughly as the demo library lays out. */
const years: Tick[] = [
  { at: 0.0, label: '2026' },
  { at: 0.069, label: '2025' },
  { at: 0.233, label: '2024' },
  { at: 0.32, label: '2023' },
  { at: 0.402, label: '2021' },
  { at: 0.53, label: '2019' },
  { at: 0.6, label: '2018' },
  { at: 0.692, label: '2017' },
  { at: 0.715, label: '2016' },
  { at: 0.799, label: '2015' },
]

describe('thinTicks', () => {
  it('keeps every year when the rail is tall enough', () => {
    expect(thinTicks(years, 2000).map((t) => t.label)).toEqual(years.map((t) => t.label))
  })

  it('drops years that would overlap on a short rail', () => {
    const kept = thinTicks(years, 593)
    expect(kept.length).toBeGreaterThan(1)
    expect(kept.length).toBeLessThan(years.length)
    // 2016 sits 0.023 below 2017 — ~14px apart at this height, so it goes.
    expect(kept.map((t) => t.label)).not.toContain('2016')
    expect(kept.map((t) => t.label)).toContain('2015')
  })

  it('never reorders or invents ticks', () => {
    const kept = thinTicks(years, 400)
    expect(kept).toEqual(years.filter((y) => kept.includes(y)))
  })

  /**
   * A rail with no height yet put every tick at pixel 0, so thinning kept only
   * the first and the timeline showed a lone "2026".
   *
   * The renderer now waits for a real height instead of calling this, so all
   * this covers is the fallback for environments with no ResizeObserver —
   * there, too many labels beats one.
   */
  it('returns every tick when the rail has no height yet', () => {
    expect(thinTicks(years, 0)).toHaveLength(years.length)
    expect(thinTicks(years, -1)).toHaveLength(years.length)
  })

  it('handles a single tick and an empty list', () => {
    expect(thinTicks([], 500)).toEqual([])
    expect(thinTicks([years[0]], 500)).toHaveLength(1)
    expect(thinTicks([years[0]], 0)).toHaveLength(1)
  })
})
