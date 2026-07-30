import type { LayoutResult, Messages } from './types'
import { clamp, el, on } from './utils/dom'

/** Minimum vertical distance between two rendered year labels, px. */
const LABEL_MIN_GAP = 24

export interface Tick {
  /** 0-1 position along the rail. */
  at: number
  label: string
}

/**
 * Drop year labels that would collide at the given rail height.
 *
 * A height of zero means the rail has not been laid out yet — stylesheets in
 * flight, a display:none ancestor, a container mid-animation. Thinning against
 * it would put every tick at pixel 0 and keep only the first, so return them
 * all and let a later re-render thin properly.
 */
export function thinTicks(ticks: Tick[], height: number, minGap = LABEL_MIN_GAP): Tick[] {
  if (height <= 0) return ticks

  const kept: Tick[] = []
  let lastPx = -Infinity
  for (const tick of ticks) {
    const px = tick.at * height
    if (px - lastPx < minGap) continue
    lastPx = px
    kept.push(tick)
  }
  return kept
}

/**
 * Year scrubber pinned to the right edge.
 *
 * A single continuous line with year labels punched through it. Only years are
 * marked — with month and year views gone, this is how you cross a decade in
 * one drag without a second level of granularity cluttering the rail.
 */
export class Timeline {
  readonly root: HTMLElement
  private rail: HTMLElement
  private bubble: HTMLElement
  private thumb: HTMLElement
  private ticks: Tick[] = []
  private layout: LayoutResult | null = null
  private disposers: (() => void)[] = []
  private dragging = false
  /** Rail height the current labels were thinned against. */
  private renderedAt = -1
  private observer: ResizeObserver | null = null

  constructor(
    parent: HTMLElement,
    private readonly messages: () => Messages,
    private readonly onSeek: (fraction: number) => void,
  ) {
    this.root = el('div', 'sp-timeline', parent)
    // The line itself lives on `__line`; ticks are absolutely placed over it.
    el('div', 'sp-timeline__line', this.root)
    this.rail = el('div', 'sp-timeline__rail', this.root)
    this.thumb = el('div', 'sp-timeline__thumb', this.root)
    this.bubble = el('div', 'sp-timeline__bubble', this.root)
    this.bubble.hidden = true

    // Label thinning depends on the rail's pixel height, which is not known
    // when the album is built before its stylesheet applies — everything is
    // zero-height then, and every tick but the first gets thinned away. Watch
    // for the height arriving (or changing) and re-thin.
    if (typeof ResizeObserver !== 'undefined') {
      this.observer = new ResizeObserver(() => {
        const height = this.rail.clientHeight || this.root.clientHeight
        if (height !== this.renderedAt) this.render()
      })
      this.observer.observe(this.root)
    }

    this.disposers.push(
      on(this.root, 'pointerdown', this.onPointerDown),
      on(this.root, 'pointermove', this.onPointerMove),
      on(this.root, 'pointerup', this.onPointerUp),
      on(this.root, 'pointercancel', this.onPointerUp),
      on(this.root, 'pointerleave', this.onPointerLeave),
    )
  }

  destroy(): void {
    for (const dispose of this.disposers) dispose()
    this.disposers = []
    this.observer?.disconnect()
    this.observer = null
    this.root.remove()
  }

  setVisible(visible: boolean): void {
    this.root.hidden = !visible
  }

  /** Rebuild the year marks from a fresh layout. */
  setLayout(layout: LayoutResult): void {
    this.layout = layout
    this.ticks = []

    const total = layout.totalHeight
    if (total > 0 && layout.headers.length > 0) {
      let lastYear: number | null = null
      for (const header of layout.headers) {
        const { year } = header.group
        if (year === lastYear) continue
        lastYear = year
        this.ticks.push({ at: clamp(header.y / total, 0, 1), label: String(year) })
      }
    }

    this.render()
  }

  /** Reflect the current scroll position on the rail. */
  setProgress(fraction: number): void {
    this.thumb.style.top = `${clamp(fraction, 0, 1) * 100}%`
  }

  private render(): void {
    this.rail.textContent = ''
    if (this.ticks.length === 0) return

    const height = this.rail.clientHeight || this.root.clientHeight
    this.renderedAt = height

    for (const tick of thinTicks(this.ticks, height)) {
      const node = el('span', 'sp-timeline__tick', this.rail)
      node.style.top = `${tick.at * 100}%`
      node.textContent = tick.label
    }
  }

  /** Re-run label thinning after the rail's pixel height changes. */
  relayout(): void {
    this.render()
  }

  private fractionAt(clientY: number): number {
    const rect = this.root.getBoundingClientRect()
    if (rect.height <= 0) return 0
    return clamp((clientY - rect.top) / rect.height, 0, 1)
  }

  /** Full date of the group nearest the given rail position. */
  private labelAt(fraction: number): string {
    const layout = this.layout
    if (!layout || layout.headers.length === 0) return ''

    const y = fraction * layout.totalHeight
    let lo = 0
    let hi = layout.headers.length - 1
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1
      if (layout.headers[mid].y <= y) lo = mid
      else hi = mid - 1
    }

    return this.messages().dateHeader(layout.headers[lo].group)
  }

  private showBubble(clientY: number, fraction: number): void {
    const rect = this.root.getBoundingClientRect()
    this.bubble.hidden = false
    this.bubble.textContent = this.labelAt(fraction)
    this.bubble.style.top = `${clamp(clientY - rect.top, 12, rect.height - 12)}px`
  }

  private onPointerDown = (ev: PointerEvent): void => {
    ev.preventDefault()
    this.dragging = true
    this.root.setPointerCapture(ev.pointerId)
    this.root.classList.add('is-dragging')
    const fraction = this.fractionAt(ev.clientY)
    this.showBubble(ev.clientY, fraction)
    this.onSeek(fraction)
  }

  private onPointerMove = (ev: PointerEvent): void => {
    const fraction = this.fractionAt(ev.clientY)
    this.showBubble(ev.clientY, fraction)
    if (this.dragging) this.onSeek(fraction)
  }

  private onPointerUp = (ev: PointerEvent): void => {
    if (!this.dragging) return
    this.dragging = false
    if (this.root.hasPointerCapture(ev.pointerId)) {
      this.root.releasePointerCapture(ev.pointerId)
    }
    this.root.classList.remove('is-dragging')
  }

  private onPointerLeave = (): void => {
    if (!this.dragging) this.bubble.hidden = true
  }
}
