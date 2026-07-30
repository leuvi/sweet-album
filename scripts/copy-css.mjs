/**
 * Copy the stylesheet into `dist/` as a standalone asset.
 *
 * The CSS is deliberately *not* imported from any TS entry: consumers opt in
 * with `import 'sweet-album/style.css'`, which keeps the JS bundles free of
 * side effects and lets them ship their own theme instead.
 */
import { copyFileSync, mkdirSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const from = resolve(here, '../src/styles/sweet-album.css')
const to = resolve(here, '../dist/sweet-album.css')

mkdirSync(dirname(to), { recursive: true })
copyFileSync(from, to)

// Without this, a strict consumer that has no ambient `*.css` module
// declaration (no `vite/client` types, say) fails the side-effect import
// `import 'sweet-album/style.css'` with TS2882.
writeFileSync(
  resolve(here, '../dist/sweet-album.css.d.ts'),
  '// Type stub so `import "sweet-album/style.css"` resolves under strict TS.\nexport {}\n',
)

console.log('[sweet-album] dist/sweet-album.css (+ .d.ts)')
