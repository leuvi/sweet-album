import { icons } from './icons'
import type { Messages, PhotoItem, ToolbarAction } from './types'
import { el, setIcon } from './utils/dom'

export interface ToolbarContext {
  messages: () => Messages
  /** Batch actions for the current selection, already resolved to an array. */
  actions: (selected: PhotoItem[]) => ToolbarAction[]
  selected: () => PhotoItem[]
  onClear: () => void
}

/**
 * Top bar: photo count normally; selection count plus the consumer's batch
 * actions once anything is selected.
 *
 * This is the single home for bulk operations — day headers select, the top bar
 * acts.
 */
export class Toolbar {
  readonly root: HTMLElement
  private count: HTMLElement
  private actionsHost: HTMLElement
  private clearBtn: HTMLButtonElement
  /** Signature of the currently rendered actions, to avoid pointless rebuilds. */
  private renderedKey = ''

  constructor(
    parent: HTMLElement,
    private readonly ctx: ToolbarContext,
  ) {
    this.root = el('div', 'sp-toolbar', parent)
    this.count = el('span', 'sp-toolbar__count', this.root)
    this.actionsHost = el('div', 'sp-toolbar__actions', this.root)

    this.clearBtn = el('button', 'sp-toolbar__btn', this.root)
    this.clearBtn.type = 'button'
    this.clearBtn.innerHTML = icons.close
    el('span', '', this.clearBtn)
    this.clearBtn.addEventListener('click', ctx.onClear)
  }

  setVisible(visible: boolean): void {
    this.root.hidden = !visible
  }

  update(total: number, selectedCount: number): void {
    const msg = this.ctx.messages()
    const hasSelection = selectedCount > 0

    this.root.classList.toggle('is-selecting', hasSelection)
    this.count.textContent = hasSelection
      ? `${selectedCount} ${msg.selected}`
      : `${total} ${total === 1 ? msg.photo : msg.photos}`

    this.clearBtn.hidden = !hasSelection
    this.clearBtn.title = msg.clearSelection
    const label = this.clearBtn.querySelector('span')
    if (label) label.textContent = msg.clearSelection

    this.renderActions(hasSelection)
  }

  private renderActions(hasSelection: boolean): void {
    if (!hasSelection) {
      if (this.renderedKey !== '') {
        this.actionsHost.textContent = ''
        this.renderedKey = ''
      }
      return
    }

    const selected = this.ctx.selected()
    const actions = this.ctx.actions(selected)
    const key = actions
      .map((a) => `${a.id}:${a.label}:${a.disabled ? 1 : 0}`)
      .join('|')
    if (key === this.renderedKey) return

    this.renderedKey = key
    this.actionsHost.textContent = ''

    for (const action of actions) {
      const button = el('button', 'sp-toolbar__btn', this.actionsHost)
      button.type = 'button'
      button.title = action.label
      if (action.danger) button.classList.add('is-danger')
      if (action.disabled) button.disabled = true

      if (action.icon) {
        const icon = el('span', 'sp-toolbar__icon', button)
        setIcon(icon, action.icon)
      }
      el('span', '', button).textContent = action.label

      button.addEventListener('click', () => {
        if (action.disabled) return
        action.onClick({
          selected: this.ctx.selected(),
          clearSelection: this.ctx.onClear,
        })
      })
    }
  }

  destroy(): void {
    this.root.remove()
  }
}
