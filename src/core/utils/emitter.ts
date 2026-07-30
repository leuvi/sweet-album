import type { EventHandler, EventName, SweetAlbumEvents } from '../types'

/** Minimal typed event bus. */
export class Emitter {
  private map = new Map<string, Set<(...args: any[]) => void>>()

  on<E extends EventName>(event: E, handler: EventHandler<E>): () => void {
    let set = this.map.get(event)
    if (!set) this.map.set(event, (set = new Set()))
    set.add(handler as any)
    return () => this.off(event, handler)
  }

  off<E extends EventName>(event: E, handler?: EventHandler<E>): void {
    if (!handler) {
      this.map.delete(event)
      return
    }
    this.map.get(event)?.delete(handler as any)
  }

  emit<E extends EventName>(event: E, ...args: SweetAlbumEvents[E]): void {
    const set = this.map.get(event)
    if (!set) return
    // Copy so handlers may unsubscribe while we iterate.
    for (const fn of [...set]) {
      try {
        fn(...args)
      } catch (err) {
        if (event !== 'error') {
          this.emit('error', err instanceof Error ? err : new Error(String(err)))
        }
      }
    }
  }

  clear(): void {
    this.map.clear()
  }
}
