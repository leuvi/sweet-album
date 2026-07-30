import { ContextMenu } from './contextmenu'
import { resolveMessages } from './i18n'
import { DEFAULT_JUSTIFIED, layoutJustified } from './layout/justified'
import { GridRenderer } from './renderer'
import { Store } from './store'
import { Timeline } from './timeline'
import { Toolbar } from './toolbar'
import type {
  DataSource,
  EventHandler,
  EventName,
  LayoutResult,
  Locale,
  Messages,
  PhotoGroup,
  PhotoItem,
  ResolvedPhoto,
  SweetAlbumEvents,
  SweetAlbumOptions,
  Theme,
  ViewerOptions,
} from './types'
import { clamp, el } from './utils/dom'
import { Emitter } from './utils/emitter'
import { rafThrottle, throttle } from './utils/raf'
import { anchorAt } from './virtual'
import { Viewer } from './viewer/viewer'

const DEFAULTS = {
  order: 'desc' as const,
  gap: DEFAULT_JUSTIFIED.gap,
  targetRowHeight: DEFAULT_JUSTIFIED.targetRowHeight,
  headerHeight: DEFAULT_JUSTIFIED.headerHeight,
  groupSpacing: DEFAULT_JUSTIFIED.groupSpacing,
  overscan: 2,
  selectable: true,
  favorite: true,
  header: true,
  timeline: true,
  locale: 'en' as Locale,
  theme: 'dark' as Theme,
}

const EMPTY_LAYOUT: LayoutResult = {
  totalHeight: 0,
  tiles: [],
  rows: [],
  headers: [],
  width: 0,
}

/**
 * A single continuous, day-grouped photo timeline.
 *
 * Framework-agnostic: this class owns all the behaviour and the React/Vue
 * wrappers are thin lifecycle shims around it.
 */
export class SweetAlbum {
  readonly root: HTMLElement

  private options: SweetAlbumOptions
  private messages: Messages
  private readonly store = new Store()
  private readonly emitter = new Emitter()

  private body!: HTMLElement
  private scroller!: HTMLElement
  private content!: HTMLElement
  private empty!: HTMLElement
  private renderer!: GridRenderer
  private toolbar: Toolbar | null = null
  private timeline: Timeline | null = null
  private menu: ContextMenu
  private viewer: Viewer

  private layout: LayoutResult = EMPTY_LAYOUT
  private resizeObserver: ResizeObserver | null = null
  private disposers: (() => void)[] = []
  private destroyed = false
  /** Set when a relayout was skipped because the container had no width yet. */
  private pendingLayout = false

  constructor(container: HTMLElement | string, options: SweetAlbumOptions = {}) {
    const host =
      typeof container === 'string'
        ? document.querySelector<HTMLElement>(container)
        : container
    if (!host) throw new Error(`[sweet-album] container not found: ${container}`)

    this.options = { ...options }
    this.messages = resolveMessages(this.opt('locale'), options.messages)

    this.root = el('div', 'sweet-album')
    this.root.dataset.theme = this.opt('theme')
    host.appendChild(this.root)

    this.menu = new ContextMenu(() => this.root)
    this.viewer = new Viewer(
      {
        photos: () => this.store.photos,
        messages: () => this.messages,
        theme: () => this.root.dataset.theme ?? 'dark',
        onOpen: (item, index) => this.emit('viewerOpen', item, index),
        onClose: () => this.emit('viewerClose'),
      },
      this.viewerOptions(),
    )

    this.buildDom()

    if (options.data) void this.setData(options.data)
    else this.applyData([])
  }

  /* ----------------------------------------------------------------- dom */

  private buildDom(): void {
    if (this.opt('header')) {
      this.toolbar = new Toolbar(this.root, {
        messages: () => this.messages,
        selected: () => this.store.selectedPhotos().map((p) => p.raw),
        actions: (selected) => {
          const spec = this.options.selectionActions
          if (!spec) return []
          return typeof spec === 'function' ? spec(selected) : spec
        },
        onClear: () => this.clearSelection(),
      })
    }

    // The timeline is positioned against `body`, not the root — anchoring it to
    // the root would float it over the top bar.
    this.body = el('div', 'sp-body', this.root)
    this.scroller = el('div', 'sp-scroller', this.body)
    this.scroller.tabIndex = 0
    this.content = el('div', 'sp-content', this.scroller)
    this.empty = el('div', 'sp-empty', this.scroller)
    this.empty.hidden = true

    this.renderer = new GridRenderer(this.content, {
      store: this.store,
      messages: () => this.messages,
      selectable: () => this.opt('selectable'),
      favorite: () => this.opt('favorite'),
      thumbUrl: this.options.thumbUrl,
      badges: this.options.badges ? (item) => this.options.badges!(item) : undefined,
      onTileClick: (photo, ev) => this.handleTileClick(photo, ev),
      onToggleSelect: (photo) => this.toggleSelection(photo.key),
      onToggleFavorite: (photo) => void this.toggleFavorite(photo.key),
      onGroupToggle: (group) => this.toggleGroup(group),
      onContextMenu: (ev, photo) => this.handleContextMenu(ev, photo),
    })

    if (this.opt('timeline')) {
      this.timeline = new Timeline(
        this.body,
        () => this.messages,
        (fraction) => this.seek(fraction),
      )
    }

    this.scroller.addEventListener('scroll', this.onScroll, { passive: true })
    this.disposers.push(() =>
      this.scroller.removeEventListener('scroll', this.onScroll),
    )

    if (typeof ResizeObserver !== 'undefined') {
      this.resizeObserver = new ResizeObserver(this.onContainerResize)
      this.resizeObserver.observe(this.scroller)
    } else {
      window.addEventListener('resize', this.onContainerResize)
      this.disposers.push(() =>
        window.removeEventListener('resize', this.onContainerResize),
      )
    }
  }

  /* ---------------------------------------------------------------- data */

  /** Replace the timeline. Accepts an array or a (possibly async) provider. */
  async setData(data: DataSource): Promise<void> {
    try {
      const items = typeof data === 'function' ? await data() : data
      if (this.destroyed) return
      this.applyData(items ?? [])
    } catch (err) {
      this.fail(err)
    }
  }

  private applyData(items: readonly PhotoItem[]): void {
    this.store.setData(items, this.opt('order'))

    for (const { item, reason } of this.store.rejected) {
      this.fail(new Error(`[sweet-album] skipped photo ${String(item?.id)}: ${reason}`))
    }

    this.empty.hidden = this.store.photos.length > 0
    this.empty.textContent = this.messages.empty

    this.relayout(true)
    this.syncToolbar()
    this.emit('ready', { count: this.store.photos.length })
  }

  /* -------------------------------------------------------------- layout */

  /** Recompute geometry. Preserves the photo at the top of the viewport. */
  private relayout(force = false): void {
    const width = this.content.clientWidth
    if (width <= 0) {
      // Container is hidden or not measured yet — retry on the next resize.
      this.pendingLayout = true
      return
    }
    this.pendingLayout = false
    if (!force && width === this.layout.width) return

    const anchor = force ? null : anchorAt(this.layout, this.scroller.scrollTop)

    this.layout = layoutJustified(this.store.groups, {
      width,
      gap: this.opt('gap'),
      targetRowHeight: this.rowHeightFor(width),
      headerHeight: this.opt('headerHeight'),
      groupSpacing: this.opt('groupSpacing'),
      lastRowMaxRatio: DEFAULT_JUSTIFIED.lastRowMaxRatio,
    })

    this.renderer.setLayout(this.layout)

    // Setting the content height can bring the vertical scrollbar into
    // existence, which narrows the content box we just laid out against. Redo
    // it once at the corrected width rather than leaving rows overhanging for
    // a frame (browsers without `scrollbar-gutter` support).
    const settled = this.content.clientWidth
    if (settled > 0 && settled !== width) {
      this.layout = layoutJustified(this.store.groups, {
        width: settled,
        gap: this.opt('gap'),
        targetRowHeight: this.rowHeightFor(settled),
        headerHeight: this.opt('headerHeight'),
        groupSpacing: this.opt('groupSpacing'),
        lastRowMaxRatio: DEFAULT_JUSTIFIED.lastRowMaxRatio,
      })
      this.renderer.setLayout(this.layout)
    }

    this.timeline?.setLayout(this.layout)
    this.timeline?.setVisible(
      this.opt('timeline') && this.layout.totalHeight > this.scroller.clientHeight,
    )

    if (anchor) {
      const photo = this.store.photoByKey(anchor.key)
      const tile = photo ? this.tileFor(photo) : null
      if (tile) this.scroller.scrollTop = Math.max(0, tile.y - anchor.offset)
    }

    this.paint()
  }

  /**
   * Row height to lay out at.
   *
   * When the caller has not pinned `targetRowHeight`, scale it to the container
   * so a phone gets roughly three photos per row instead of one and a half.
   * An explicit option always wins.
   */
  private rowHeightFor(width: number): number {
    const explicit = this.options.targetRowHeight
    if (explicit !== undefined) return explicit
    return Math.round(clamp(width / 3, 120, DEFAULTS.targetRowHeight))
  }

  private tileFor(photo: ResolvedPhoto) {
    // Tiles are emitted in photo order, so the index usually matches directly.
    const direct = this.layout.tiles[photo.index]
    if (direct?.key === photo.key) return direct
    return this.layout.tiles.find((t) => t.key === photo.key) ?? null
  }

  private paint(): void {
    const overscanPx = this.opt('overscan') * this.rowHeightFor(this.layout.width)
    this.renderer.update(this.scroller.scrollTop, this.scroller.clientHeight, overscanPx)
    if (this.layout.totalHeight > 0) {
      this.timeline?.setProgress(this.scroller.scrollTop / this.layout.totalHeight)
    }
  }

  private onScroll = rafThrottle((): void => {
    if (!this.destroyed) this.paint()
  })

  /**
   * A relayout walks every photo, so a window drag must not run one per frame.
   * Leading edge keeps it responsive; the trailing call settles on the final
   * size once the drag stops.
   */
  private onResize = throttle((): void => {
    if (this.destroyed) return
    this.relayout()
    this.timeline?.relayout()
  }, 100)

  /**
   * ResizeObserver entry point.
   *
   * A pending first layout is run synchronously rather than through the rAF
   * throttle: rAF never fires in a background tab, which would otherwise leave
   * an album mounted while hidden permanently blank.
   */
  private onContainerResize = (): void => {
    if (this.destroyed) return
    if (this.pendingLayout) {
      this.relayout(true)
      this.timeline?.relayout()
      return
    }
    this.onResize()
  }

  /* ----------------------------------------------------------- selection */

  private handleTileClick(photo: ResolvedPhoto, ev: MouseEvent): void {
    this.emit('itemClick', photo.raw, photo.index, ev)
    if (ev.defaultPrevented) return
    if (this.options.viewer !== false) this.viewer.open(photo.index)
  }

  private toggleSelection(key: string): void {
    this.store.toggleSelected(key)
    this.renderer.refresh(key)
    this.syncToolbar()
    this.emitSelection()
  }

  private toggleGroup(group: PhotoGroup): void {
    const next = this.store.groupSelectionState(group) !== 'all'
    this.store.setGroupSelected(group, next)
    this.renderer.refresh()
    this.syncToolbar()
    this.emitSelection()
  }

  private emitSelection(): void {
    const photos = this.store.selectedPhotos()
    this.emit(
      'selectionChange',
      photos.map((p) => p.id),
      photos.map((p) => p.raw),
    )
  }

  private syncToolbar(): void {
    this.toolbar?.setVisible(this.opt('header'))
    this.toolbar?.update(this.store.photos.length, this.store.selection.size)
    // Drives "selection mode" on touch, where there is no hover to reveal
    // the per-tile checkboxes.
    this.root.classList.toggle('is-selecting', this.store.selection.size > 0)
  }

  /* ----------------------------------------------------------- favorites */

  private async toggleFavorite(key: string): Promise<void> {
    const photo = this.store.photoByKey(key)
    if (!photo) return

    const previous = this.store.isFavorite(key)
    const next = !previous

    // Optimistic: flip immediately, roll back if the host rejects.
    this.store.setFavorite(key, next)
    this.renderer.refresh(key)
    this.emit('favoriteToggle', photo.raw, next)

    const result = this.options.onFavoriteToggle?.(photo.raw, next)
    if (!result || typeof (result as Promise<unknown>).then !== 'function') return

    try {
      await result
    } catch (err) {
      this.store.setFavorite(key, previous)
      this.renderer.refresh(key)
      this.fail(err)
    }
  }

  /* --------------------------------------------------------- context menu */

  private handleContextMenu(ev: MouseEvent, photo: ResolvedPhoto | null): void {
    const build = this.options.contextMenu
    if (!build) return

    const item = photo?.raw ?? null
    const selected = this.store.selectedPhotos().map((p) => p.raw)
    const items = build({ item, selected, close: () => this.menu.close() })
    if (items === false || !items?.length) return

    ev.preventDefault()
    this.menu.open(items, ev.clientX, ev.clientY, { item, selected })
  }

  /* ------------------------------------------------------------ public API */

  /** All photos currently in the timeline, in display order. */
  getPhotos(): PhotoItem[] {
    return this.store.photos.map((p) => p.raw)
  }

  getSelection(): PhotoItem[] {
    return this.store.selectedPhotos().map((p) => p.raw)
  }

  getSelectedIds(): (string | number)[] {
    return this.store.selectedPhotos().map((p) => p.id)
  }

  setSelection(ids: readonly (string | number)[]): void {
    this.store.clearSelection()
    for (const id of ids) {
      const key = String(id)
      if (this.store.byKey.has(key)) this.store.selection.add(key)
    }
    this.renderer.refresh()
    this.syncToolbar()
    this.emitSelection()
  }

  selectAll(): void {
    this.setSelection(this.store.photos.map((p) => p.id))
  }

  clearSelection(): void {
    if (this.store.selection.size === 0) return
    this.store.clearSelection()
    this.renderer.refresh()
    this.syncToolbar()
    this.emitSelection()
  }

  getFavorites(): (string | number)[] {
    return this.store.photos.filter((p) => this.store.isFavorite(p.key)).map((p) => p.id)
  }

  /** Set favorite state without firing `onFavoriteToggle`. */
  setFavorite(id: string | number, favorite: boolean): void {
    const key = String(id)
    if (!this.store.byKey.has(key)) return
    this.store.setFavorite(key, favorite)
    this.renderer.refresh(key)
  }

  /** Open the viewer at a photo id or timeline index. */
  open(target: string | number): void {
    if (this.options.viewer === false) return
    const byId = this.store.byKey.get(String(target))
    const index = byId ?? (typeof target === 'number' ? target : -1)
    this.viewer.open(index)
  }

  closeViewer(): void {
    this.viewer.close()
  }

  scrollToIndex(index: number, behavior: ScrollBehavior = 'auto'): void {
    const photo = this.store.photos[index]
    const tile = photo ? this.tileFor(photo) : null
    if (tile) this.scroller.scrollTo({ top: Math.max(0, tile.y - 8), behavior })
  }

  /**
   * Jump to the day group nearest the given date.
   *
   * "Nearest" rather than "on or after" so a date outside the timeline still
   * lands somewhere useful — asking for the year before your oldest photo
   * scrolls to the bottom instead of doing nothing.
   */
  scrollToDate(year: number, month = 1, day = 1, behavior: ScrollBehavior = 'auto'): void {
    const headers = this.layout.headers
    if (headers.length === 0) return

    const target = new Date(year, month - 1, day).getTime()
    const timeOf = (index: number) => {
      const g = headers[index].group
      return new Date(g.year, g.month - 1, g.day).getTime()
    }

    // Headers are monotonic in time; `order` decides which way.
    const ascending = timeOf(headers.length - 1) >= timeOf(0)

    let lo = 0
    let hi = headers.length - 1
    while (lo < hi) {
      const mid = (lo + hi) >> 1
      const passed = ascending ? timeOf(mid) < target : timeOf(mid) > target
      if (passed) lo = mid + 1
      else hi = mid
    }

    // The header just before the crossing point may still be the closer one.
    let best = lo
    if (
      lo > 0 &&
      Math.abs(timeOf(lo - 1) - target) < Math.abs(timeOf(lo) - target)
    ) {
      best = lo - 1
    }

    this.scroller.scrollTo({ top: headers[best].y, behavior })
  }

  private seek(fraction: number): void {
    const max = Math.max(0, this.scroller.scrollHeight - this.scroller.clientHeight)
    this.scroller.scrollTop = clamp(fraction * this.layout.totalHeight, 0, max)
  }

  setLocale(locale: Locale): void {
    this.options.locale = locale
    this.messages = resolveMessages(locale, this.options.messages)
    this.empty.textContent = this.messages.empty
    this.renderer.refresh()
    this.timeline?.setLayout(this.layout)
    this.syncToolbar()
  }

  setTheme(theme: Theme): void {
    this.options.theme = theme
    this.root.dataset.theme = theme
  }

  /**
   * Merge in new options. Geometry-affecting keys trigger a relayout, so this
   * is what the framework wrappers call on every prop change.
   */
  setOptions(next: Partial<SweetAlbumOptions>): void {
    const geometryKeys: (keyof SweetAlbumOptions)[] = [
      'gap',
      'targetRowHeight',
      'headerHeight',
      'groupSpacing',
      'order',
    ]
    const needsLayout = geometryKeys.some(
      (key) => key in next && next[key] !== this.options[key],
    )
    const needsData = 'order' in next && next.order !== this.options.order

    this.options = { ...this.options, ...next }

    if (next.locale || next.messages) {
      this.messages = resolveMessages(this.opt('locale'), this.options.messages)
      this.empty.textContent = this.messages.empty
      // Timeline labels are month names — rebuild the ticks.
      this.timeline?.setLayout(this.layout)
    }
    if (next.theme) this.root.dataset.theme = next.theme
    if (next.viewer !== undefined) this.viewer.setOptions(this.viewerOptions())

    if (needsData) {
      this.applyData(this.store.photos.map((p) => p.raw))
      return
    }
    if (needsLayout) this.relayout(true)

    this.renderer.refresh()
    this.syncToolbar()
    this.timeline?.setVisible(
      this.opt('timeline') && this.layout.totalHeight > this.scroller.clientHeight,
    )
  }

  /** Force a geometry recalculation, e.g. after the container was un-hidden. */
  refresh(): void {
    this.relayout(true)
  }

  on<E extends EventName>(event: E, handler: EventHandler<E>): () => void {
    return this.emitter.on(event, handler)
  }

  off<E extends EventName>(event: E, handler?: EventHandler<E>): void {
    this.emitter.off(event, handler)
  }

  destroy(): void {
    if (this.destroyed) return
    this.destroyed = true

    this.onScroll.cancel()
    this.onResize.cancel()
    this.resizeObserver?.disconnect()
    for (const dispose of this.disposers) dispose()
    this.disposers = []

    this.viewer.close()
    this.menu.close()
    this.timeline?.destroy()
    this.toolbar?.destroy()
    this.renderer.destroy()
    this.emitter.clear()
    this.root.remove()
  }

  /* -------------------------------------------------------------- helpers */

  private opt<K extends keyof typeof DEFAULTS>(
    key: K,
  ): (typeof DEFAULTS)[K] {
    const value = this.options[key as keyof SweetAlbumOptions]
    return (value === undefined ? DEFAULTS[key] : value) as (typeof DEFAULTS)[K]
  }

  private viewerOptions(): ViewerOptions {
    return this.options.viewer === false ? {} : (this.options.viewer ?? {})
  }

  private emit<E extends EventName>(event: E, ...args: SweetAlbumEvents[E]): void {
    this.emitter.emit(event, ...args)

    const map: Partial<Record<EventName, ((...a: any[]) => void) | undefined>> = {
      itemClick: this.options.onItemClick,
      selectionChange: this.options.onSelectionChange,
      viewerOpen: this.options.onViewerOpen,
      viewerClose: this.options.onViewerClose,
      error: this.options.onError,
    }
    map[event]?.(...(args as any[]))
  }

  private fail(err: unknown): void {
    const error = err instanceof Error ? err : new Error(String(err))
    this.emit('error', error)
    if (!this.options.onError) console.warn(error.message)
  }
}

export default SweetAlbum

export { layoutJustified } from './layout/justified'
export { groupByDay } from './group'
export { normalize, parseTime } from './normalize'
export { icons } from './icons'
export { en, locales, resolveMessages, zhCN } from './i18n'
export * from './types'
