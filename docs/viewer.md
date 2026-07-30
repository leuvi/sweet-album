# Viewer

[English](./viewer.md) | [简体中文](./viewer.zh-CN.md)

Clicking a photo opens the full-screen viewer. It starts at **contain fit**: the
image is scaled so it fills the window along whichever axis runs out first, at
its true aspect ratio — never distorted, whatever the window shape.

Disable it entirely with `viewer: false`, or open it yourself:

```js
album.open(photoId) // or a timeline index
album.closeViewer()
```

## Interaction

| Input                    | Action                                    |
| ------------------------ | ----------------------------------------- |
| Drag while zoomed in     | Pan (clamped at the image edges)          |
| Mouse drag while fitted  | Moves the image freely; it stays where you drop it |
| Touch drag while fitted  | Rubber-bands; past ~60px commits to prev/next, otherwise springs back |
| Wheel / trackpad         | Zoom, anchored at the cursor              |
| Two-finger pinch         | Zoom, anchored at the midpoint            |
| Horizontal swipe         | Next / previous (only while not zoomed in) |
| Double click / tap       | Toggle between fit and 100%               |
| `←` / `→`                | Previous / next                           |
| `+` / `-`                | Zoom in / out                             |
| `0` / `1`                | Fit to window / actual size               |
| `Esc`, backdrop click    | Close                                     |

Zoom stays anchored correctly even while the image is rotated.

**`closeOnBackdrop` defaults to `false`.** The stage is a drag surface, and a
drag that starts on the image but ends beside it delivers its click to the
stage — with backdrop-close on, the viewer would shut mid-gesture. Turn it on
only if your users do not drag; a click that follows a drag is ignored either
way. `Esc` and the close button always work.

Changing photos swaps the image immediately, with no transition.

## Options

```js
new SweetAlbum('#album', {
  viewer: {
    initialFit: 'contain', // or 'no-upscale' to never render above 100%
    maxScale: 8,
    zoomStep: 1.25, // per button press / wheel notch
    preload: 1, // neighbours preloaded on each side
    arrows: true,
    closeOnBackdrop: false, // opt in; see the note below
    actions: [...],
  },
})
```

## Toolbar

The bottom-centre toolbar is composed from an array. Strings pick a built-in
button, objects add your own — mix and reorder freely.

Built-in ids: `rotateLeft`, `rotateRight`, `zoomOut`, `zoomLevel`, `zoomIn`,
`actualSize`, `fit`, `divider`.

The default is:

```js
;['rotateLeft', 'rotateRight', 'divider', 'zoomOut', 'zoomLevel', 'zoomIn', 'divider', 'actualSize', 'fit']
```

### Custom actions

```js
viewer: {
  actions: [
    'rotateLeft',
    'rotateRight',
    'divider',
    'zoomOut',
    'zoomLevel',
    'zoomIn',
    'divider',
    {
      id: 'download',
      title: 'Download',
      icon: '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M12 3v12m0 0 4-4m-4 4-4-4M4 19h16"/></svg>',
      onClick: ({ state, controls }) => {
        const a = document.createElement('a')
        a.href = state.item.url
        a.download = state.item.id
        a.click()
      },
    },
    {
      id: 'rotate-and-close',
      title: 'Rotate then close',
      icon: myIconElement,          // an SVGElement works too
      onClick: ({ controls }) => {
        controls.rotate(90)
        controls.close()
      },
    },
  ]
}
```

`icon` accepts a raw SVG string, an `SVGElement` or an `HTMLElement`. Use
`currentColor` in SVG strings so buttons follow the theme.

### Action context

```ts
interface ViewerState {
  item: PhotoItem
  index: number
  total: number
  scale: number
  rotation: number
  x: number
  y: number
}

interface ViewerControls {
  zoomIn(step?: number): void
  zoomOut(step?: number): void
  zoomTo(scale: number): void
  rotate(deltaDeg: number): void
  fit(): void
  actualSize(): void
  reset(): void
  next(): void
  prev(): void
  close(): void
  getState(): ViewerState
}
```

Rotating re-fits the image, so a portrait photo turned sideways still fits the
window instead of overflowing it.
