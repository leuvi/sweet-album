import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useLayoutEffect,
  useRef,
  type CSSProperties,
} from 'react'
import { SweetAlbum as SweetAlbumCore } from '../core/index'
import type { DataSource, SweetAlbumOptions } from '../core/types'

export type SweetAlbumHandle = SweetAlbumCore

export interface SweetAlbumProps extends SweetAlbumOptions {
  className?: string
  style?: CSSProperties
}

/** Option keys that are plain values; everything else is a callback or data. */
const VALUE_KEYS = [
  'order',
  'gap',
  'targetRowHeight',
  'headerHeight',
  'groupSpacing',
  'overscan',
  'selectable',
  'favorite',
  'header',
  'timeline',
  'locale',
  'theme',
] as const

/**
 * React binding.
 *
 * A thin lifecycle shim: the core instance owns all rendering, so React only
 * mounts a host element, forwards option changes and tears down on unmount.
 * Callback props are read through a ref, so passing inline arrow functions
 * never recreates the album.
 */
export const SweetAlbum = forwardRef<SweetAlbumHandle, SweetAlbumProps>(
  function SweetAlbum(props, ref) {
    const hostRef = useRef<HTMLDivElement | null>(null)
    const instanceRef = useRef<SweetAlbumCore | null>(null)
    const propsRef = useRef(props)
    propsRef.current = props

    useImperativeHandle(ref, () => instanceRef.current as SweetAlbumHandle, [])

    // Create once. `useLayoutEffect` so the first paint already has geometry.
    useLayoutEffect(() => {
      const host = hostRef.current
      if (!host) return

      const p = propsRef.current
      const instance = new SweetAlbumCore(host, {
        ...p,
        // Stable trampolines into the latest props.
        onItemClick: (...args) => propsRef.current.onItemClick?.(...args),
        onSelectionChange: (...args) =>
          propsRef.current.onSelectionChange?.(...args),
        onFavoriteToggle: (...args) =>
          propsRef.current.onFavoriteToggle?.(...args),
        onViewerOpen: (...args) => propsRef.current.onViewerOpen?.(...args),
        onViewerClose: () => propsRef.current.onViewerClose?.(),
        onError: (...args) => propsRef.current.onError?.(...args),
        contextMenu: (ctx) => propsRef.current.contextMenu?.(ctx) ?? false,
        selectionActions: (selected) => {
          const spec = propsRef.current.selectionActions
          return typeof spec === 'function' ? spec(selected) : (spec ?? [])
        },
        thumbUrl: p.thumbUrl
          ? (item, size) => propsRef.current.thumbUrl!(item, size)
          : undefined,
        badges: p.badges ? (item) => propsRef.current.badges!(item) : undefined,
      })
      instanceRef.current = instance

      return () => {
        instance.destroy()
        instanceRef.current = null
      }
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [])

    // Forward value-option changes.
    useEffect(() => {
      const instance = instanceRef.current
      if (!instance) return
      const next: Partial<SweetAlbumOptions> = {}
      for (const key of VALUE_KEYS) {
        if (props[key] !== undefined) (next as any)[key] = props[key]
      }
      next.messages = props.messages
      next.viewer = props.viewer
      instance.setOptions(next)
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, VALUE_KEYS.map((key) => props[key]).concat([props.messages, props.viewer] as any))

    // Forward data changes by identity.
    useEffect(() => {
      const instance = instanceRef.current
      if (!instance || props.data === undefined) return
      void instance.setData(props.data as DataSource)
    }, [props.data])

    return (
      <div
        ref={hostRef}
        className={
          props.className
            ? `sweet-album-host ${props.className}`
            : 'sweet-album-host'
        }
        style={props.style}
      />
    )
  },
)

/**
 * Escape hatch for imperative use: mount the album yourself and keep a handle.
 *
 * ```tsx
 * const ref = useRef<HTMLDivElement>(null)
 * const album = useSweetAlbum(ref, { data })
 * ```
 */
export function useSweetAlbum(
  hostRef: React.RefObject<HTMLElement | null>,
  options: SweetAlbumOptions,
): SweetAlbumCore | null {
  const instanceRef = useRef<SweetAlbumCore | null>(null)
  const optionsRef = useRef(options)
  optionsRef.current = options

  useLayoutEffect(() => {
    const host = hostRef.current
    if (!host) return
    const instance = new SweetAlbumCore(host, optionsRef.current)
    instanceRef.current = instance
    return () => {
      instance.destroy()
      instanceRef.current = null
    }
  }, [hostRef])

  return instanceRef.current
}

export default SweetAlbum
export * from '../core/types'
