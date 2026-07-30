import { icons } from '../icons'
import type {
  Messages,
  PhotoItem,
  ResolvedPhoto,
  ViewerControls,
  ViewerOptions,
  ViewerState,
} from '../types'
import { el, on } from '../utils/dom'
import { rafThrottle } from '../utils/raf'
import { Gesture, type Transform } from './gesture'
import { DEFAULT_ACTIONS, ViewerToolbar } from './toolbar'

/** Horizontal drag distance that commits to prev/next, px. */
const SWIPE_THRESHOLD = 60
/** Movement past which a pointer gesture counts as a drag, not a click. */
const DRAG_SLOP = 4

const DEFAULTS: Required<Omit<ViewerOptions, 'actions'>> = {
  initialFit: 'contain',
  maxScale: 8,
  zoomStep: 1.25,
  preload: 1,
  arrows: true,
  // Off by default: the stage is a drag surface, and a drag that ends outside
  // the image delivers its click to the stage — closing the viewer mid-gesture.
  closeOnBackdrop: false,
}

export interface ViewerHost {
  photos: () => ResolvedPhoto[]
  messages: () => Messages
  theme: () => string
  onOpen: (item: PhotoItem, index: number) => void
  onClose: () => void
}

/**
 * Full-screen photo viewer.
 *
 * Opens at "contain" scale — the image fills the viewport along whichever axis
 * runs out first, at its true aspect ratio, so it is never distorted regardless
 * of window shape.
 */
export class Viewer {
  private root: HTMLElement | null = null
  private stage!: HTMLElement
  /** True when the last gesture moved — used to reject click-to-close. */
  private dragged = false
  private img!: HTMLImageElement
  private status!: HTMLElement
  private counter!: HTMLElement
  private prevBtn: HTMLButtonElement | null = null
  private nextBtn: HTMLButtonElement | null = null
  private toolbar: ViewerToolbar | null = null
  private gesture: Gesture | null = null

  private index = -1
  private natural = { width: 0, height: 0 }
  private disposers: (() => void)[] = []
  private preloaded = new Set<string>()
  private lastFocus: Element | null = null
  private opts: Required<Omit<ViewerOptions, 'actions'>> & Pick<ViewerOptions, 'actions'>

  constructor(
    private readonly host: ViewerHost,
    options: ViewerOptions = {},
  ) {
    this.opts = { ...DEFAULTS, ...options }
  }

  get isOpen(): boolean {
    return this.root !== null
  }

  get currentIndex(): number {
    return this.index
  }

  setOptions(options: ViewerOptions): void {
    this.opts = { ...DEFAULTS, ...options }
  }

  /* ----------------------------------------------------------- lifecycle */

  open(index: number): void {
    const photos = this.host.photos()
    if (index < 0 || index >= photos.length) return
    if (!this.root) this.mount()
    this.show(index)
  }

  close(): void {
    if (!this.root) return

    for (const dispose of this.disposers) dispose()
    this.disposers = []
    this.gesture?.destroy()
    this.gesture = null
    this.toolbar?.destroy()
    this.toolbar = null
    this.root.remove()
    this.root = null
    this.index = -1
    this.preloaded.clear()

    document.documentElement.classList.remove('sp-lock-scroll')
    if (this.lastFocus instanceof HTMLElement) this.lastFocus.focus({ preventScroll: true })
    this.lastFocus = null

    this.host.onClose()
  }

  next(): void {
    this.show(this.index + 1)
  }

  prev(): void {
    this.show(this.index - 1)
  }

  private mount(): void {
    this.lastFocus = document.activeElement
    const msg = this.host.messages()

    const root = el('div', 'sp-viewer')
    root.dataset.theme = this.host.theme()
    root.tabIndex = -1
    root.setAttribute('role', 'dialog')
    root.setAttribute('aria-modal', 'true')

    const backdrop = el('div', 'sp-viewer__backdrop', root)

    this.stage = el('div', 'sp-viewer__stage', root)
    this.img = el('img', 'sp-viewer__img', this.stage)
    this.img.draggable = false
    this.img.alt = ''
    this.img.addEventListener('load', this.onImageLoad)
    this.img.addEventListener('error', this.onImageError)

    this.status = el('div', 'sp-viewer__status', this.stage)

    const closeBtn = el('button', 'sp-viewer__close', root)
    closeBtn.type = 'button'
    closeBtn.title = msg.close
    closeBtn.setAttribute('aria-label', msg.close)
    closeBtn.innerHTML = icons.close
    closeBtn.addEventListener('click', () => this.close())

    this.counter = el('div', 'sp-viewer__counter', root)

    if (this.opts.arrows) {
      this.prevBtn = el('button', 'sp-viewer__nav sp-viewer__nav--prev', root)
      this.prevBtn.type = 'button'
      this.prevBtn.title = msg.prev
      this.prevBtn.setAttribute('aria-label', msg.prev)
      this.prevBtn.innerHTML = icons.chevronLeft
      this.prevBtn.addEventListener('click', () => this.prev())

      this.nextBtn = el('button', 'sp-viewer__nav sp-viewer__nav--next', root)
      this.nextBtn.type = 'button'
      this.nextBtn.title = msg.next
      this.nextBtn.setAttribute('aria-label', msg.next)
      this.nextBtn.innerHTML = icons.chevronRight
      this.nextBtn.addEventListener('click', () => this.next())
    }

    document.body.appendChild(root)
    this.root = root
    document.documentElement.classList.add('sp-lock-scroll')

    this.gesture = new Gesture(
      this.stage,
      this.applyTransform,
      this.toggleZoomAt,
      this.opts.zoomStep,
      this.onPanEnd,
    )

    this.toolbar = new ViewerToolbar(
      root,
      this.host.messages,
      this.controls,
      this.opts.actions ?? DEFAULT_ACTIONS,
    )

    this.disposers.push(
      on(root, 'keydown', this.onKeyDown),
      on(window, 'resize', this.onResize),
      on(backdrop, 'click', () => {
        if (this.opts.closeOnBackdrop && !this.dragged) this.close()
      }),
      on(this.stage, 'click', (ev: MouseEvent) => {
        // Clicking the empty area beside the image also dismisses — but a drag
        // that merely ended there is not a click on the backdrop.
        if (ev.target !== this.stage || this.dragged) return
        if (this.opts.closeOnBackdrop) this.close()
      }),
    )

    root.focus({ preventScroll: true })
  }

  /* -------------------------------------------------------------- display */

  private show(index: number): void {
    const photos = this.host.photos()
    if (index < 0 || index >= photos.length) return

    const photo = photos[index]
    this.index = index
    this.natural = { width: photo.width, height: photo.height }

    this.root?.classList.remove('is-error')
    this.root?.classList.add('is-loading')
    this.status.textContent = this.host.messages().loading

    this.img.alt = photo.alt
    this.img.src = photo.url

    // Lay out immediately from the known intrinsic size — no waiting on bytes.
    this.gesture?.setContentSize(photo.width, photo.height)
    this.gesture?.set({ rotation: 0, x: 0, y: 0 }, false)
    this.fit()

    if (this.img.complete && this.img.naturalWidth > 0) this.onImageLoad()

    this.counter.textContent = `${index + 1} / ${photos.length}`
    if (this.prevBtn) this.prevBtn.disabled = index === 0
    if (this.nextBtn) this.nextBtn.disabled = index === photos.length - 1

    this.host.onOpen(photo.raw, index)
    this.preload(index)
  }

  private onImageLoad = (): void => {
    this.root?.classList.remove('is-loading')
    const w = this.img.naturalWidth
    const h = this.img.naturalHeight
    // Trust the real bytes over the metadata if they disagree.
    if (w > 0 && h > 0 && (w !== this.natural.width || h !== this.natural.height)) {
      this.natural = { width: w, height: h }
      this.gesture?.setContentSize(w, h)
      this.fit()
    }
  }

  private onImageError = (): void => {
    this.root?.classList.remove('is-loading')
    this.root?.classList.add('is-error')
    this.status.textContent = this.host.messages().loadFailed
  }

  private preload(index: number): void {
    const photos = this.host.photos()
    for (let d = 1; d <= this.opts.preload; d++) {
      for (const i of [index - d, index + d]) {
        const photo = photos[i]
        if (!photo || this.preloaded.has(photo.key)) continue
        this.preloaded.add(photo.key)
        const img = new Image()
        img.decoding = 'async'
        img.src = photo.url
      }
    }
  }

  /* ------------------------------------------------------------ transform */

  /** Scale at which the image exactly fits the stage without cropping. */
  private fitScale(rotation = this.gesture?.value.rotation ?? 0): number {
    const rect = this.stage.getBoundingClientRect()
    const quarterTurn = Math.abs(rotation % 180) === 90
    const w = quarterTurn ? this.natural.height : this.natural.width
    const h = quarterTurn ? this.natural.width : this.natural.height
    if (!w || !h || !rect.width || !rect.height) return 1

    const scale = Math.min(rect.width / w, rect.height / h)
    return this.opts.initialFit === 'no-upscale' ? Math.min(1, scale) : scale
  }

  private applyTransform = (t: Transform): void => {
    this.img.style.transform = `translate3d(${t.x}px, ${t.y}px, 0) scale(${t.scale}) rotate(${t.rotation}deg)`
    this.img.style.width = `${this.natural.width}px`
    this.img.style.height = `${this.natural.height}px`
    this.toolbar?.update(this.state())
  }

  /**
   * Touch only: a horizontal swipe on a fitted image changes photo, and
   * anything short of the threshold springs back. Pointer drags are left alone
   * — they pan freely and the image stays where it was dropped.
   */
  private onPanEnd = (dx: number, dy: number, touch: boolean): void => {
    this.dragged = Math.hypot(dx, dy) > DRAG_SLOP
    if (!touch) return

    const scale = this.gesture?.value.scale ?? 1
    if (scale > this.fitScale() * 1.05) return

    if (Math.abs(dx) >= SWIPE_THRESHOLD && Math.abs(dx) > Math.abs(dy)) {
      if (dx < 0) this.next()
      else this.prev()
      return
    }

    this.settle()
  }

  /** Animate any rubber-band offset back to centre. */
  private settle(): void {
    const t = this.gesture?.value
    if (!t || (t.x === 0 && t.y === 0)) return

    this.img.classList.add('is-settling')
    this.gesture?.set({ x: 0, y: 0 })
    window.setTimeout(() => this.img.classList.remove('is-settling'), 220)
  }

  private toggleZoomAt = (clientX: number, clientY: number): void => {
    const fit = this.fitScale()
    const current = this.gesture?.value.scale ?? 1
    const target = Math.abs(current - fit) < 0.01 ? 1 : fit
    this.gesture?.zoomAt(target, clientX, clientY)
  }

  private fit = (): void => {
    const scale = this.fitScale()
    this.gesture?.setLimits({
      // Never let the user zoom below "fits the window".
      minScale: Math.min(scale, 1) * 0.5,
      maxScale: this.opts.maxScale,
    })
    this.gesture?.set({ scale, x: 0, y: 0 })
  }

  private onResize = rafThrottle((): void => {
    if (!this.root) return
    this.fit()
  })

  private state(): ViewerState {
    const photos = this.host.photos()
    const photo = photos[this.index]
    const t = this.gesture?.value ?? { scale: 1, x: 0, y: 0, rotation: 0 }
    return {
      item: photo?.raw as PhotoItem,
      index: this.index,
      total: photos.length,
      scale: t.scale,
      rotation: t.rotation,
      x: t.x,
      y: t.y,
    }
  }

  private readonly controls: ViewerControls = {
    zoomIn: (step) => this.gesture?.zoomBy(step ?? this.opts.zoomStep),
    zoomOut: (step) => this.gesture?.zoomBy(1 / (step ?? this.opts.zoomStep)),
    zoomTo: (scale) => this.gesture?.set({ scale }),
    rotate: (delta) => {
      const rotation = ((this.gesture?.value.rotation ?? 0) + delta) % 360
      this.gesture?.set({ rotation, x: 0, y: 0 }, false)
      // Re-fit so a portrait photo turned sideways still fits the window.
      const scale = this.fitScale(rotation)
      this.gesture?.setLimits({
        minScale: Math.min(scale, 1) * 0.5,
        maxScale: this.opts.maxScale,
      })
      this.gesture?.set({ scale })
    },
    reset: () => this.fit(),
    fit: () => this.fit(),
    actualSize: () => this.gesture?.set({ scale: 1, x: 0, y: 0 }),
    next: () => this.next(),
    prev: () => this.prev(),
    close: () => this.close(),
    getState: () => this.state(),
  }

  /* -------------------------------------------------------------- keyboard */

  private onKeyDown = (ev: KeyboardEvent): void => {
    switch (ev.key) {
      case 'Escape':
        ev.preventDefault()
        this.close()
        break
      case 'ArrowLeft':
        ev.preventDefault()
        this.prev()
        break
      case 'ArrowRight':
        ev.preventDefault()
        this.next()
        break
      case '+':
      case '=':
        ev.preventDefault()
        this.controls.zoomIn()
        break
      case '-':
      case '_':
        ev.preventDefault()
        this.controls.zoomOut()
        break
      case '0':
        ev.preventDefault()
        this.fit()
        break
      case '1':
        ev.preventDefault()
        this.controls.actualSize()
        break
      default:
        break
    }
  }
}
