import { icons } from './icons'
import type { Store } from './store'
import type {
  HeaderBlock,
  LayoutResult,
  Messages,
  PhotoGroup,
  PhotoItem,
  ResolvedPhoto,
  Tile,
} from './types'
import { el, setIcon } from './utils/dom'
import { computeVisibleRange, EMPTY_RANGE, sameRange, type VisibleRange } from './virtual'

export interface RendererContext {
  store: Store
  messages: () => Messages
  selectable: () => boolean
  favorite: () => boolean
  thumbUrl?: (
    item: import('./types').PhotoItem,
    size: { width: number; height: number },
  ) => string
  badges?: (
    item: import('./types').PhotoItem,
  ) => import('./types').TileBadge[] | null | false
  onTileClick: (photo: ResolvedPhoto, ev: MouseEvent) => void
  onToggleSelect: (photo: ResolvedPhoto) => void
  onToggleFavorite: (photo: ResolvedPhoto) => void
  onGroupToggle: (group: PhotoGroup) => void
  onContextMenu: (ev: MouseEvent, photo: ResolvedPhoto | null) => void
}

/**
 * Upper bound on recycled tile/header nodes kept for reuse.
 *
 * Two screens' worth is plenty to absorb scroll churn; beyond that a pooled
 * node is just a retained decoded image.
 */
const MAX_POOLED_TILES = 40
const MAX_POOLED_HEADERS = 12

/**
 * Sentinel badge signature that can never equal a real one, so a recycled node
 * always rebuilds its badges rather than inheriting the previous photo's.
 */
const BADGE_KEY_DIRTY = 'dirty'

interface TileNode {
  root: HTMLElement
  img: HTMLImageElement
  check: HTMLButtonElement
  fav: HTMLButtonElement
  /** Lazily created corner containers for consumer badges. */
  badgeHosts: Partial<Record<string, HTMLElement>>
  /** Signature of the badges currently rendered, to skip identical rebuilds. */
  badgeKey: string
  /** Photo currently bound to this node, if mounted. */
  photo: ResolvedPhoto | null
  /** Last src actually assigned, so recycling doesn't restart a load. */
  src: string
}

interface HeaderNode {
  root: HTMLElement
  check: HTMLButtonElement
  label: HTMLElement
  group: PhotoGroup | null
}

/**
 * Renders the visible slice of a layout into a recycled pool of DOM nodes.
 *
 * Only tiles inside the viewport (plus overscan) exist in the document at any
 * moment; scrolling swaps their contents rather than creating new elements, so
 * a 100k-photo timeline costs the same as a 100-photo one.
 */
export class GridRenderer {
  private range: VisibleRange = EMPTY_RANGE
  private layout: LayoutResult | null = null

  private mountedTiles = new Map<string, TileNode>()
  private freeTiles: TileNode[] = []
  private mountedHeaders = new Map<string, HeaderNode>()
  private freeHeaders: HeaderNode[] = []

  /** Long-press state — touch has no right-click, so we synthesise one. */
  private pressTimer = 0
  private pressOrigin: { x: number; y: number } | null = null
  /** Set after a long press so the trailing click doesn't open the viewer. */
  private swallowClick = false

  constructor(
    private readonly content: HTMLElement,
    private readonly ctx: RendererContext,
  ) {
    this.content.addEventListener('click', this.handleClick)
    this.content.addEventListener('contextmenu', this.handleContextMenu)
    this.content.addEventListener('pointerdown', this.handlePointerDown)
    this.content.addEventListener('pointermove', this.handlePointerMove)
    this.content.addEventListener('pointerup', this.cancelLongPress)
    this.content.addEventListener('pointercancel', this.cancelLongPress)
  }

  destroy(): void {
    this.cancelLongPress()
    this.content.removeEventListener('click', this.handleClick)
    this.content.removeEventListener('contextmenu', this.handleContextMenu)
    this.content.removeEventListener('pointerdown', this.handlePointerDown)
    this.content.removeEventListener('pointermove', this.handlePointerMove)
    this.content.removeEventListener('pointerup', this.cancelLongPress)
    this.content.removeEventListener('pointercancel', this.cancelLongPress)
    this.content.textContent = ''
    this.mountedTiles.clear()
    this.mountedHeaders.clear()
    this.freeTiles = []
    this.freeHeaders = []
    this.layout = null
    this.range = EMPTY_RANGE
  }

  setLayout(layout: LayoutResult): void {
    this.layout = layout
    this.content.style.height = `${layout.totalHeight}px`
    // Force a full re-place: every tile's geometry may have changed.
    this.range = EMPTY_RANGE
    this.recycleAll()
  }

  /** Render the window around `scrollTop`. Cheap to call on every scroll frame. */
  update(scrollTop: number, viewportHeight: number, overscanPx: number): void {
    const layout = this.layout
    if (!layout) return

    const next = computeVisibleRange(layout, scrollTop, viewportHeight, overscanPx)
    if (sameRange(next, this.range)) return
    this.range = next

    this.syncTiles(layout, next)
    this.syncHeaders(layout, next)
  }

  /** Re-read selection/favorite state for one photo, or all mounted ones. */
  refresh(key?: string): void {
    if (key) {
      const node = this.mountedTiles.get(key)
      if (node?.photo) this.paintState(node, node.photo)
      this.refreshHeadersFor(key)
      return
    }
    for (const node of this.mountedTiles.values()) {
      if (node.photo) this.paintState(node, node.photo)
    }
    for (const node of this.mountedHeaders.values()) {
      if (!node.group) continue
      // Re-read the label too: a locale change goes through here.
      node.label.textContent = this.ctx.messages().dateHeader(node.group)
      this.paintHeaderState(node, node.group)
    }
  }

  /* --------------------------------------------------------------- tiles */

  private syncTiles(layout: LayoutResult, range: VisibleRange): void {
    const needed = new Map<string, Tile>()
    for (let i = range.tileFrom; i < range.tileTo; i++) {
      const tile = layout.tiles[i]
      if (tile) needed.set(tile.key, tile)
    }

    for (const [key, node] of this.mountedTiles) {
      if (!needed.has(key)) {
        this.releaseTile(key, node)
      }
    }

    for (const [key, tile] of needed) {
      const existing = this.mountedTiles.get(key)
      if (existing) {
        this.placeTile(existing, tile)
        continue
      }
      const node = this.freeTiles.pop() ?? this.createTile()
      this.bindTile(node, tile)
      this.mountedTiles.set(key, node)
      this.content.appendChild(node.root)
    }
  }

  private createTile(): TileNode {
    const root = el('figure', 'sp-tile')
    const img = el('img', 'sp-tile__img', root)
    img.decoding = 'async'
    img.loading = 'lazy'
    img.draggable = false
    img.addEventListener('load', () => root.classList.add('is-loaded'))
    img.addEventListener('error', () => root.classList.add('is-error'))

    el('span', 'sp-tile__scrim', root)

    const check = el('button', 'sp-tile__check', root)
    check.type = 'button'
    check.dataset.role = 'select'
    check.innerHTML = icons.check

    const fav = el('button', 'sp-tile__fav', root)
    fav.type = 'button'
    fav.dataset.role = 'favorite'

    return { root, img, check, fav, badgeHosts: {}, badgeKey: '', photo: null, src: '' }
  }

  /** Render consumer badges into their corners, reusing hosts across recycles. */
  private paintBadges(node: TileNode, photo: ResolvedPhoto): void {
    const badges = this.ctx.badges?.(photo.raw) || []
    const key = badges.map((b) => `${b.corner}:${b.id}`).join('|')

    // Corner containers persist; only rebuild when the set actually differs.
    if (key === node.badgeKey) return
    node.badgeKey = key

    for (const host of Object.values(node.badgeHosts)) {
      if (host) host.textContent = ''
    }

    for (const badge of badges) {
      let host = node.badgeHosts[badge.corner]
      if (!host) {
        host = el('span', `sp-tile__slot sp-tile__slot--${badge.corner}`, node.root)
        node.badgeHosts[badge.corner] = host
      }

      const tag = badge.onClick ? 'button' : 'span'
      const item = document.createElement(tag)
      item.className = `sp-tile__badge${badge.className ? ` ${badge.className}` : ''}`
      if (badge.title) item.title = badge.title
      if (tag === 'button') {
        ;(item as HTMLButtonElement).type = 'button'
        item.dataset.role = 'badge'
        item.dataset.badge = badge.id
      }
      setIcon(item, badge.content)
      host.appendChild(item)
    }
  }

  private badgeHandlerFor(
    photo: ResolvedPhoto,
    id: string,
  ): ((item: PhotoItem, ev: MouseEvent) => void) | undefined {
    const badges = this.ctx.badges?.(photo.raw) || []
    return badges.find((b) => b.id === id)?.onClick
  }

  private bindTile(node: TileNode, tile: Tile): void {
    const photo = tile.photo
    node.photo = photo
    node.root.dataset.key = photo.key
    node.root.classList.remove('is-error')

    const src = this.ctx.thumbUrl
      ? this.ctx.thumbUrl(photo.raw, { width: tile.width, height: tile.height })
      : photo.thumbUrl

    if (node.src !== src) {
      node.root.classList.remove('is-loaded')
      node.src = src
      node.img.src = src
      node.img.alt = photo.alt
    } else if (node.img.complete) {
      node.root.classList.add('is-loaded')
    }

    this.placeTile(node, tile)
    this.paintState(node, photo)
    this.paintBadges(node, photo)
  }

  private placeTile(node: TileNode, tile: Tile): void {
    const style = node.root.style
    style.transform = `translate3d(${tile.x}px, ${tile.y}px, 0)`
    style.width = `${tile.width}px`
    style.height = `${tile.height}px`
  }

  private paintState(node: TileNode, photo: ResolvedPhoto): void {
    const { store } = this.ctx
    const msg = this.ctx.messages()

    const selectable = this.ctx.selectable()
    node.check.hidden = !selectable
    if (selectable) {
      const selected = store.isSelected(photo.key)
      node.root.classList.toggle('is-selected', selected)
      node.check.setAttribute('aria-pressed', String(selected))
      node.check.title = selected ? msg.deselectAll : msg.selectAll
    } else {
      node.root.classList.remove('is-selected')
    }

    const favEnabled = this.ctx.favorite()
    node.fav.hidden = !favEnabled
    if (favEnabled) {
      const fav = store.isFavorite(photo.key)
      node.fav.classList.toggle('is-active', fav)
      node.fav.innerHTML = fav ? icons.heartFilled : icons.heart
      node.fav.setAttribute('aria-pressed', String(fav))
      node.fav.title = fav ? msg.unfavorite : msg.favorite
    }
  }

  private releaseTile(key: string, node: TileNode): void {
    this.mountedTiles.delete(key)
    node.photo = null
    // Force a badge rebuild on the next bind — the pooled node may land on a
    // photo whose badge set happens to have the same signature position.
    node.badgeKey = BADGE_KEY_DIRTY
    node.root.remove()
    // A pooled node keeps its <img>, and with it a decoded bitmap that can run
    // to tens of MB for a large photo. Cap the pool and drop the image on
    // anything evicted so the browser can reclaim it — an unbounded pool is how
    // fast scrolling turns into an out-of-memory tab crash.
    if (this.freeTiles.length >= MAX_POOLED_TILES) {
      const evicted = this.freeTiles.shift()
      if (evicted) {
        evicted.img.removeAttribute('src')
        evicted.src = ''
      }
    }
    this.freeTiles.push(node)
  }

  /* -------------------------------------------------------------- headers */

  private syncHeaders(layout: LayoutResult, range: VisibleRange): void {
    const needed = new Map<string, HeaderBlock>()
    for (let i = range.headerFrom; i < range.headerTo; i++) {
      const header = layout.headers[i]
      if (header) needed.set(header.key, header)
    }

    for (const [key, node] of this.mountedHeaders) {
      if (!needed.has(key)) {
        this.mountedHeaders.delete(key)
        node.group = null
        node.root.remove()
        this.pushHeader(node)
      }
    }

    for (const [key, header] of needed) {
      let node = this.mountedHeaders.get(key)
      if (!node) {
        node = this.freeHeaders.pop() ?? this.createHeader()
        this.mountedHeaders.set(key, node)
        this.content.appendChild(node.root)
      }
      this.bindHeader(node, header)
    }
  }

  private createHeader(): HeaderNode {
    const root = el('div', 'sp-day')
    const check = el('button', 'sp-day__check', root)
    check.type = 'button'
    check.dataset.role = 'group-select'
    check.innerHTML = icons.check
    const label = el('span', 'sp-day__label', root)
    return { root, check, label, group: null }
  }

  private bindHeader(node: HeaderNode, header: HeaderBlock): void {
    node.group = header.group
    node.root.dataset.key = header.key
    node.root.style.transform = `translate3d(0, ${header.y}px, 0)`
    node.root.style.height = `${header.height}px`
    node.label.textContent = this.ctx.messages().dateHeader(header.group)
    this.paintHeaderState(node, header.group)
  }

  private paintHeaderState(node: HeaderNode, group: PhotoGroup): void {
    const selectable = this.ctx.selectable()
    node.check.hidden = !selectable
    if (!selectable) return

    const state = this.ctx.store.groupSelectionState(group)
    node.root.classList.toggle('is-all', state === 'all')
    node.root.classList.toggle('is-some', state === 'some')
    node.check.setAttribute('aria-pressed', String(state === 'all'))
    node.check.title =
      state === 'all' ? this.ctx.messages().deselectAll : this.ctx.messages().selectAll
  }

  private refreshHeadersFor(photoKey: string): void {
    const photo = this.ctx.store.photoByKey(photoKey)
    if (!photo) return
    for (const node of this.mountedHeaders.values()) {
      if (node.group && node.group.photos.some((p) => p.key === photoKey)) {
        this.paintHeaderState(node, node.group)
      }
    }
  }

  /** Return a header node to the pool, keeping the pool bounded. */
  private pushHeader(node: HeaderNode): void {
    if (this.freeHeaders.length >= MAX_POOLED_HEADERS) this.freeHeaders.shift()
    this.freeHeaders.push(node)
  }

  private recycleAll(): void {
    for (const [key, node] of this.mountedTiles) this.releaseTile(key, node)
    for (const [key, node] of this.mountedHeaders) {
      this.mountedHeaders.delete(key)
      node.group = null
      node.root.remove()
      this.pushHeader(node)
    }
  }

  /* --------------------------------------------------------------- events */

  private tileFromEvent(ev: Event): ResolvedPhoto | null {
    const host = (ev.target as HTMLElement | null)?.closest<HTMLElement>('.sp-tile')
    const key = host?.dataset.key
    return key ? (this.ctx.store.photoByKey(key) ?? null) : null
  }

  private groupFromEvent(ev: Event): PhotoGroup | null {
    const host = (ev.target as HTMLElement | null)?.closest<HTMLElement>('.sp-day')
    const key = host?.dataset.key
    if (!key) return null
    return this.mountedHeaders.get(key)?.group ?? null
  }

  /** ~500ms hold with < 10px drift counts as a long press. */
  private handlePointerDown = (ev: PointerEvent): void => {
    this.cancelLongPress()
    if (ev.pointerType === 'mouse') return
    if ((ev.target as HTMLElement | null)?.closest('[data-role]')) return

    const photo = this.tileFromEvent(ev)
    if (!photo) return

    this.pressOrigin = { x: ev.clientX, y: ev.clientY }
    const { clientX, clientY } = ev
    this.pressTimer = window.setTimeout(() => {
      this.pressTimer = 0
      this.pressOrigin = null
      this.swallowClick = true
      // Synthesise the event the menu handler expects.
      this.ctx.onContextMenu(
        new MouseEvent('contextmenu', { clientX, clientY, bubbles: false }),
        photo,
      )
    }, 500)
  }

  private handlePointerMove = (ev: PointerEvent): void => {
    if (!this.pressOrigin) return
    const dx = ev.clientX - this.pressOrigin.x
    const dy = ev.clientY - this.pressOrigin.y
    if (Math.hypot(dx, dy) > 10) this.cancelLongPress()
  }

  private cancelLongPress = (): void => {
    if (this.pressTimer) clearTimeout(this.pressTimer)
    this.pressTimer = 0
    this.pressOrigin = null
  }

  private handleClick = (ev: MouseEvent): void => {
    if (this.swallowClick) {
      this.swallowClick = false
      ev.preventDefault()
      ev.stopPropagation()
      return
    }

    const role = (ev.target as HTMLElement | null)?.closest<HTMLElement>('[data-role]')
      ?.dataset.role

    if (role === 'group-select') {
      const group = this.groupFromEvent(ev)
      if (group) {
        ev.preventDefault()
        this.ctx.onGroupToggle(group)
      }
      return
    }

    const photo = this.tileFromEvent(ev)
    if (!photo) return

    if (role === 'select') {
      ev.preventDefault()
      ev.stopPropagation()
      this.ctx.onToggleSelect(photo)
      return
    }
    if (role === 'favorite') {
      ev.preventDefault()
      ev.stopPropagation()
      this.ctx.onToggleFavorite(photo)
      return
    }
    if (role === 'badge') {
      const id = (ev.target as HTMLElement | null)?.closest<HTMLElement>('[data-badge]')
        ?.dataset.badge
      if (id) {
        ev.preventDefault()
        ev.stopPropagation()
        this.badgeHandlerFor(photo, id)?.(photo.raw, ev)
      }
      return
    }

    this.ctx.onTileClick(photo, ev)
  }

  private handleContextMenu = (ev: MouseEvent): void => {
    // Day headers select in bulk; batch *operations* live in the top bar, so
    // they deliberately have no menu of their own.
    if ((ev.target as HTMLElement | null)?.closest('.sp-day')) return
    this.ctx.onContextMenu(ev, this.tileFromEvent(ev))
  }
}
