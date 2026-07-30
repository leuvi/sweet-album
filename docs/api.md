# API reference

[English](./api.md) | [简体中文](./api.zh-CN.md)

## `new SweetAlbum(container, options?)`

`container` is an `HTMLElement` or a CSS selector string. The album appends its
own root element to it and fills it, so **the container must have a height**.

```js
const album = new SweetAlbum('#album', { data: photos })
```

## Options

### Data

| Option    | Type                    | Default  | Description                                                       |
| --------- | ----------------------- | -------- | ----------------------------------------------------------------- |
| `data`    | `PhotoItem[] \| () => PhotoItem[] \| Promise<PhotoItem[]>` | — | The timeline. A function is called once on mount. |
| `order`   | `'desc' \| 'asc'`       | `'desc'` | Newest-first or oldest-first.                                     |

### Layout

| Option            | Type     | Default | Description                                                     |
| ----------------- | -------- | ------- | --------------------------------------------------------------- |
| `gap`             | `number` | `4`     | Space between tiles, px.                                        |
| `targetRowHeight` | `number` | auto    | Preferred row height. Actual rows land near it without distorting photos. |
| `headerHeight`    | `number` | `44`    | Height reserved for each day header, px.                        |
| `groupSpacing`    | `number` | `20`    | Vertical space between day groups, px.                          |
| `overscan`        | `number` | `2`     | Rows rendered above and below the viewport.                     |

When `targetRowHeight` is not set it scales with the container —
`clamp(width / 3, 120, 220)` — so a phone gets roughly three photos per row
instead of one and a half. Setting it explicitly pins it at every width.

### Features

| Option       | Type      | Default | Description                                        |
| ------------ | --------- | ------- | -------------------------------------------------- |
| `selectable` | `boolean` | `true`  | Show selection circles on tiles and day headers.   |
| `favorite`   | `boolean` | `true`  | Show the heart in the bottom-left of each tile.    |
| `header`     | `boolean` | `true`  | Show the top bar (photo count / selection count).  |
| `timeline`   | `boolean` | `true`  | Show the year/month scrubber on the right edge.    |

### Presentation

| Option     | Type                 | Default | Description                                  |
| ---------- | -------------------- | ------- | -------------------------------------------- |
| `locale`   | `'en' \| 'zh-CN'`    | `'en'`  | Built-in language pack.                      |
| `messages` | `Partial<Messages>`  | —       | Override individual strings. See [i18n](./i18n.md). |
| `theme`    | `'dark' \| 'light'`  | `'dark'`| Sets `data-theme` on the root element.       |

### Hooks

| Option             | Type                                                    | Description                                                  |
| ------------------ | ------------------------------------------------------- | ------------------------------------------------------------ |
| `thumbUrl`         | `(item, size: { width, height }) => string`             | Derive a size-specific thumbnail URL from the laid-out tile size. |
| `badges`           | `(item) => TileBadge[] \| null \| false`                | Corner badges on a tile. See below.                          |
| `contextMenu`      | `(ctx) => MenuItem[] \| false`                          | Build the right-click menu. See [context menu](./context-menu.md). |
| `selectionActions` | `ToolbarAction[] \| ((selected) => ToolbarAction[])`    | Batch actions in the top bar. See below.                     |
| `viewer`           | `ViewerOptions \| false`                                | Configure or disable the viewer. See [viewer](./viewer.md).  |

### Serve real thumbnails

The single biggest performance factor. **The grid must never load originals.**

A tile is 120–220px tall; a modern camera file is 25 megapixels and decodes to
roughly 100MB of bitmap. Point `thumbUrl` at a downscaled asset and the grid
loads tens of KB per photo; point it at the original and fast scrolling will
exhaust memory and take the tab down.

```js
new SweetAlbum('#album', {
  // Per-photo, from your data:
  data: photos.map((p) => ({ ...p, thumbUrl: p.small, url: p.original })),

  // …or derived from the laid-out tile size, for an image CDN:
  thumbUrl: (item, { width, height }) =>
    `${item.url}?w=${Math.ceil(width * devicePixelRatio)}&fit=cover`,
})
```

Keep `width`/`height` as the **original's** dimensions — the layout needs the
true aspect ratio and the viewer needs real pixels for 1:1 zoom. Only the bytes
differ. The viewer loads `url`, so full quality is preserved there.

The demo generates thumbnails at build time; see `scripts/gen-demo-manifest.mjs`
for a worked example (112MB of originals → 6MB of thumbnails).

### Tile corners and badges

Each tile has four corners. Two are taken by built-ins:

```
┌─────────────────────────┐
│ ◯ selection    badge(s) │   topLeft = built-in · topRight = yours
│                         │
│ ♥ favorite     badge(s) │   bottomLeft = built-in · bottomRight = yours
└─────────────────────────┘
```

The two right-hand corners are free for your own markers — live-photo icons,
durations, resolution, sync state:

```js
new SweetAlbum('#album', {
  badges: (item) => [
    item.live && {
      id: 'live',
      corner: 'topRight',
      content: '<svg viewBox="0 0 24 24" …/>', // SVG string, element, or text
      title: 'Live photo',
    },
    { id: 'size', corner: 'bottomRight', content: `${item.width}×${item.height}` },
  ].filter(Boolean),
})
```

```ts
type TileCorner = 'topLeft' | 'topRight' | 'bottomLeft' | 'bottomRight'

interface TileBadge {
  id: string
  corner: TileCorner
  content: string | SVGElement | HTMLElement
  title?: string
  /** Your own class, for styling. */
  className?: string
  /** Makes the badge a button; the tile click is then suppressed. */
  onClick?: (item: PhotoItem, ev: MouseEvent) => void
}
```

`badges` is called for visible tiles only and the result is diffed by
`corner:id`, so an unchanged set costs nothing on scroll. Keep it pure — no
side effects, no allocation-heavy work.

You *can* target the left corners too; the badge will render alongside the
built-in control, which is only sensible with `selectable` / `favorite` off.

### Batch actions

Bulk operations live in the top bar, not on day headers — a day header only ever
selects its photos. Pass a function to build labels from the current selection.

```js
new SweetAlbum('#album', {
  selectionActions: (selected) => [
    {
      id: 'download',
      label: `Download ${selected.length}`,
      icon: '<svg viewBox="0 0 24 24" …/>', // SVG string or element
      onClick: ({ selected, clearSelection }) => {
        download(selected)
        clearSelection()
      },
    },
    { id: 'delete', label: 'Delete', danger: true, onClick: ({ selected }) => remove(selected) },
  ],
})
```

```ts
interface ToolbarAction {
  id: string
  label: string
  icon?: string | SVGElement | HTMLElement
  disabled?: boolean
  danger?: boolean
  onClick: (ctx: { selected: PhotoItem[]; clearSelection: () => void }) => void
}
```

The bar appears only while something is selected. On narrow screens the labels
collapse to icons and the row scrolls horizontally.

### Callbacks

Every callback has a matching event on the bus (see `on` below).

| Option              | Signature                                                        |
| ------------------- | ---------------------------------------------------------------- |
| `onItemClick`       | `(item, index, ev: MouseEvent) => void`                          |
| `onSelectionChange` | `(ids, items) => void`                                           |
| `onFavoriteToggle`  | `(item, favorite) => void \| Promise<unknown>`                   |
| `onViewerOpen`      | `(item, index) => void`                                          |
| `onViewerClose`     | `() => void`                                                     |
| `onError`           | `(error: Error) => void`                                         |

`onItemClick` runs before the viewer opens — call `ev.preventDefault()` to
suppress it and handle the click yourself.

`onFavoriteToggle` may return a promise. The heart flips immediately and rolls
back if that promise rejects, with the failure reported through `onError`.

## Methods

### Data

```ts
album.setData(data: DataSource): Promise<void>   // replace the timeline
album.getPhotos(): PhotoItem[]                   // in display order
album.refresh(): void                            // force a relayout
```

Call `refresh()` after un-hiding a container that was `display: none` while the
album was created.

### Selection

```ts
album.getSelection(): PhotoItem[]
album.getSelectedIds(): (string | number)[]
album.setSelection(ids: (string | number)[]): void
album.selectAll(): void
album.clearSelection(): void
```

### Favorites

```ts
album.getFavorites(): (string | number)[]
album.setFavorite(id, favorite: boolean): void   // does not fire onFavoriteToggle
```

### Viewer

```ts
album.open(idOrIndex: string | number): void
album.closeViewer(): void
```

`open` treats the argument as a photo id first, then as a timeline index.

### Navigation

```ts
album.scrollToIndex(index: number, behavior?: ScrollBehavior): void
album.scrollToDate(year: number, month?: number, day?: number, behavior?: ScrollBehavior): void
```

`scrollToDate` jumps to the day group *nearest* the given date, in either sort
order. A date outside the timeline lands on the closest end rather than doing
nothing, so `scrollToDate(1990)` scrolls to your oldest photos.

### Configuration

```ts
album.setLocale(locale: 'en' | 'zh-CN'): void
album.setTheme(theme: 'dark' | 'light'): void
album.setOptions(next: Partial<SweetAlbumOptions>): void
```

`setOptions` relayouts automatically when a geometry option changes.

### Lifecycle

```ts
const off = album.on('selectionChange', handler)
off()                              // or album.off('selectionChange', handler)
album.destroy()                    // removes all DOM and listeners
```

## Events

| Event             | Arguments                            |
| ----------------- | ------------------------------------ |
| `ready`           | `{ count: number }`                  |
| `itemClick`       | `item, index, MouseEvent`            |
| `selectionChange` | `ids, items`                         |
| `favoriteToggle`  | `item, favorite`                     |
| `viewerOpen`      | `item, index`                        |
| `viewerClose`     | —                                    |
| `error`           | `Error`                              |

## Touch

The album is usable on phones without extra configuration:

| Gesture                     | Action                                          |
| --------------------------- | ----------------------------------------------- |
| Long press a photo (~500ms) | Open the context menu (moving >10px cancels it) |
| Tap the day header circle   | Select / clear the whole day                    |
| Swipe left / right in the viewer | Next / previous photo (when not zoomed in) |
| Pinch in the viewer         | Zoom, anchored at the midpoint                  |
| Double tap in the viewer    | Toggle fit ↔ 100%                               |

Row height scales down with the container and controls shrink to match. Because
there is no hover to reveal anything, visibility follows state instead: a
**filled** heart shows because the photo is favorited (hollow ones stay hidden
rather than cluttering every tile), and selection circles appear once a
selection exists. The viewer's prev/next arrows give way to swiping.

Since hollow hearts are hidden on touch, offer favoriting through your
`contextMenu` (reachable by long press) if your users need it there.

## Keyboard

Inside the viewer:

| Key            | Action              |
| -------------- | ------------------- |
| `Esc`          | Close               |
| `←` / `→`      | Previous / next     |
| `+` / `-`      | Zoom in / out       |
| `0`            | Fit to window       |
| `1`            | Actual size (100%)  |

## Exported helpers

The layout and data primitives are exported for testing or custom rendering:

```ts
import {
  layoutJustified,
  groupByDay,
  normalize,
  parseTime,
  icons,
  locales,
  resolveMessages,
} from 'sweet-album'
```
