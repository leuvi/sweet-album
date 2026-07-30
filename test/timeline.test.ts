import { describe, expect, it } from 'vitest'
import { layoutTicks, type Tick } from '../src/core/timeline'

/** Ten years, positioned as the demo library actually lays out. */
const years: Tick[] = [
  { at: 0.0, label: '2026' },
  { at: 0.069, label: '2025' },
  { at: 0.233, label: '2024' },
  { at: 0.32, label: '2023' },
  { at: 0.402, label: '2021' },
  { at: 0.53, label: '2019' },
  { at: 0.6, label: '2018' },
  { at: 0.692, label: '2017' },
  // 0.023 below 2017 — 13.6px apart on a 593px rail, i.e. overlapping.
  { at: 0.715, label: '2016' },
  { at: 0.799, label: '2015' },
]

const labelsOf = (ticks: { label: string }[]) => ticks.map((t) => t.label)
const minSpacing = (placed: { y: number }[]) =>
  Math.min(...placed.slice(1).map((p, i) => p.y - placed[i].y))

describe('layoutTicks', () => {
  /** The requirement: a year with photos is always reachable on the rail. */
  it('never drops a year, however cramped', () => {
    for (const height of [40, 120, 300, 593, 1200, 4000]) {
      expect(labelsOf(layoutTicks(years, height))).toEqual(labelsOf(years))
    }
  })

  it('keeps labels from overlapping at the demo height', () => {
    const placed = layoutTicks(years, 593)
    expect(minSpacing(placed)).toBeGreaterThanOrEqual(22)
  })

  it('nudges only what collides, leaving the rest on their true position', () => {
    const height = 593
    const placed = layoutTicks(years, height)
    const moved = placed.filter((p) => Math.abs(p.y - p.at * height) > 0.5)
    // 2016 is the only one too close to its neighbour.
    expect(labelsOf(moved)).toEqual(['2016'])
  })

  it('preserves order', () => {
    const placed = layoutTicks(years, 593)
    for (let i = 1; i < placed.length; i++) {
      expect(placed[i].y).toBeGreaterThan(placed[i - 1].y)
    }
  })

  it('stays inside the rail', () => {
    for (const height of [120, 300, 593, 1200]) {
      const placed = layoutTicks(years, height)
      expect(placed[0].y).toBeGreaterThanOrEqual(0)
      expect(placed[placed.length - 1].y).toBeLessThanOrEqual(height)
    }
  })

  it('shrinks the gap rather than hiding labels when space runs out', () => {
    // 10 labels need 198px at the preferred 22px gap; give them 90px.
    const placed = layoutTicks(years, 90)
    expect(placed).toHaveLength(years.length)
    expect(placed[0].y).toBeGreaterThanOrEqual(0)
    expect(placed[placed.length - 1].y).toBeLessThanOrEqual(90)
    expect(minSpacing(placed)).toBeGreaterThan(0)
  })

  /**
   * The renderer positions by percentage when the rail cannot be measured, so
   * this path is only a guard. It must still be total and lose nothing.
   */
  it('stays total when handed an unmeasurable height', () => {
    expect(labelsOf(layoutTicks(years, 0))).toEqual(labelsOf(years))
    expect(labelsOf(layoutTicks(years, -5))).toEqual(labelsOf(years))
  })

  it('handles a single tick and an empty list', () => {
    expect(layoutTicks([], 593)).toEqual([])
    expect(layoutTicks([years[0]], 593)).toHaveLength(1)
    expect(layoutTicks([years[0]], 0)).toHaveLength(1)
  })
})
