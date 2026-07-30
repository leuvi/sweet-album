import type { ContextMenuContext, MenuItem } from './types'
import { el, on, setIcon } from './utils/dom'

const EDGE_PADDING = 8

/**
 * Context menu host.
 *
 * Single level by design — no submenus. The library owns positioning, flipping,
 * keyboard handling and dismissal but ships **zero** built-in entries; every
 * item comes from the consumer's `contextMenu` option.
 */
export class ContextMenu {
  private root: HTMLElement | null = null
  private disposers: (() => void)[] = []
  private ctx: ContextMenuContext | null = null

  constructor(private readonly themeHost: () => HTMLElement) {}

  get isOpen(): boolean {
    return this.root !== null
  }

  open(
    items: MenuItem[],
    x: number,
    y: number,
    ctx: Omit<ContextMenuContext, 'close'>,
  ): void {
    this.close()
    if (items.length === 0) return

    this.ctx = { ...ctx, close: () => this.close() }

    const root = el('div', 'sp-menu')
    root.setAttribute('role', 'menu')
    // Inherit theme tokens even though we portal to <body>.
    root.dataset.theme = this.themeHost().dataset.theme ?? 'dark'
    this.renderItems(root, items)
    document.body.appendChild(root)
    this.root = root

    this.place(root, x, y)

    this.disposers.push(
      on(document, 'pointerdown', this.onDocPointerDown, true),
      on(document, 'keydown', this.onKeyDown, true),
      on(window, 'resize', () => this.close()),
      on(window, 'scroll', () => this.close(), true),
      on(root, 'contextmenu', (ev: MouseEvent) => ev.preventDefault()),
    )
  }

  close(): void {
    for (const dispose of this.disposers) dispose()
    this.disposers = []
    this.root?.remove()
    this.root = null
    this.ctx = null
  }

  private renderItems(host: HTMLElement, items: MenuItem[]): void {
    for (const item of items) {
      if (item.divider) {
        el('div', 'sp-menu__divider', host)
        continue
      }

      const button = el('button', 'sp-menu__item', host)
      button.type = 'button'
      button.setAttribute('role', 'menuitem')
      if (item.disabled) button.disabled = true
      if (item.danger) button.classList.add('is-danger')

      const icon = el('span', 'sp-menu__icon', button)
      setIcon(icon, item.icon)

      const label = el('span', 'sp-menu__label', button)
      label.textContent = item.label

      button.addEventListener('click', () => {
        if (item.disabled) return
        const ctx = this.ctx
        // Close first so handlers can open their own dialogs unimpeded.
        this.close()
        item.onClick?.(ctx!)
      })
    }
  }

  /** Position at (x, y), flipping back over the anchor when it overflows. */
  private place(node: HTMLElement, x: number, y: number): void {
    node.style.visibility = 'hidden'
    node.style.left = '0px'
    node.style.top = '0px'

    const { width, height } = node.getBoundingClientRect()
    const maxX = window.innerWidth - EDGE_PADDING
    const maxY = window.innerHeight - EDGE_PADDING

    let left = x
    if (left + width > maxX) left = x - width
    left = Math.max(EDGE_PADDING, Math.min(left, maxX - width))

    let top = y
    if (top + height > maxY) top = Math.max(EDGE_PADDING, maxY - height)

    node.style.left = `${Math.round(left)}px`
    node.style.top = `${Math.round(top)}px`
    node.style.visibility = ''
  }

  private onDocPointerDown = (ev: PointerEvent): void => {
    if (this.root?.contains(ev.target as Node)) return
    this.close()
  }

  private onKeyDown = (ev: KeyboardEvent): void => {
    if (ev.key === 'Escape') {
      ev.stopPropagation()
      this.close()
    }
  }
}
