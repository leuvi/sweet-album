# sweet-album

[![npm version](https://img.shields.io/npm/v/sweet-album.svg)](https://www.npmjs.com/package/sweet-album)
[![minzipped size](https://img.shields.io/bundlephobia/minzip/sweet-album)](https://bundlephobia.com/package/sweet-album)
[![types](https://img.shields.io/npm/types/sweet-album.svg)](https://www.npmjs.com/package/sweet-album)
[![dependencies](https://img.shields.io/badge/dependencies-0-brightgreen)](https://www.npmjs.com/package/sweet-album?activeTab=dependencies)
[![license](https://img.shields.io/npm/l/sweet-album.svg)](./LICENSE)

A framework-agnostic web photo album for the browser — a single, continuous,
day-grouped timeline with a justified layout, virtual scrolling and a
full-screen viewer.

Works with **vanilla JS**, **React** and **Vue 3** from one package. No data
fetching, no backend assumptions: you hand it photos, it renders them.

**[▶ Live demo](https://album.sweetui.com)** · 214 photos across 10 years —
[vanilla](https://album.sweetui.com/) ·
[React](https://album.sweetui.com/react.html) ·
[Vue](https://album.sweetui.com/vue.html)

English | [简体中文](./README.zh-CN.md)

---

## Features

- **Justified layout** — rows are filled edge to edge and every tile keeps its
  source aspect ratio. Photos are never stretched or squashed.
- **Virtual scrolling** — only the visible slice exists in the DOM, with node
  recycling. A 100,000-photo timeline costs the same as a 100-photo one.
- **Responsive** — a `ResizeObserver` relayouts on container resize and keeps
  the photo you were looking at anchored in place.
- **Day grouping** — headers per calendar day, plus a year/month scrubber on the
  right edge for crossing a decade in one drag.
- **Selection** — per-photo checkbox plus a tri-state circle on every day header
  to select or clear a whole day. Bulk actions you define appear in the top bar.
- **Favorites** — a heart in the bottom-left of each tile, optimistic with
  rollback if your handler rejects.
- **Context menu** — fully user-defined, single level. The library owns
  positioning, flipping and dismissal; every entry comes from you. Long press
  opens it on touch.
- **Mobile ready** — row height scales to the container, hit targets grow
  without hover, swipe changes photos in the viewer, pinch zooms.
- **Viewer** — opens at contain-fit (fills the window along one axis at true
  aspect ratio), drag to pan, wheel to zoom anchored at the cursor, pinch on
  touch, prev/next, and a bottom toolbar you can extend with your own SVG icons.
- **i18n & theming** — English (default) and Simplified Chinese built in, any
  message overridable; dark and light themes driven entirely by CSS variables.
- **Typed** — written in TypeScript, ships its own declarations.

## Install

```bash
npm install sweet-album
```

```bash
pnpm add sweet-album
```

```bash
yarn add sweet-album
```

React and Vue are **optional peer dependencies** — install neither and the
vanilla build still works. Nothing else is pulled in; the package has zero
runtime dependencies.

| Entry         | Import                  | Gzipped |
| ------------- | ----------------------- | ------- |
| Core          | `sweet-album`           | 17.4 kB |
| Stylesheet    | `sweet-album/style.css` | 5.2 kB  |
| React adapter | `sweet-album/react`     | 1.0 kB  |
| Vue adapter   | `sweet-album/vue`       | 1.3 kB  |

Those are the published files as-is. The bundle is shipped unminified so your
bundler can tree-shake and minify it with everything else — which is why the
badge above, measured after minification, reads smaller.

Ships ESM and CJS side by side with TypeScript declarations for every entry.
The stylesheet is not injected for you — import it once, anywhere:

```js
import 'sweet-album/style.css'
```

### Without a build step

```html
<link rel="stylesheet" href="https://esm.sh/sweet-album/style.css" />
<script type="module">
  import { SweetAlbum } from 'https://esm.sh/sweet-album'
  new SweetAlbum('#album', { data: photos })
</script>
```

## Quick start

### Vanilla JS

```js
import { SweetAlbum } from 'sweet-album'
import 'sweet-album/style.css'

const album = new SweetAlbum('#album', {
  // An array, or any (async) function returning one.
  data: async () => (await fetch('/api/photos')).json(),
  locale: 'en',
  theme: 'dark',
})

album.on('selectionChange', (ids) => console.log(ids))
```

The container needs a height — the album fills it:

```css
#album {
  height: 100vh;
}
```

### React

```tsx
import { useRef } from 'react'
import { SweetAlbum, type SweetAlbumHandle } from 'sweet-album/react'
import 'sweet-album/style.css'

export function Gallery({ photos }) {
  const album = useRef<SweetAlbumHandle>(null)

  return (
    <SweetAlbum
      ref={album}
      style={{ height: '100vh' }}
      data={photos}
      onSelectionChange={(ids, items) => console.log(ids, items)}
      onFavoriteToggle={(item, favorite) => api.setFavorite(item.id, favorite)}
    />
  )
}
```

Callback props are read through a ref, so passing inline arrow functions never
recreates the album.

### Vue 3

```vue
<script setup>
import { ref } from 'vue'
import { SweetAlbum } from 'sweet-album/vue'
import 'sweet-album/style.css'

const photos = ref([])
const selection = ref([])
</script>

<template>
  <SweetAlbum
    style="height: 100vh"
    :data="photos"
    v-model:selection="selection"
    @favorite-toggle="(item, fav) => api.setFavorite(item.id, fav)"
  />
</template>
```

Or register it globally:

```js
import { SweetAlbumPlugin } from 'sweet-album/vue'
app.use(SweetAlbumPlugin)
```

## The photo shape

```ts
interface PhotoItem {
  id: string | number
  width: number // intrinsic pixel width  — required
  height: number // intrinsic pixel height — required
  takenAt: number | string | Date
  thumbUrl: string
  url?: string // full-size image for the viewer; defaults to thumbUrl
  favorite?: boolean
  alt?: string
  [key: string]: unknown // your own fields ride along untouched
}
```

**`width` and `height` are mandatory.** The justified layout has to know every
aspect ratio *before* laying out a row. Without them the album would either wait
for each image to load (blank first paint, then the layout jumping around) or
distort photos to fit — both of which this library exists to avoid.

Send the whole index in one response: a few tens of thousands of these rows is
only a couple of MB of JSON, and it buys an exact scrollbar and instant seeking.
The images themselves still load lazily as you scroll.

Photos missing usable dimensions, a parseable date or any URL are skipped and
reported through `onError` rather than silently mis-laid-out.

## Documentation

- [Options and API reference](./docs/api.md)
- [Context menu](./docs/context-menu.md)
- [Viewer and custom actions](./docs/viewer.md)
- [Theming](./docs/theming.md)
- [Internationalization](./docs/i18n.md)

## Browser support

Modern evergreen browsers. Uses `ResizeObserver`, Pointer Events, native
`loading="lazy"` images and CSS custom properties.

## License

[MIT](./LICENSE)
