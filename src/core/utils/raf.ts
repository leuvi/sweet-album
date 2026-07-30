/**
 * Leading-edge throttle with a trailing call.
 *
 * Used for resize: a full relayout is O(photos), so running it on every frame
 * of a window drag is wasteful. This fires immediately, then at most once per
 * `wait`, and always once more after the drag stops so the final size wins.
 */
export function throttle<T extends (...args: any[]) => void>(
  fn: T,
  wait: number,
): T & { cancel: () => void } {
  let last = 0
  let timer = 0
  let lastArgs: any[] | null = null

  const run = (args: any[]) => {
    last = Date.now()
    lastArgs = null
    fn(...args)
  }

  const wrapped = ((...args: any[]) => {
    const elapsed = Date.now() - last
    lastArgs = args

    if (elapsed >= wait) {
      if (timer) {
        clearTimeout(timer)
        timer = 0
      }
      run(args)
      return
    }

    if (timer) return
    timer = window.setTimeout(() => {
      timer = 0
      if (lastArgs) run(lastArgs)
    }, wait - elapsed)
  }) as T & { cancel: () => void }

  wrapped.cancel = () => {
    if (timer) clearTimeout(timer)
    timer = 0
    lastArgs = null
  }

  return wrapped
}

/** Coalesce repeated calls into at most one per animation frame. */
export function rafThrottle<T extends (...args: any[]) => void>(
  fn: T,
): T & { cancel: () => void } {
  let handle = 0
  let lastArgs: any[] | null = null

  const wrapped = ((...args: any[]) => {
    lastArgs = args
    if (handle) return
    handle = requestAnimationFrame(() => {
      handle = 0
      const a = lastArgs!
      lastArgs = null
      fn(...a)
    })
  }) as T & { cancel: () => void }

  wrapped.cancel = () => {
    if (handle) cancelAnimationFrame(handle)
    handle = 0
    lastArgs = null
  }

  return wrapped
}
