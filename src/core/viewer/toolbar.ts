import { icons } from '../icons'
import type {
  BuiltinViewerActionId,
  Messages,
  ViewerAction,
  ViewerControls,
  ViewerState,
} from '../types'
import { el, setIcon } from '../utils/dom'

export const DEFAULT_ACTIONS: BuiltinViewerActionId[] = [
  'rotateLeft',
  'rotateRight',
  'divider',
  'zoomOut',
  'zoomLevel',
  'zoomIn',
  'divider',
  'actualSize',
  'fit',
]

interface Entry {
  id: string
  node: HTMLElement
  /** Built-in readouts (the zoom percentage) refresh on every state change. */
  refresh?: (state: ViewerState) => void
  action?: ViewerAction
}

/**
 * Bottom-centre action bar of the viewer.
 *
 * Built-ins are referenced by id, custom buttons are plain objects with an SVG
 * icon — mix and reorder them freely via `viewer.actions`.
 */
export class ViewerToolbar {
  readonly root: HTMLElement
  private entries: Entry[] = []

  constructor(
    parent: HTMLElement,
    private readonly messages: () => Messages,
    private readonly controls: ViewerControls,
    actions: (BuiltinViewerActionId | ViewerAction)[],
  ) {
    this.root = el('div', 'sp-viewer__toolbar', parent)
    this.root.setAttribute('role', 'toolbar')
    for (const action of actions) this.add(action)
  }

  destroy(): void {
    this.root.remove()
    this.entries = []
  }

  update(state: ViewerState): void {
    for (const entry of this.entries) {
      entry.refresh?.(state)
      if (entry.action?.disabled !== undefined) {
        ;(entry.node as HTMLButtonElement).disabled = entry.action.disabled
      }
    }
  }

  private add(action: BuiltinViewerActionId | ViewerAction): void {
    if (typeof action === 'string') {
      this.addBuiltin(action)
      return
    }

    const button = this.button(action.title ?? action.id)
    setIcon(button, action.icon)
    button.addEventListener('click', () =>
      action.onClick?.({ state: this.controls.getState(), controls: this.controls }),
    )
    this.entries.push({ id: action.id, node: button, action })
  }

  private addBuiltin(id: BuiltinViewerActionId): void {
    const msg = this.messages()

    if (id === 'divider') {
      const node = el('span', 'sp-viewer__divider', this.root)
      this.entries.push({ id, node })
      return
    }

    if (id === 'zoomLevel') {
      const node = el('span', 'sp-viewer__zoom', this.root)
      node.textContent = '100%'
      this.entries.push({
        id,
        node,
        refresh: (state) => {
          node.textContent = `${Math.round(state.scale * 100)}%`
        },
      })
      return
    }

    const spec: Record<
      Exclude<BuiltinViewerActionId, 'divider' | 'zoomLevel'>,
      { icon: string; title: string; run: () => void }
    > = {
      rotateLeft: {
        icon: icons.rotateLeft,
        title: msg.rotateLeft,
        run: () => this.controls.rotate(-90),
      },
      rotateRight: {
        icon: icons.rotateRight,
        title: msg.rotateRight,
        run: () => this.controls.rotate(90),
      },
      zoomOut: {
        icon: icons.zoomOut,
        title: msg.zoomOut,
        run: () => this.controls.zoomOut(),
      },
      zoomIn: {
        icon: icons.zoomIn,
        title: msg.zoomIn,
        run: () => this.controls.zoomIn(),
      },
      actualSize: {
        icon: icons.actualSize,
        title: msg.actualSize,
        run: () => this.controls.actualSize(),
      },
      fit: {
        icon: icons.fit,
        title: msg.fitToWindow,
        run: () => this.controls.fit(),
      },
    }

    const entry = spec[id]
    if (!entry) return

    const button = this.button(entry.title)
    button.innerHTML = entry.icon
    button.addEventListener('click', entry.run)
    this.entries.push({ id, node: button })
  }

  private button(title: string): HTMLButtonElement {
    const button = el('button', 'sp-viewer__btn', this.root)
    button.type = 'button'
    button.title = title
    button.setAttribute('aria-label', title)
    return button
  }
}
