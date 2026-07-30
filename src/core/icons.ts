/**
 * Built-in icons as raw SVG strings.
 *
 * `currentColor` throughout, so they inherit whatever the theme sets. Consumers
 * pass their own SVG strings in exactly this shape for custom menu items and
 * viewer actions.
 */

const svg = (body: string, extra = ''): string =>
  `<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"${extra}>${body}</svg>`

export const icons = {
  /** Filled when active, outlined otherwise — the tile favorite control. */
  heart: svg(
    '<path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1-1.1a5.5 5.5 0 0 0-7.8 7.8l1.1 1L12 21l7.7-7.6 1.1-1a5.5 5.5 0 0 0 0-7.8z"/>',
  ),
  heartFilled: svg(
    '<path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1-1.1a5.5 5.5 0 0 0-7.8 7.8l1.1 1L12 21l7.7-7.6 1.1-1a5.5 5.5 0 0 0 0-7.8z" fill="currentColor"/>',
  ),
  check: svg('<path d="M20 6 9 17l-5-5"/>'),
  close: svg('<path d="M18 6 6 18M6 6l12 12"/>'),
  chevronLeft: svg('<path d="m15 18-6-6 6-6"/>'),
  chevronRight: svg('<path d="m9 18 6-6-6-6"/>'),
  zoomIn: svg(
    '<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5M11 8v6M8 11h6"/>',
  ),
  zoomOut: svg('<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5M8 11h6"/>'),
  rotateLeft: svg('<path d="M3 5v6h6"/><path d="M3.5 11a9 9 0 1 1 2 7"/>'),
  rotateRight: svg('<path d="M21 5v6h-6"/><path d="M20.5 11a9 9 0 1 0-2 7"/>'),
  actualSize: svg(
    '<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M8 9v6M8 12h4M16 9v6"/>',
  ),
  fit: svg('<path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"/>'),
  image: svg(
    '<rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="m21 15-5-5L5 21"/>',
  ),
  broken: svg(
    '<rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 14h4l2-3 3 4 2-2 3 3h4"/>',
  ),
} as const

export type IconName = keyof typeof icons
