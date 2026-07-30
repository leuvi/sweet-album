# Theming

[English](./theming.md) | [简体中文](./theming.zh-CN.md)

Every colour and radius is a CSS custom property. Theming means overriding
variables, not fighting selectors.

```js
new SweetAlbum('#album', { theme: 'light' }) // or 'dark' (default)
album.setTheme('dark') // at runtime
```

The theme is applied as `data-theme` on the album root. The viewer and the
context menu portal to `<body>` but carry the same attribute, so they stay in
sync.

## Variables

Override them on `.sweet-album` (and on `.sp-viewer` / `.sp-menu` if you want
the portalled surfaces to match):

```css
.sweet-album,
.sp-viewer,
.sp-menu {
  --sp-bg: #131313; /* album background */
  --sp-fg: #f2f2f2; /* primary text */
  --sp-fg-dim: #a8a8a8; /* secondary text, tick marks */
  --sp-surface: #1f1f1f; /* menus, toolbars */
  --sp-surface-hover: #2c2c2c;
  --sp-border: #333333;
  --sp-accent: #4c8dff; /* selection */
  --sp-accent-fg: #ffffff; /* text on accent */
  --sp-danger: #ff5b5b; /* danger menu items */
  --sp-heart: #ffffff; /* filled favorite heart */
  --sp-tile-bg: #1c1c1c; /* tile placeholder */
  --sp-scrim: rgba(0, 0, 0, 0.55); /* tile gradient behind controls */
  --sp-shadow: 0 8px 28px rgba(0, 0, 0, 0.45);
  --sp-radius: 6px; /* tiles, menu items */
  --sp-radius-lg: 12px; /* menu container */
  --sp-overlay: #0b0b0b; /* viewer backdrop (opaque on purpose) */
  --sp-btn-scrim: rgba(0, 0, 0, 0.45); /* behind viewer close/nav buttons */
  --sp-font: system-ui, sans-serif;
}
```

## Following the OS

```css
@media (prefers-color-scheme: light) {
  .sweet-album {
    --sp-bg: #ffffff;
    --sp-fg: #1a1a1a;
    /* … */
  }
}
```

Or just drive the option from a media query listener:

```js
const mq = matchMedia('(prefers-color-scheme: light)')
album.setTheme(mq.matches ? 'light' : 'dark')
mq.addEventListener('change', (e) => album.setTheme(e.matches ? 'light' : 'dark'))
```

## Class names

Stable hooks if you need to go further than variables:

| Class                | Element                                   |
| -------------------- | ----------------------------------------- |
| `.sweet-album`      | Album root (`data-theme`; `.is-selecting` while a selection exists) |
| `.sp-toolbar`        | Top bar                                   |
| `.sp-toolbar__btn`   | Batch action button (`.is-danger`)        |
| `.sp-scroller`       | Scroll container                          |
| `.sp-content`        | Positioned layout surface                 |
| `.sp-day`            | Day header (`.is-all`, `.is-some`)        |
| `.sp-tile`           | Photo tile (`.is-loaded`, `.is-selected`, `.is-error`) |
| `.sp-tile__check`    | Selection circle, top-left                |
| `.sp-tile__fav`      | Favorite heart, bottom-left (`.is-active`)|
| `.sp-tile__slot`     | Badge container (`--topRight`, `--bottomRight`, …) |
| `.sp-tile__badge`    | One badge; add your own via `TileBadge.className` |
| `.sp-timeline`       | Right-edge year scrubber                  |
| `.sp-timeline__line` | The scrubber's vertical line              |
| `.sp-timeline__tick` | A year label on the line                  |
| `.sp-menu`           | Context menu                              |
| `.sp-viewer`         | Full-screen viewer                        |
| `.sp-viewer__toolbar`| Viewer bottom toolbar                     |

## Layout density

The visual rhythm is options, not CSS:

```js
new SweetAlbum('#album', {
  gap: 8, // roomier
  targetRowHeight: 300, // larger photos
  headerHeight: 52,
  groupSpacing: 32,
})
```
