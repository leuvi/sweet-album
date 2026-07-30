import type { PhotoItem, ResolvedPhoto } from './types'

/**
 * Parse `takenAt` into epoch milliseconds.
 *
 * Bare `YYYY-MM-DD` strings are treated as *local* dates rather than UTC — the
 * spec says the opposite, but a photo dated `2023-11-07` must not slide into
 * the 6th for anyone west of Greenwich, since the day is the grouping key.
 */
export function parseTime(value: unknown): number {
  if (value instanceof Date) return value.getTime()
  if (typeof value === 'number') return value

  if (typeof value === 'string') {
    const dateOnly = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value)
    if (dateOnly) {
      return new Date(
        Number(dateOnly[1]),
        Number(dateOnly[2]) - 1,
        Number(dateOnly[3]),
      ).getTime()
    }
    const parsed = Date.parse(value)
    if (!Number.isNaN(parsed)) return parsed
  }

  return NaN
}

export interface NormalizeResult {
  photos: ResolvedPhoto[]
  /** key -> index into `photos`. */
  byKey: Map<string, number>
  /** Items that had to be dropped, with the reason. */
  rejected: { item: PhotoItem; reason: string }[]
}

/**
 * Validate, resolve and sort the caller's photo list.
 *
 * Items without usable dimensions or a parseable date are dropped rather than
 * silently mis-laid-out; the caller learns about them via `rejected`.
 */
export function normalize(
  items: readonly PhotoItem[],
  order: 'desc' | 'asc' = 'desc',
): NormalizeResult {
  const photos: ResolvedPhoto[] = []
  const rejected: NormalizeResult['rejected'] = []
  const seen = new Set<string>()

  for (const item of items) {
    if (!item || item.id === undefined || item.id === null) {
      rejected.push({ item, reason: 'missing id' })
      continue
    }

    const key = String(item.id)
    if (seen.has(key)) {
      rejected.push({ item, reason: `duplicate id "${key}"` })
      continue
    }

    const width = Number(item.width)
    const height = Number(item.height)
    if (!(width > 0) || !(height > 0)) {
      rejected.push({ item, reason: 'width/height must be positive numbers' })
      continue
    }

    const time = parseTime(item.takenAt)
    if (Number.isNaN(time)) {
      rejected.push({ item, reason: 'takenAt could not be parsed' })
      continue
    }

    if (!item.thumbUrl && !item.url) {
      rejected.push({ item, reason: 'thumbUrl or url is required' })
      continue
    }

    const date = new Date(time)
    seen.add(key)
    photos.push({
      raw: item,
      id: item.id,
      key,
      width,
      height,
      ratio: width / height,
      time,
      year: date.getFullYear(),
      month: date.getMonth() + 1,
      day: date.getDate(),
      thumbUrl: item.thumbUrl || item.url!,
      url: item.url || item.thumbUrl,
      alt: item.alt ?? key,
      index: 0,
    })
  }

  const dir = order === 'asc' ? 1 : -1
  photos.sort((a, b) => {
    if (a.time !== b.time) return (a.time - b.time) * dir
    // Stable, deterministic tiebreak so layout never jitters between runs.
    return a.key < b.key ? -1 : a.key > b.key ? 1 : 0
  })

  const byKey = new Map<string, number>()
  photos.forEach((p, i) => {
    p.index = i
    byKey.set(p.key, i)
  })

  return { photos, byKey, rejected }
}
