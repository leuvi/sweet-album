/**
 * Build `demo/manifest.json` from the local `demo/photos/<year>/<month>/` tree,
 * generating a small thumbnail next to each original.
 *
 * The grid must never load originals: this material runs to 25 megapixels a
 * frame, and a few dozen of those decoded at once is enough to take the tab
 * down. Thumbnails land beside the source as `<name>.thumb.webp`, the manifest
 * points `thumbUrl` at them, and `url` keeps the original for the viewer.
 *
 * The material only encodes year and month, so a day is derived from a stable
 * hash of the *folder* — every photo in a month lands on the same day. That
 * keeps day groups large, which is what makes the justified row layout
 * actually visible in the demo.
 */
import { existsSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { dirname, extname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import sizeOf from 'image-size'
import sharp from 'sharp'

const here = dirname(fileURLToPath(import.meta.url))
const photosDir = resolve(here, '../demo/photos')
const outFile = resolve(here, '../demo/manifest.json')

const IMAGE_EXT = new Set(['.jpg', '.jpeg', '.png', '.webp', '.gif', '.avif'])
/** Long edge of a generated thumbnail, px — covers 2x on the largest rows. */
const THUMB_SIZE = 480
const THUMB_SUFFIX = '.thumb.webp'
/** Regenerate everything rather than reusing thumbnails on disk. */
const FORCE = process.argv.includes('--force')

/** FNV-1a — small, stable, no dependencies. */
function hash(text) {
  let h = 0x811c9dc5
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i)
    h = Math.imul(h, 0x01000193) >>> 0
  }
  return h
}

function listDirs(dir) {
  try {
    return readdirSync(dir).filter((name) => statSync(join(dir, name)).isDirectory())
  } catch {
    return []
  }
}

/** Build the thumbnail if missing or stale. Returns false when it can't. */
async function ensureThumb(sourcePath, thumbPath) {
  if (!FORCE && existsSync(thumbPath)) {
    // Stale if the original has been touched since.
    if (statSync(thumbPath).mtimeMs >= statSync(sourcePath).mtimeMs) return true
  }
  try {
    await sharp(sourcePath)
      .rotate() // honour EXIF orientation
      .resize(THUMB_SIZE, THUMB_SIZE, { fit: 'inside', withoutEnlargement: true })
      .webp({ quality: 78 })
      .toFile(thumbPath)
    return true
  } catch {
    return false
  }
}

const photos = []
let skipped = 0
let built = 0
let reused = 0

for (const year of listDirs(photosDir).sort()) {
  for (const month of listDirs(join(photosDir, year)).sort()) {
    const dir = join(photosDir, year, month)
    const files = readdirSync(dir)
      .filter((name) => IMAGE_EXT.has(extname(name).toLowerCase()))
      // Generated thumbnails live in the same folder — never treat one as a source.
      .filter((name) => !name.endsWith(THUMB_SUFFIX))
      .sort()

    const daysInMonth = new Date(Number(year), Number(month), 0).getDate()
    // One day per month, shared by every file in the folder.
    const day = (hash(`${year}/${month}`) % daysInMonth) + 1

    for (const file of files) {
      const sourcePath = join(dir, file)

      let dimensions
      try {
        dimensions = sizeOf(readFileSync(sourcePath))
      } catch {
        skipped++
        continue
      }
      if (!dimensions?.width || !dimensions?.height) {
        skipped++
        continue
      }

      const thumbName = `${file}${THUMB_SUFFIX}`
      const existed = existsSync(join(dir, thumbName))
      const ok = await ensureThumb(sourcePath, join(dir, thumbName))
      if (!ok) {
        skipped++
        continue
      }
      if (existed && !FORCE) reused++
      else built++

      const seed = hash(`${year}/${month}/${file}`)
      // `>>>`, not `>>`: a signed shift turns seeds past 0x80000000 negative
      // and yields impossible times like `T-13:45:00`.
      const hour = (seed >>> 8) % 24
      const minute = (seed >>> 13) % 60

      const base = `/photos/${year}/${month}`
      const p2 = (n) => String(n).padStart(2, '0')
      photos.push({
        id: `${year}${month}-${file}`,
        // Intrinsic size of the ORIGINAL — the layout needs the true aspect
        // ratio, and the viewer needs real pixel dimensions for 1:1 zoom.
        width: dimensions.width,
        height: dimensions.height,
        // Local time, no zone suffix — a UTC stamp would push early-morning
        // photos onto the previous day and split the month's group in two.
        takenAt: `${year}-${month}-${p2(day)}T${p2(hour)}:${p2(minute)}:00`,
        thumbUrl: `${base}/${encodeURIComponent(thumbName)}`,
        url: `${base}/${encodeURIComponent(file)}`,
        favorite: seed % 7 === 0,
        name: file,
      })
    }
  }
}

photos.sort((a, b) => Date.parse(b.takenAt) - Date.parse(a.takenAt))

const invalid = photos.filter((p) => Number.isNaN(Date.parse(p.takenAt)))
if (invalid.length) {
  throw new Error(
    `[sweet-album] ${invalid.length} unparseable takenAt, e.g. ${invalid[0].takenAt}`,
  )
}
const noThumb = photos.filter((p) => p.thumbUrl === p.url)
if (noThumb.length) {
  throw new Error(`[sweet-album] ${noThumb.length} photos fell back to the original`)
}

writeFileSync(outFile, JSON.stringify(photos, null, 2))

const years = new Set(photos.map((p) => p.takenAt.slice(0, 4)))
const days = new Set(photos.map((p) => p.takenAt.slice(0, 10)))
console.log(
  `[sweet-album] manifest: ${photos.length} photos · ${days.size} days · ${years.size} years` +
    ` · thumbs ${built} built, ${reused} reused` +
    (skipped ? ` · ${skipped} skipped` : ''),
)
