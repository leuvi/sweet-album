import { describe, expect, it } from 'vitest'
import { anchorAt, computeVisibleRange, sameRange } from '../src/core/virtual'
import type { LayoutResult, ResolvedPhoto, Tile } from '../src/core/types'

/** 10 rows of 2 tiles each, 100px tall, stacked with no gap. */
function makeLayout(rows = 10, perRow = 2, rowHeight = 100): LayoutResult {
  const tiles: Tile[] = []
  const layoutRows = []

  for (let r = 0; r < rows; r++) {
    const from = tiles.length
    for (let c = 0; c < perRow; c++) {
      tiles.push({
        key: `t${r}-${c}`,
        x: c * 100,
        y: r * rowHeight,
        width: 100,
        height: rowHeight,
        photo: { key: `t${r}-${c}`, index: tiles.length } as ResolvedPhoto,
      })
    }
    layoutRows.push({ y: r * rowHeight, height: rowHeight, from, to: tiles.length })
  }

  return {
    totalHeight: rows * rowHeight,
    tiles,
    rows: layoutRows,
    headers: [],
    width: perRow * 100,
  }
}

describe('computeVisibleRange', () => {
  const layout = makeLayout()

  it('returns only the rows intersecting the viewport', () => {
    // Viewport 0-250 covers rows 0,1,2 -> tiles 0..6
    const range = computeVisibleRange(layout, 0, 250, 0)
    expect(range.tileFrom).toBe(0)
    expect(range.tileTo).toBe(6)
  })

  it('expands by the overscan on both sides', () => {
    const tight = computeVisibleRange(layout, 400, 100, 0)
    const loose = computeVisibleRange(layout, 400, 100, 100)
    expect(tight.tileFrom).toBe(8)
    expect(tight.tileTo).toBe(10)
    expect(loose.tileFrom).toBe(6)
    expect(loose.tileTo).toBe(12)
  })

  it('clamps at the ends instead of running off the array', () => {
    const top = computeVisibleRange(layout, 0, 100, 500)
    expect(top.tileFrom).toBe(0)

    const bottom = computeVisibleRange(layout, 900, 100, 500)
    expect(bottom.tileTo).toBe(layout.tiles.length)
  })

  it('is empty for an empty layout', () => {
    const range = computeVisibleRange(
      { totalHeight: 0, tiles: [], rows: [], headers: [], width: 0 },
      0,
      500,
      0,
    )
    expect(range.tileFrom).toBe(0)
    expect(range.tileTo).toBe(0)
  })

  it('scales to a large timeline without walking every row', () => {
    const big = makeLayout(20_000, 4, 220)
    const range = computeVisibleRange(big, 2_000_000, 800, 440)
    expect(range.tileTo - range.tileFrom).toBeLessThan(40)
    expect(range.tileFrom).toBeGreaterThan(0)
  })
})

describe('sameRange', () => {
  it('reports scrolls within the same row window as unchanged', () => {
    const layout = makeLayout()
    // Both windows span 100..300, i.e. rows 1 and 2 — nothing to re-render.
    const a = computeVisibleRange(layout, 100, 200, 0)
    const b = computeVisibleRange(layout, 110, 190, 0)
    expect(sameRange(a, b)).toBe(true)
  })

  it('reports a scroll that crosses into a new row as changed', () => {
    const layout = makeLayout()
    const a = computeVisibleRange(layout, 100, 200, 0)
    const c = computeVisibleRange(layout, 260, 200, 0)
    expect(sameRange(a, c)).toBe(false)
  })
})

describe('anchorAt', () => {
  it('reports the top visible tile and its offset above the fold', () => {
    const layout = makeLayout()
    const anchor = anchorAt(layout, 250)
    expect(anchor).toEqual({ key: 't2-0', offset: -50 })
  })

  it('returns null when there is nothing laid out', () => {
    expect(
      anchorAt({ totalHeight: 0, tiles: [], rows: [], headers: [], width: 0 }, 0),
    ).toBeNull()
  })
})
