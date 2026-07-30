import { groupByDay } from './group'
import { normalize } from './normalize'
import type { PhotoGroup, PhotoItem, ResolvedPhoto } from './types'

/**
 * Timeline data plus the two pieces of per-photo UI state we own: selection and
 * favorites. Both are keyed by the stringified photo id so they survive a data
 * refresh that returns the same photos in a different order.
 */
export class Store {
  photos: ResolvedPhoto[] = []
  groups: PhotoGroup[] = []
  byKey = new Map<string, number>()

  readonly selection = new Set<string>()
  readonly favorites = new Set<string>()

  /** Photos dropped during normalization, with a reason. */
  rejected: { item: PhotoItem; reason: string }[] = []

  setData(items: readonly PhotoItem[], order: 'desc' | 'asc'): void {
    const result = normalize(items, order)
    this.photos = result.photos
    this.byKey = result.byKey
    this.rejected = result.rejected
    this.groups = groupByDay(result.photos)

    this.favorites.clear()
    for (const photo of result.photos) {
      if (photo.raw.favorite) this.favorites.add(photo.key)
    }

    // Drop selected ids that no longer exist.
    for (const key of [...this.selection]) {
      if (!this.byKey.has(key)) this.selection.delete(key)
    }
  }

  photoAt(index: number): ResolvedPhoto | undefined {
    return this.photos[index]
  }

  photoByKey(key: string): ResolvedPhoto | undefined {
    const index = this.byKey.get(key)
    return index === undefined ? undefined : this.photos[index]
  }

  /* ------------------------------------------------------------ selection */

  isSelected(key: string): boolean {
    return this.selection.has(key)
  }

  toggleSelected(key: string, force?: boolean): boolean {
    const next = force ?? !this.selection.has(key)
    if (next) this.selection.add(key)
    else this.selection.delete(key)
    return next
  }

  /** `all` / `none` / `some` — drives the tri-state circle on a day header. */
  groupSelectionState(group: PhotoGroup): 'all' | 'none' | 'some' {
    let selected = 0
    for (const photo of group.photos) {
      if (this.selection.has(photo.key)) selected++
    }
    if (selected === 0) return 'none'
    return selected === group.photos.length ? 'all' : 'some'
  }

  setGroupSelected(group: PhotoGroup, selected: boolean): void {
    for (const photo of group.photos) {
      if (selected) this.selection.add(photo.key)
      else this.selection.delete(photo.key)
    }
  }

  clearSelection(): void {
    this.selection.clear()
  }

  /** Selected photos in timeline order. */
  selectedPhotos(): ResolvedPhoto[] {
    if (this.selection.size === 0) return []
    return this.photos.filter((p) => this.selection.has(p.key))
  }

  /* ------------------------------------------------------------ favorites */

  isFavorite(key: string): boolean {
    return this.favorites.has(key)
  }

  setFavorite(key: string, favorite: boolean): void {
    if (favorite) this.favorites.add(key)
    else this.favorites.delete(key)
  }
}
