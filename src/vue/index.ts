import {
  defineComponent,
  h,
  onBeforeUnmount,
  onMounted,
  ref,
  watch,
  type App,
  type PropType,
} from 'vue'
import { SweetAlbum as SweetAlbumCore } from '../core/index'
import type {
  ContextMenuContext,
  DataSource,
  Locale,
  MenuItem,
  Messages,
  PhotoItem,
  SweetAlbumOptions,
  Theme,
  ViewerOptions,
} from '../core/types'

/**
 * Vue 3 binding.
 *
 * Like the React wrapper this is a lifecycle shim around the core instance —
 * props are watched and pushed down, DOM events come back out as emits.
 */
export const SweetAlbum = defineComponent({
  name: 'SweetAlbum',

  props: {
    data: {
      type: [Array, Function] as PropType<DataSource>,
      default: undefined,
    },
    order: { type: String as PropType<'desc' | 'asc'>, default: undefined },
    gap: { type: Number, default: undefined },
    targetRowHeight: { type: Number, default: undefined },
    headerHeight: { type: Number, default: undefined },
    groupSpacing: { type: Number, default: undefined },
    overscan: { type: Number, default: undefined },
    selectable: { type: Boolean, default: undefined },
    favorite: { type: Boolean, default: undefined },
    header: { type: Boolean, default: undefined },
    timeline: { type: Boolean, default: undefined },
    locale: { type: String as PropType<Locale>, default: undefined },
    theme: { type: String as PropType<Theme>, default: undefined },
    messages: {
      type: Object as PropType<Partial<Messages>>,
      default: undefined,
    },
    viewer: {
      type: [Object, Boolean] as PropType<ViewerOptions | false>,
      default: undefined,
    },
    thumbUrl: {
      type: Function as PropType<NonNullable<SweetAlbumOptions['thumbUrl']>>,
      default: undefined,
    },
    contextMenu: {
      type: Function as PropType<(ctx: ContextMenuContext) => MenuItem[] | false>,
      default: undefined,
    },
    selectionActions: {
      type: [Array, Function] as PropType<
        NonNullable<SweetAlbumOptions['selectionActions']>
      >,
      default: undefined,
    },
    badges: {
      type: Function as PropType<NonNullable<SweetAlbumOptions['badges']>>,
      default: undefined,
    },
    /** `v-model:selection` */
    selection: {
      type: Array as PropType<(string | number)[]>,
      default: undefined,
    },
  },

  emits: [
    'ready',
    'item-click',
    'selection-change',
    'favorite-toggle',
    'viewer-open',
    'viewer-close',
    'error',
    'update:selection',
  ],

  setup(props, { emit, expose }) {
    const host = ref<HTMLDivElement | null>(null)
    const instance = ref<SweetAlbumCore | null>(null)
    /** Guards against echoing our own selection back down as a prop change. */
    let selfSelection = false

    onMounted(() => {
      if (!host.value) return

      const album = new SweetAlbumCore(host.value, {
        ...toOptions(props),
        data: props.data,
        thumbUrl: props.thumbUrl ? (item, size) => props.thumbUrl!(item, size) : undefined,
        contextMenu: (ctx) => props.contextMenu?.(ctx) ?? false,
        selectionActions: (selected) => {
          const spec = props.selectionActions
          return typeof spec === 'function' ? spec(selected) : (spec ?? [])
        },
        badges: props.badges ? (item) => props.badges!(item) : undefined,
        onFavoriteToggle: (item, favorite) => {
          emit('favorite-toggle', item, favorite)
        },
      })

      album.on('ready', (info) => emit('ready', info))
      album.on('itemClick', (item, index, ev) => emit('item-click', item, index, ev))
      album.on('viewerOpen', (item, index) => emit('viewer-open', item, index))
      album.on('viewerClose', () => emit('viewer-close'))
      album.on('error', (err) => emit('error', err))
      album.on('selectionChange', (ids, items) => {
        selfSelection = true
        emit('selection-change', ids, items as PhotoItem[])
        emit('update:selection', ids)
        selfSelection = false
      })

      instance.value = album
      if (props.selection?.length) album.setSelection(props.selection)
    })

    onBeforeUnmount(() => {
      instance.value?.destroy()
      instance.value = null
    })

    watch(
      () => props.data,
      (data) => {
        if (data !== undefined) void instance.value?.setData(data)
      },
    )

    watch(
      () => toOptions(props),
      (options) => instance.value?.setOptions(options),
      { deep: true },
    )

    watch(
      () => props.selection,
      (ids) => {
        if (selfSelection || !ids) return
        instance.value?.setSelection(ids)
      },
      { deep: true },
    )

    expose({
      /** The underlying core instance — full imperative API. */
      album: instance,
      open: (target: string | number) => instance.value?.open(target),
      closeViewer: () => instance.value?.closeViewer(),
      selectAll: () => instance.value?.selectAll(),
      clearSelection: () => instance.value?.clearSelection(),
      getSelection: () => instance.value?.getSelection() ?? [],
      getPhotos: () => instance.value?.getPhotos() ?? [],
      getFavorites: () => instance.value?.getFavorites() ?? [],
      setFavorite: (id: string | number, favorite: boolean) =>
        instance.value?.setFavorite(id, favorite),
      scrollToDate: (y: number, m?: number, d?: number) =>
        instance.value?.scrollToDate(y, m, d),
      scrollToIndex: (i: number) => instance.value?.scrollToIndex(i),
      refresh: () => instance.value?.refresh(),
    })

    return () => h('div', { ref: host, class: 'sweet-album-host' })
  },
})

function toOptions(props: Record<string, unknown>): Partial<SweetAlbumOptions> {
  const keys = [
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
    'messages',
    'viewer',
  ] as const

  const out: Record<string, unknown> = {}
  for (const key of keys) {
    if (props[key] !== undefined) out[key] = props[key]
  }
  return out as Partial<SweetAlbumOptions>
}

/** `app.use(SweetAlbumPlugin)` registers `<SweetAlbum />` globally. */
export const SweetAlbumPlugin = {
  install(app: App): void {
    app.component('SweetAlbum', SweetAlbum)
  },
}

export default SweetAlbum
export * from '../core/types'
