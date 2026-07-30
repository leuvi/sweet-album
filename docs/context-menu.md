# Context menu

[English](./context-menu.md) | [简体中文](./context-menu.zh-CN.md)

sweet-album ships **no** menu entries. The library owns placement, edge
flipping, keyboard handling and dismissal; every item is yours.

The menu is **single level** — there are no submenus. Bulk operations belong in
the top bar instead, via [`selectionActions`](./api.md#batch-actions).

Return `false` (or an empty array) to suppress the menu for a given target — the
browser's native menu is then left alone.

```js
new SweetAlbum('#album', {
  data: photos,
  contextMenu: ({ item, selected, close }) => {
    if (!item) return false

    // Act on the whole selection when the target is part of it.
    const inSelection = selected.some((p) => p.id === item.id)
    const targets = inSelection && selected.length > 1 ? selected : [item]

    return [
      { id: 'open', label: 'Open', onClick: () => location.assign(item.url) },
      { id: 'copy', label: 'Copy link', onClick: () => copy(targets) },
      { id: 'sep', label: '', divider: true },
      {
        id: 'delete',
        label: `Delete ${targets.length} photo(s)`,
        danger: true,
        onClick: () => remove(targets),
      },
    ]
  },
})
```

## Where it opens

- **Right-click** on a photo.
- **Long press** (~500ms) on a photo on touch devices. Moving more than 10px
  cancels it, so scrolling never triggers the menu, and the tap that follows the
  press is swallowed so the viewer does not open behind it.
- **Day headers do not open a menu.** They select the whole day; the resulting
  batch actions appear in the top bar.

## Context

```ts
interface ContextMenuContext {
  /** The photo under the cursor, or null when the menu opened elsewhere. */
  item: PhotoItem | null
  /** Current selection, in timeline order. */
  selected: PhotoItem[]
  /** Close the menu programmatically. */
  close: () => void
}
```

## Menu items

```ts
interface MenuItem {
  id: string
  label: string
  /** Raw SVG string, or an existing SVGElement / HTMLElement. */
  icon?: string | SVGElement | HTMLElement
  disabled?: boolean
  /** Renders in the danger colour. */
  danger?: boolean
  /** Renders a separator; every other field is ignored. */
  divider?: boolean
  onClick?: (ctx: ContextMenuContext) => void
}
```

Icons are plain SVG strings — use `currentColor` so they follow the theme:

```js
{
  id: 'star',
  label: 'Star',
  icon: '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2"><path d="m12 3 2.8 5.7 6.2.9-4.5 4.4 1 6.2L12 17.3 6.5 20.2l1-6.2L3 9.6l6.2-.9z"/></svg>',
  onClick: ({ selected }) => star(selected),
}
```

The built-in icon set is exported if you want to match its look:

```js
import { icons } from 'sweet-album'
// icons.heart, icons.check, icons.close, icons.zoomIn, …
```

## Behaviour

- Opens at the cursor and flips horizontally or vertically when it would
  overflow the viewport.
- Closes on `Esc`, on an outside pointer-down, on window resize and on scroll.
- `onClick` fires **after** the menu closes, so you can open your own dialogs
  without fighting the dismissal handlers.
- Rows get larger touch targets automatically on devices without hover.
