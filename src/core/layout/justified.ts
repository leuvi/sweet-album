import type {
  HeaderBlock,
  LayoutResult,
  LayoutRow,
  PhotoGroup,
  Tile,
} from '../types'

export interface JustifiedConfig {
  /** Content width available for tiles, px. */
  width: number
  gap: number
  targetRowHeight: number
  /** Height reserved for each group header, px. */
  headerHeight: number
  /** Extra space below a group before the next header, px. */
  groupSpacing: number
  /**
   * A trailing row is stretched to full width only while its natural height
   * stays within `targetRowHeight * lastRowMaxRatio`; beyond that it is left
   * aligned at the target height so two photos never balloon to fill a row.
   */
  lastRowMaxRatio: number
}

export const DEFAULT_JUSTIFIED: Omit<JustifiedConfig, 'width'> = {
  gap: 4,
  targetRowHeight: 220,
  headerHeight: 44,
  groupSpacing: 20,
  lastRowMaxRatio: 1.5,
}

/**
 * Height a row would take if `sumRatio` worth of aspect ratios were stretched
 * across the full content width with `count - 1` gaps in between.
 */
function rowHeightFor(
  width: number,
  gap: number,
  sumRatio: number,
  count: number,
): number {
  const usable = width - gap * Math.max(0, count - 1)
  return usable > 0 && sumRatio > 0 ? usable / sumRatio : 0
}

/**
 * Google-Photos style justified rows.
 *
 * Every tile's width is derived as `ratio * rowHeight`, where `ratio` comes
 * straight from the original pixel dimensions — so a photo is only ever scaled
 * uniformly and can never be squashed or stretched.
 */
export function layoutJustified(
  groups: readonly PhotoGroup[],
  config: JustifiedConfig,
): LayoutResult {
  const { width, gap, targetRowHeight, headerHeight, groupSpacing } = config
  const tiles: Tile[] = []
  const rows: LayoutRow[] = []
  const headers: HeaderBlock[] = []

  if (width <= 0) {
    return { totalHeight: 0, tiles, rows, headers, width }
  }

  let y = 0

  for (const group of groups) {
    if (group.photos.length === 0) continue

    const headerFrom = tiles.length
    if (headerHeight > 0) {
      headers.push({
        key: group.key,
        y,
        height: headerHeight,
        group,
        from: headerFrom,
        to: headerFrom + group.photos.length,
      })
      y += headerHeight
    }

    let start = 0
    while (start < group.photos.length) {
      // Grow the row until it can no longer stay above the target height.
      let sumRatio = 0
      let end = start
      let height = 0

      while (end < group.photos.length) {
        const next = sumRatio + group.photos[end].ratio
        const nextHeight = rowHeightFor(width, gap, next, end - start + 1)

        if (nextHeight < targetRowHeight && end > start) {
          // Adding this photo overshoots — keep whichever count lands closer.
          const withoutIt = rowHeightFor(width, gap, sumRatio, end - start)
          if (
            Math.abs(nextHeight - targetRowHeight) <
            Math.abs(withoutIt - targetRowHeight)
          ) {
            sumRatio = next
            end++
            height = nextHeight
          } else {
            height = withoutIt
          }
          break
        }

        sumRatio = next
        end++
        height = nextHeight
      }

      const isLastRow = end >= group.photos.length
      const full = !isLastRow || height <= targetRowHeight * config.lastRowMaxRatio
      const rowHeight = Math.round(full ? height : targetRowHeight)

      const rowFrom = tiles.length
      let x = 0

      for (let i = start; i < end; i++) {
        const photo = group.photos[i]
        const isLastInRow = i === end - 1
        let tileWidth = Math.round(photo.ratio * rowHeight)

        // Absorb accumulated rounding error so a full row lands exactly on the
        // right edge instead of leaving a ragged 1-3px sliver.
        if (full && isLastInRow) tileWidth = Math.max(1, width - x)

        tiles.push({
          key: photo.key,
          x,
          y,
          width: tileWidth,
          height: rowHeight,
          photo,
        })
        x += tileWidth + gap
      }

      rows.push({ y, height: rowHeight, from: rowFrom, to: tiles.length })
      y += rowHeight + gap
      start = end
    }

    // The trailing row contributed a gap; swap it for the group spacing.
    y = y - gap + groupSpacing
  }

  const totalHeight = Math.max(0, y - groupSpacing)
  return { totalHeight, tiles, rows, headers, width }
}
