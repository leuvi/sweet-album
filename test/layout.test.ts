import { describe, expect, it } from 'vitest'
import { groupByDay } from '../src/core/group'
import { layoutJustified } from '../src/core/layout/justified'
import { normalize } from '../src/core/normalize'
import type { PhotoItem } from '../src/core/types'

const CONFIG = {
  width: 1000,
  gap: 4,
  targetRowHeight: 200,
  headerHeight: 40,
  groupSpacing: 20,
  lastRowMaxRatio: 1.5,
}

function makePhotos(specs: [w: number, h: number, day: string][]): PhotoItem[] {
  return specs.map(([width, height, day], i) => ({
    id: `p${i}`,
    width,
    height,
    takenAt: day,
    thumbUrl: `/${i}.jpg`,
  }))
}

function build(items: PhotoItem[]) {
  const { photos } = normalize(items, 'desc')
  return layoutJustified(groupByDay(photos), CONFIG)
}

describe('layoutJustified', () => {
  it('never distorts: every tile keeps its source aspect ratio', () => {
    const items = makePhotos([
      [4000, 3000, '2024-03-02'],
      [1080, 1920, '2024-03-02'],
      [3000, 1000, '2024-03-02'],
      [800, 800, '2024-03-02'],
      [1600, 900, '2024-03-01'],
      [900, 1600, '2024-03-01'],
    ])
    const layout = build(items)

    expect(layout.tiles).toHaveLength(6)
    for (const tile of layout.tiles) {
      const rendered = tile.width / tile.height
      const source = tile.photo.width / tile.photo.height
      // Only integer rounding separates the two.
      expect(Math.abs(rendered - source)).toBeLessThan(0.03)
    }
  })

  it('fills full rows exactly to the content width', () => {
    const items = makePhotos(
      Array.from({ length: 24 }, (_, i) => [1200 + i * 40, 800, '2024-05-04'] as [number, number, string]),
    )
    const layout = build(items)

    // The trailing row is allowed to be short; all others must be flush.
    const rows = layout.rows.slice(0, -1)
    expect(rows.length).toBeGreaterThan(2)

    for (const row of rows) {
      const tiles = layout.tiles.slice(row.from, row.to)
      const last = tiles[tiles.length - 1]
      expect(last.x + last.width).toBe(CONFIG.width)
    }
  })

  it('keeps row heights near the target', () => {
    const items = makePhotos(
      Array.from({ length: 40 }, (_, i) => {
        const portrait = i % 3 === 0
        return [portrait ? 900 : 1600, portrait ? 1600 : 900, '2024-05-04'] as [
          number,
          number,
          string,
        ]
      }),
    )
    const layout = build(items)

    for (const row of layout.rows.slice(0, -1)) {
      expect(row.height).toBeGreaterThan(CONFIG.targetRowHeight * 0.55)
      expect(row.height).toBeLessThan(CONFIG.targetRowHeight * 1.6)
    }
  })

  it('emits one header per day and never mixes days in a row', () => {
    const items = makePhotos([
      [1600, 900, '2024-05-04'],
      [1600, 900, '2024-05-04'],
      [1600, 900, '2024-05-03'],
      [1600, 900, '2024-05-01'],
    ])
    const layout = build(items)

    expect(layout.headers.map((h) => h.key)).toEqual([
      '2024-05-04',
      '2024-05-03',
      '2024-05-01',
    ])

    for (const row of layout.rows) {
      const days = new Set(
        layout.tiles.slice(row.from, row.to).map((t) => t.photo.day),
      )
      expect(days.size).toBe(1)
    }
  })

  it('lays blocks out top-to-bottom without overlap', () => {
    const items = makePhotos(
      Array.from({ length: 60 }, (_, i) => [
        1200,
        900,
        `2024-05-${String((i % 6) + 1).padStart(2, '0')}`,
      ] as [number, number, string]),
    )
    const layout = build(items)

    let previousBottom = -Infinity
    for (const row of layout.rows) {
      expect(row.y).toBeGreaterThanOrEqual(previousBottom - 0.001)
      previousBottom = row.y + row.height
    }
    expect(layout.totalHeight).toBeGreaterThanOrEqual(previousBottom - CONFIG.gap)
  })

  it('is empty when the container has no width', () => {
    const layout = layoutJustified(
      groupByDay(normalize(makePhotos([[1600, 900, '2024-05-04']]), 'desc').photos),
      { ...CONFIG, width: 0 },
    )
    expect(layout.tiles).toHaveLength(0)
    expect(layout.totalHeight).toBe(0)
  })

  it('handles a single very wide photo without exceeding the width', () => {
    const layout = build(makePhotos([[8000, 500, '2024-05-04']]))
    const tile = layout.tiles[0]
    expect(tile.x + tile.width).toBeLessThanOrEqual(CONFIG.width)
  })
})
