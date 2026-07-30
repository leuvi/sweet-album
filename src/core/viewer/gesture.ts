import { clamp, on } from '../utils/dom'

export interface Transform {
  scale: number
  x: number
  y: number
  rotation: number
}

export interface GestureLimits {
  minScale: number
  maxScale: number
}

/** Fraction of the drag distance an over-dragged axis actually moves. */
const RUBBER_BAND = 0.35
/** Hard cap on rubber-band travel, px. */
const RUBBER_MAX = 90
/**
 * How far a freely-dragged image may travel past centre, as a fraction of the
 * stage. Generous enough to move it anywhere useful, tight enough that it can
 * never be dragged out of sight.
 */
const FREE_PAN_LIMIT = 0.5

/**
 * Pan / zoom / rotate state for the viewer stage.
 *
 * The CSS transform is `translate(x, y) scale(s) rotate(r)` with the origin at
 * the image centre, so a screen point maps to image space as
 * `p_img = R⁻¹·(p_screen − t) / s`. Solving that for "keep `p_img` under the
 * cursor while `s` changes" gives `t' = p·(1 − k) + t·k` with `k = s'/s`, which
 * is independent of rotation — that identity is what makes cursor-anchored
 * wheel zoom exact even on a rotated image.
 */
export class Gesture {
  private transform: Transform = { scale: 1, x: 0, y: 0, rotation: 0 }
  private limits: GestureLimits = { minScale: 0.1, maxScale: 8 }
  /** Unrotated intrinsic content size. */
  private content = { width: 1, height: 1 }
  private disposers: (() => void)[] = []
  private pointers = new Map<number, { x: number; y: number }>()
  private panFrom: { x: number; y: number; tx: number; ty: number } | null = null
  private pinchFrom: { dist: number; scale: number } | null = null
  /** Set while a touch drives the drag; see `clamp`. */
  private rubberBand = false

  constructor(
    private readonly stage: HTMLElement,
    private readonly onChange: (t: Transform) => void,
    private readonly onDoubleTap: (clientX: number, clientY: number) => void,
    private readonly zoomStep: number,
    /** Raw pointer delta of a finished single-pointer drag, for swipe nav. */
    private readonly onPanEnd?: (dx: number, dy: number, touch: boolean) => void,
  ) {
    this.disposers.push(
      on(stage, 'pointerdown', this.onPointerDown),
      on(stage, 'pointermove', this.onPointerMove),
      on(stage, 'pointerup', this.onPointerUp),
      on(stage, 'pointercancel', this.onPointerUp),
      on(stage, 'wheel', this.onWheel, { passive: false }),
      on(stage, 'dblclick', (ev: MouseEvent) => {
        ev.preventDefault()
        this.onDoubleTap(ev.clientX, ev.clientY)
      }),
    )
  }

  destroy(): void {
    for (const dispose of this.disposers) dispose()
    this.disposers = []
    this.pointers.clear()
  }

  get value(): Transform {
    return { ...this.transform }
  }

  setLimits(limits: GestureLimits): void {
    this.limits = limits
  }

  setContentSize(width: number, height: number): void {
    this.content = { width: Math.max(1, width), height: Math.max(1, height) }
  }

  set(next: Partial<Transform>, clampTranslate = true): void {
    const merged = { ...this.transform, ...next }
    merged.scale = clamp(merged.scale, this.limits.minScale, this.limits.maxScale)
    this.transform = clampTranslate ? this.clamp(merged) : merged
    this.onChange(this.value)
  }

  /** Zoom to `scale`, keeping the given client point pinned. */
  zoomAt(scale: number, clientX: number, clientY: number): void {
    const target = clamp(scale, this.limits.minScale, this.limits.maxScale)
    const current = this.transform.scale
    if (target === current) return

    const rect = this.stage.getBoundingClientRect()
    const px = clientX - (rect.left + rect.width / 2)
    const py = clientY - (rect.top + rect.height / 2)
    const k = target / current

    this.set({
      scale: target,
      x: px * (1 - k) + this.transform.x * k,
      y: py * (1 - k) + this.transform.y * k,
    })
  }

  zoomBy(factor: number, clientX?: number, clientY?: number): void {
    const rect = this.stage.getBoundingClientRect()
    this.zoomAt(
      this.transform.scale * factor,
      clientX ?? rect.left + rect.width / 2,
      clientY ?? rect.top + rect.height / 2,
    )
  }

  /** Rotated bounding box of the content at the current scale. */
  private rotatedSize(): { width: number; height: number } {
    const rad = (this.transform.rotation * Math.PI) / 180
    const cos = Math.abs(Math.cos(rad))
    const sin = Math.abs(Math.sin(rad))
    const { width, height } = this.content
    return {
      width: width * cos + height * sin,
      height: width * sin + height * cos,
    }
  }

  /**
   * Bound the image's travel.
   *
   * An axis with overflow — the image is larger than the stage — clamps to the
   * image edges, so panning a zoomed photo never reveals empty space.
   *
   * An axis with none needs a choice. Clamping to 0 makes a drag look broken.
   * Pointer drags therefore move freely and stay where they are dropped
   * (`rubberBand` off), while touch drags rubber-band, because there the
   * gesture doubles as swipe-to-navigate and has to spring back when it does
   * not commit.
   */
  private clamp(t: Transform): Transform {
    const rect = this.stage.getBoundingClientRect()
    const rotated = this.rotatedSize()
    const overflowX = Math.max(0, (rotated.width * t.scale - rect.width) / 2)
    const overflowY = Math.max(0, (rotated.height * t.scale - rect.height) / 2)

    const axis = (value: number, overflow: number, extent: number): number => {
      if (overflow > 0) return clamp(value, -overflow, overflow)
      if (this.rubberBand) {
        return Math.sign(value) * Math.min(Math.abs(value) * RUBBER_BAND, RUBBER_MAX)
      }
      const limit = extent * FREE_PAN_LIMIT
      return clamp(value, -limit, limit)
    }

    return {
      ...t,
      x: axis(t.x, overflowX, rect.width),
      y: axis(t.y, overflowY, rect.height),
    }
  }

  /** Re-apply clamping, e.g. after the stage resized. */
  reclamp(): void {
    this.transform = this.clamp(this.transform)
    this.onChange(this.value)
  }

  private onPointerDown = (ev: PointerEvent): void => {
    if (ev.button !== undefined && ev.button !== 0) return
    // Capture is an optimisation, not a requirement — never let it abort the
    // gesture (it throws for pointers the element does not actually own).
    try {
      this.stage.setPointerCapture(ev.pointerId)
    } catch {
      /* ignore */
    }
    this.pointers.set(ev.pointerId, { x: ev.clientX, y: ev.clientY })

    if (this.pointers.size === 2) {
      this.panFrom = null
      this.pinchFrom = { dist: this.pointerDistance(), scale: this.transform.scale }
      return
    }

    // Touch drags rubber-band (they double as swipe-to-navigate); pointer
    // drags move the image freely and leave it where it lands.
    this.rubberBand = ev.pointerType === 'touch'
    this.panFrom = {
      x: ev.clientX,
      y: ev.clientY,
      tx: this.transform.x,
      ty: this.transform.y,
    }
    this.stage.classList.add('is-panning')
  }

  private onPointerMove = (ev: PointerEvent): void => {
    if (!this.pointers.has(ev.pointerId)) return
    this.pointers.set(ev.pointerId, { x: ev.clientX, y: ev.clientY })

    if (this.pinchFrom && this.pointers.size >= 2) {
      const dist = this.pointerDistance()
      if (this.pinchFrom.dist > 0) {
        const mid = this.pointerMidpoint()
        this.zoomAt(
          (this.pinchFrom.scale * dist) / this.pinchFrom.dist,
          mid.x,
          mid.y,
        )
      }
      return
    }

    if (!this.panFrom) return
    ev.preventDefault()
    this.set({
      x: this.panFrom.tx + (ev.clientX - this.panFrom.x),
      y: this.panFrom.ty + (ev.clientY - this.panFrom.y),
    })
  }

  private onPointerUp = (ev: PointerEvent): void => {
    const pan = this.panFrom
    this.pointers.delete(ev.pointerId)
    try {
      if (this.stage.hasPointerCapture?.(ev.pointerId)) {
        this.stage.releasePointerCapture(ev.pointerId)
      }
    } catch {
      /* ignore */
    }
    if (this.pointers.size < 2) this.pinchFrom = null
    if (this.pointers.size === 0) {
      this.panFrom = null
      this.stage.classList.remove('is-panning')
      const wasTouch = this.rubberBand
      this.rubberBand = false
      if (pan) this.onPanEnd?.(ev.clientX - pan.x, ev.clientY - pan.y, wasTouch)
    }
  }

  private onWheel = (ev: WheelEvent): void => {
    ev.preventDefault()
    // deltaMode 1 is lines, 2 is pages — normalise so trackpads and mice agree.
    const unit = ev.deltaMode === 1 ? 16 : ev.deltaMode === 2 ? 100 : 1
    const delta = ev.deltaY * unit
    const factor = Math.pow(this.zoomStep, -delta / 100)
    this.zoomAt(this.transform.scale * factor, ev.clientX, ev.clientY)
  }

  private pointerDistance(): number {
    const [a, b] = [...this.pointers.values()]
    if (!a || !b) return 0
    return Math.hypot(a.x - b.x, a.y - b.y)
  }

  private pointerMidpoint(): { x: number; y: number } {
    const [a, b] = [...this.pointers.values()]
    if (!a || !b) return { x: 0, y: 0 }
    return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }
  }
}
