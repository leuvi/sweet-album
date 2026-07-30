/** Tiny DOM helpers. Kept dependency-free on purpose. */

export function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className?: string,
  parent?: Node,
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag)
  if (className) node.className = className
  if (parent) parent.appendChild(node)
  return node
}

/**
 * Turn a user-supplied icon (raw SVG string or an element) into a node we can
 * mount. Strings are parsed as SVG first so `<svg>…</svg>` keeps working in the
 * SVG namespace; anything else falls back to an HTML fragment.
 */
export function toIconNode(
  icon: string | SVGElement | HTMLElement | undefined,
): Node | null {
  if (!icon) return null
  if (typeof icon !== 'string') return icon

  const trimmed = icon.trim()
  if (trimmed.startsWith('<svg')) {
    const doc = new DOMParser().parseFromString(trimmed, 'image/svg+xml')
    const svg = doc.documentElement
    if (svg && svg.nodeName.toLowerCase() === 'svg') {
      return document.importNode(svg, true)
    }
  }

  const wrap = document.createElement('span')
  wrap.innerHTML = trimmed
  return wrap.childNodes.length === 1 ? wrap.firstChild! : wrap
}

export function setIcon(
  host: HTMLElement,
  icon: string | SVGElement | HTMLElement | undefined,
): void {
  host.textContent = ''
  const node = toIconNode(icon)
  if (node) host.appendChild(node)
}

export function on<K extends keyof HTMLElementEventMap>(
  target: HTMLElement | Window | Document,
  type: K | string,
  handler: (ev: any) => void,
  options?: AddEventListenerOptions | boolean,
): () => void {
  target.addEventListener(type, handler as EventListener, options)
  return () => target.removeEventListener(type, handler as EventListener, options)
}

export function clamp(v: number, min: number, max: number): number {
  return v < min ? min : v > max ? max : v
}
