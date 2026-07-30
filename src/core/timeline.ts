import type { LayoutResult, Messages } from './types'
import { clamp, el, on } from './utils/dom'

/** Minimum vertical distance between two rendered year labels, px. */
const LABEL_MIN_GAP = 22

export interface Tick {
  /** 0-1 position along the rail. */
  at: number
  label: string
}

export interface PlacedTick extends Tick {
  /** Final pixel offset down the rail, after collision resolution. */
  y: number
}

/**
 * Place every year label, nudging apart any that would overlap.
 *
 * Nothing is ever dropped: a year with photos in it is a year you must be able
 * to jump to, so crowding is resolved by moving labels rather than removing
 * them. A label can therefore sit slightly off its true position — the rail
 * itself is still scrubbed by raw pointer position, so seeking stays exact.
 *
 * Because the set of labels never depends on the height, only their offsets
 * do, a re-render at a corrected height can shift labels but can never make
 * one appear or disappear.
 */
export function layoutTicks(
  ticks: Tick[],
  height: number,
  minGap = LABEL_MIN_GAP,
): PlacedTick[] {
  const n = ticks.length
  if (n === 0) return []

  // Before layout: spread evenly so they read as a list rather than a pile.
  // The observer corrects this as soon as a real height exists.
  if (height <= 0) {
    return ticks.map((t, i) => ({ ...t, y: i * minGap }))
  }

  // Shrink the gap if the labels cannot all fit at the preferred spacing;
  // overlapping slightly beats hiding a year.
  const gap = n > 1 ? Math.min(minGap, height / (n - 1)) : minGap
  const placed: PlacedTick[] = ticks.map((t) => ({ ...t, y: t.at * height }))

  // Push down anything too close to the label above it.
  for (let i = 1; i < n; i++) {
    if (placed[i].y - placed[i - 1].y < gap) placed[i].y = placed[i - 1].y + gap
  }

  // That can run the last label off the bottom; pull the tail back up.
  if (placed[n - 1].y > height) {
    placed[n - 1].y = height
    for (let i = n - 2; i >= 0; i--) {
      if (placed[i + 1].y - placed[i].y < gap) placed[i].y = placed[i + 1].y - gap
    }
  }

  // And that can push the first off the top. `gap` guarantees the total span
  // fits, so a single forward pass settles it.
  if (placed[0].y < 0) {
    placed[0].y = 0
    for (let i = 1; i < n; i++) {
      if (placed[i].y - placed[i - 1].y < gap) placed[i].y = placed[i - 1].y + gap
    }
  }

  return placed
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

    // Always draw, whatever the height. Waiting for a "real" height means
    // drawing nothing at all if the observer never reports one.
    const height = this.rail.clientHeight || this.root.clientHeight
    this.renderedAt = height

    for (const tick of layoutTicks(this.ticks, height)) {
      const node = el('span', 'sp-timeline__tick', this.rail)
      node.style.top = `${Math.round(tick.y)}px`
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
