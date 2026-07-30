import type { PhotoGroup, ResolvedPhoto } from './types'

const pad2 = (n: number) => (n < 10 ? `0${n}` : String(n))

export function dayKeyOf(photo: ResolvedPhoto): string {
  return `${photo.year}-${pad2(photo.month)}-${pad2(photo.day)}`
}

/**
 * Bucket an already-sorted photo list into calendar days.
 *
 * Input order is preserved inside each group and across groups, so the caller's
 * `order` option alone decides whether the timeline reads newest- or
 * oldest-first.
 */
export function groupByDay(photos: readonly ResolvedPhoto[]): PhotoGroup[] {
  const groups: PhotoGroup[] = []
  let current: PhotoGroup | null = null

  for (const photo of photos) {
    const key = dayKeyOf(photo)
    if (!current || current.key !== key) {
      current = {
        key,
        year: photo.year,
        month: photo.month,
        day: photo.day,
        photos: [],
      }
      groups.push(current)
    }
    current.photos.push(photo)
  }

  return groups
}
