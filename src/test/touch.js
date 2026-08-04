import { vi } from 'vitest'

// jsdom implements neither Touch nor TouchEvent. The handlers under test only
// ever read identifier/clientX/clientY off a touch, and touches/changedTouches
// off an event, so plain objects with those fields are a faithful stand-in.

/** One synthetic touch point. */
export function makeTouch({ identifier = 0, clientX = 0, clientY = 0 } = {}) {
  return { identifier, clientX, clientY }
}

/**
 * A synthetic touch event. `preventDefault` is a spy, so a test can assert
 * scrolling was suppressed via `event.preventDefault.mock.calls.length`.
 *
 * `changedTouches` defaults to `touches`, which matches touchstart/touchmove;
 * a touchend passes the lifted points explicitly with `touches` empty.
 */
export function touchEvent(touches, changedTouches = touches) {
  return { touches, changedTouches, preventDefault: vi.fn() }
}
