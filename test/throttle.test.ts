import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { throttle } from '../src/core/utils/raf'

describe('throttle', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    // Node has no `window`; the util schedules through window.setTimeout.
    vi.stubGlobal('window', globalThis)
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllGlobals()
  })

  it('runs immediately on the first call', () => {
    const fn = vi.fn()
    throttle(fn, 100)('a')
    expect(fn).toHaveBeenCalledTimes(1)
    expect(fn).toHaveBeenCalledWith('a')
  })

  it('collapses a burst into one leading and one trailing call', () => {
    const fn = vi.fn()
    const wrapped = throttle(fn, 100)

    // 30 resize events across 60ms — what a window drag looks like.
    for (let i = 0; i < 30; i++) {
      wrapped(i)
      vi.advanceTimersByTime(2)
    }
    expect(fn).toHaveBeenCalledTimes(1)

    vi.advanceTimersByTime(200)
    expect(fn).toHaveBeenCalledTimes(2)
    // The trailing call must carry the *final* size, not a stale one.
    expect(fn).toHaveBeenLastCalledWith(29)
  })

  it('keeps firing at most once per window during a sustained drag', () => {
    const fn = vi.fn()
    const wrapped = throttle(fn, 100)

    for (let i = 0; i < 100; i++) {
      wrapped(i)
      vi.advanceTimersByTime(10) // 100 events over 1s
    }
    vi.advanceTimersByTime(200)

    // ~1s at one per 100ms — an order of magnitude below the 100 events in.
    expect(fn.mock.calls.length).toBeLessThanOrEqual(12)
    expect(fn.mock.calls.length).toBeGreaterThanOrEqual(9)
  })

  it('runs immediately again once the window has elapsed', () => {
    const fn = vi.fn()
    const wrapped = throttle(fn, 100)

    wrapped(1)
    vi.advanceTimersByTime(150)
    wrapped(2)
    expect(fn).toHaveBeenCalledTimes(2)
    expect(fn).toHaveBeenLastCalledWith(2)
  })

  it('cancel drops the pending trailing call', () => {
    const fn = vi.fn()
    const wrapped = throttle(fn, 100)

    wrapped(1)
    wrapped(2)
    wrapped.cancel()
    vi.advanceTimersByTime(500)

    expect(fn).toHaveBeenCalledTimes(1)
  })
})
