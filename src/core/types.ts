/**
 * Public type surface of sweet-album.
 *
 * Everything a consumer touches is declared here: the photo shape they feed in,
 * the options they configure, the callbacks they receive and the extension
 * points (context menu items, viewer actions) they plug into.
 */

/* ------------------------------------------------------------------ data -- */

/**
 * One photo as supplied by the host application.
 *
 * `width` / `height` are the *intrinsic* pixel dimensions of the original
 * image. They are mandatory because the justified layout has to know every
 * aspect ratio before it can lay out a single row — this is what guarantees
 * photos are never stretched.
 *
 * Any extra keys are preserved untouched and handed back in every callback,
 * so business fields (albumId, ownerId, exif…) can ride along.
 */
export interface PhotoItem {
  id: string | number
  width: number
  height: number
  /** Epoch milliseconds, an ISO-8601 string, or a Date. */
  takenAt: number | string | Date
  /** Small image used inside the grid. */
  thumbUrl: string
  /** Full-size image used by the viewer. Falls back to `thumbUrl`. */
  url?: string
  /** Initial favorite state. */
  favorite?: boolean
  /** Optional alt text; falls back to the id. */
  alt?: string
  [key: string]: unknown
}

/** Array, or any (a)sync function returning one. No fetching is done for you. */
export type DataSource = PhotoItem[] | (() => PhotoItem[] | Promise<PhotoItem[]>)

/** Internal, fully-resolved photo. Exposed on layout results and events. */
export interface ResolvedPhoto {
  raw: PhotoItem
  id: string | number
  /** Stable string form of `id`, used for DOM keys and Set membership. */
  key: string
  width: number
  height: number
  /** width / height, guaranteed finite and > 0. */
  ratio: number
  /** Epoch milliseconds. */
  time: number
  year: number
  /** 1-12. */
  month: number
  /** 1-31. */
  day: number
  thumbUrl: string
  url: string
  alt: string
  /** Index in the fully sorted photo list. */
  index: number
}

/* -------------------------------------------------------------- grouping -- */

/**
 * One calendar day's worth of photos. The timeline is a single continuous
 * stream of these — there is no year/month drill-down.
 */
export interface PhotoGroup {
  /** `YYYY-MM-DD` */
  key: string
  year: number
  /** 1-12 */
  month: number
  /** 1-31 */
  day: number
  photos: ResolvedPhoto[]
}

/* ---------------------------------------------------------------- layout -- */

export interface Tile {
  key: string
  x: number
  y: number
  width: number
  height: number
  photo: ResolvedPhoto
}

export interface HeaderBlock {
  key: string
  y: number
  height: number
  group: PhotoGroup
  /** Half-open index range of this group's tiles inside `LayoutResult.tiles`. */
  from: number
  to: number
}

export interface LayoutRow {
  y: number
  height: number
  /** Half-open tile index range `[from, to)`. */
  from: number
  to: number
}

export interface LayoutResult {
  totalHeight: number
  tiles: Tile[]
  rows: LayoutRow[]
  headers: HeaderBlock[]
  /** Container width the layout was computed for. */
  width: number
}

/* -------------------------------------------------------- extension points */

/** One flat context-menu entry. The menu is deliberately single-level. */
export interface MenuItem {
  id: string
  label: string
  /** Raw SVG string or a ready-made element. */
  icon?: string | SVGElement | HTMLElement
  disabled?: boolean
  danger?: boolean
  /** Render a separator instead of an entry; all other fields are ignored. */
  divider?: boolean
  onClick?: (ctx: ContextMenuContext) => void
}

export interface ContextMenuContext {
  /** The photo under the cursor, if any. */
  item: PhotoItem | null
  /** Current selection, in timeline order. */
  selected: PhotoItem[]
  /** Close the menu programmatically. */
  close: () => void
}

/**
 * Where a badge sits on a tile.
 *
 * `topLeft` is the built-in selection circle and `bottomLeft` the favorite
 * heart, so custom badges normally use the two right-hand corners — live-photo
 * markers, durations, cloud/sync state and the like.
 */
export type TileCorner = 'topLeft' | 'topRight' | 'bottomLeft' | 'bottomRight'

export interface TileBadge {
  id: string
  corner: TileCorner
  /** Raw SVG string, an element, or plain text. */
  content: string | SVGElement | HTMLElement
  /** Tooltip / aria-label. */
  title?: string
  /** Extra class on the badge element, for your own styling. */
  className?: string
  /** When set the badge becomes a button and the tile click is suppressed. */
  onClick?: (item: PhotoItem, ev: MouseEvent) => void
}

/**
 * A batch action shown in the top bar while photos are selected.
 *
 * This is where bulk operations live — day headers only ever select, they never
 * open a menu of their own.
 */
export interface ToolbarAction {
  id: string
  label: string
  /** Raw SVG string or a ready-made element. */
  icon?: string | SVGElement | HTMLElement
  disabled?: boolean
  danger?: boolean
  onClick: (ctx: {
    selected: PhotoItem[]
    clearSelection: () => void
  }) => void
}

/** Handle passed to viewer actions so custom buttons can drive the viewer. */
export interface ViewerControls {
  zoomIn: (step?: number) => void
  zoomOut: (step?: number) => void
  zoomTo: (scale: number) => void
  rotate: (deltaDeg: number) => void
  reset: () => void
  fit: () => void
  actualSize: () => void
  next: () => void
  prev: () => void
  close: () => void
  getState: () => ViewerState
}

export interface ViewerState {
  item: PhotoItem
  index: number
  total: number
  scale: number
  rotation: number
  x: number
  y: number
}

export interface ViewerAction {
  id: string
  /** Raw SVG string or a ready-made element. Required for custom actions. */
  icon?: string | SVGElement | HTMLElement
  /** Tooltip / aria-label. */
  title?: string
  disabled?: boolean
  onClick?: (ctx: { state: ViewerState; controls: ViewerControls }) => void
}

/** Ids of the actions shipped with the viewer toolbar. */
export type BuiltinViewerActionId =
  | 'rotateLeft'
  | 'rotateRight'
  | 'zoomOut'
  | 'zoomLevel'
  | 'zoomIn'
  | 'actualSize'
  | 'fit'
  | 'divider'

/* --------------------------------------------------------------- options -- */

export type Locale = 'en' | 'zh-CN'
export type Theme = 'dark' | 'light'

export interface Messages {
  photos: string
  photo: string
  selected: string
  selectAll: string
  deselectAll: string
  clearSelection: string
  favorite: string
  unfavorite: string
  empty: string
  loading: string
  loadFailed: string
  close: string
  prev: string
  next: string
  zoomIn: string
  zoomOut: string
  rotateLeft: string
  rotateRight: string
  actualSize: string
  fitToWindow: string
  /** `YYYY-MM-DD` -> group header label. */
  dateHeader: (d: { year: number; month: number; day: number }) => string
  months: string[]
  monthsShort: string[]
}

export interface ViewerOptions {
  /**
   * `contain` scales the image to fill the viewport in one axis (up- or
   * downscaling as needed). `no-upscale` never renders above 100%.
   */
  initialFit?: 'contain' | 'no-upscale'
  maxScale?: number
  /** Multiplicative step for the +/- buttons and one wheel notch. */
  zoomStep?: number
  /** How many neighbours to preload on each side. */
  preload?: number
  /** Show the built-in prev/next arrows. */
  arrows?: boolean
  /**
   * Toolbar layout. Strings pick a built-in button, objects add a custom one.
   * Defaults to the full built-in set.
   */
  actions?: (BuiltinViewerActionId | ViewerAction)[]
  /** Close when the backdrop (not the image) is clicked. */
  closeOnBackdrop?: boolean
}

export interface SweetAlbumOptions {
  data?: DataSource
  /** Sort order of the timeline. */
  order?: 'desc' | 'asc'

  /** Gap between tiles, px. */
  gap?: number
  /** Preferred row height, px. Rows land near this without distorting photos. */
  targetRowHeight?: number
  /** Height of a day header, px. */
  headerHeight?: number
  /** Vertical space between day groups, px. */
  groupSpacing?: number
  /** Rows of tiles rendered above and below the viewport. */
  overscan?: number

  selectable?: boolean
  /** Show the heart in the bottom-left of every tile. */
  favorite?: boolean
  /** Show the top bar (photo count + selection actions). */
  header?: boolean
  /** Show the year/month scrubber pinned to the right edge. */
  timeline?: boolean

  locale?: Locale
  messages?: Partial<Messages>
  theme?: Theme

  /** Derive a size-specific thumbnail URL. */
  thumbUrl?: (item: PhotoItem, size: { width: number; height: number }) => string
  /**
   * Corner badges for a tile — live-photo icons, durations, sync state…
   * Called for visible tiles only, so keep it cheap and side-effect free.
   */
  badges?: (item: PhotoItem) => TileBadge[] | null | false
  /** Return `false` to suppress the menu for this target. Single level only. */
  contextMenu?: (ctx: ContextMenuContext) => MenuItem[] | false
  /**
   * Batch actions rendered in the top bar while a selection exists. Pass a
   * function to build them from the current selection (for counts in labels).
   */
  selectionActions?: ToolbarAction[] | ((selected: PhotoItem[]) => ToolbarAction[])

  viewer?: ViewerOptions | false

  /* callbacks — the event bus mirrors all of these */
  onItemClick?: (item: PhotoItem, index: number, ev: MouseEvent) => void
  onSelectionChange?: (ids: (string | number)[], items: PhotoItem[]) => void
  onFavoriteToggle?: (item: PhotoItem, favorite: boolean) => void | Promise<unknown>
  onViewerOpen?: (item: PhotoItem, index: number) => void
  onViewerClose?: () => void
  onError?: (error: Error) => void
}

/* ---------------------------------------------------------------- events -- */

export interface SweetAlbumEvents {
  ready: [{ count: number }]
  itemClick: [PhotoItem, number, MouseEvent]
  selectionChange: [(string | number)[], PhotoItem[]]
  favoriteToggle: [PhotoItem, boolean]
  viewerOpen: [PhotoItem, number]
  viewerClose: []
  error: [Error]
}

export type EventName = keyof SweetAlbumEvents
export type EventHandler<E extends EventName> = (
  ...args: SweetAlbumEvents[E]
) => void
