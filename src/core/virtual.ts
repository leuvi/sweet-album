import type { LayoutResult } from './types'

export interface VisibleRange {
  /** Half-open tile index range. */
  tileFrom: number
  tileTo: number
  /** Half-open header index range. */
  headerFrom: number
  headerTo: number
}

export const EMPTY_RANGE: VisibleRange = {
  tileFrom: 0,
  tileTo: 0,
  headerFrom: 0,
  headerTo: 0,
}

/**
 * Index of the first block whose bottom edge is past `y`.
 *
 * Blocks are laid out top-to-bottom with monotonically increasing `y`, so a
 * plain binary search is enough — no per-scroll linear scanning, which is what
 * keeps a 100k-photo timeline cheap.
 */
function firstVisible(
  blocks: readonly { y: number; height: number }[],
  y: number,
): number {
  let lo = 0
  let hi = blocks.length
  while (lo < hi) {
    const mid = (lo + hi) >> 1
    if (blocks[mid].y + blocks[mid].height <= y) lo = mid + 1
    else hi = mid
  }
  return lo
}

/** Index one past the last block that starts before `y`. */
function endVisible(
  blocks: readonly { y: number; height: number }[],
  y: number,
  from: number,
): number {
  let lo = from
  let hi = blocks.length
  while (lo < hi) {
    const mid = (lo + hi) >> 1
    if (blocks[mid].y < y) lo = mid + 1
    else hi = mid
  }
  return lo
}

/**
 * Which tiles and headers intersect the viewport, padded by `overscan` rows
 * worth of pixels on each side.
 */
export function computeVisibleRange(
  layout: LayoutResult,
  scrollTop: number,
  viewportHeight: number,
  overscanPx: number,
): VisibleRange {
  const { rows, headers, tiles } = layout
  if (rows.length === 0) return EMPTY_RANGE

  const top = scrollTop - overscanPx
  const bottom = scrollTop + viewportHeight + overscanPx

  const rowFrom = firstVisible(rows, top)
  const rowTo = endVisible(rows, bottom, rowFrom)

  const headerFrom = headers.length ? firstVisible(headers, top) : 0
  const headerTo = headers.length ? endVisible(headers, bottom, headerFrom) : 0

  return {
    tileFrom: rowFrom < rows.length ? rows[rowFrom].from : tiles.length,
    tileTo: rowTo > rowFrom ? rows[rowTo - 1].to : rowFrom < rows.length ? rows[rowFrom].from : tiles.length,
    headerFrom,
    headerTo,
  }
}

export function sameRange(a: VisibleRange, b: VisibleRange): boolean {
  return (
    a.tileFrom === b.tileFrom &&
    a.tileTo === b.tileTo &&
    a.headerFrom === b.headerFrom &&
    a.headerTo === b.headerTo
  )
}

/**
 * The topmost tile currently on screen, plus how far it has scrolled past the
 * top edge. Used as an anchor so a resize-driven relayout keeps the user
 * looking at the same photo instead of jumping.
 */
export function anchorAt(
  layout: LayoutResult,
  scrollTop: number,
): { key: string; offset: number } | null {
  const idx = firstVisible(layout.rows, scrollTop)
  const row = layout.rows[idx]
  if (!row) return null
  const tile = layout.tiles[row.from]
  if (!tile) return null
  return { key: tile.key, offset: tile.y - scrollTop }
}
