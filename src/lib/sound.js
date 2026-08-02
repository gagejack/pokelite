// Sound effects.
//
// Vite resolves these imports to hashed asset URLs at build time, so adding a
// sound is: drop the file in src/assets/sounds, add a line to SOUNDS, call
// playSound('name').
//
// Every play is fire-and-forget and never throws. Browsers reject play() until
// the page has seen a user gesture, and reject it again if the tab is
// backgrounded — neither is an error worth surfacing in a game, so the promise
// rejection is swallowed. A missing key is a no-op for the same reason: a
// silent effect should never take a battle screen down with it.

import levelup from '../assets/sounds/levelup.wav'

const SOUNDS = {
  levelup,
}

// Per-key cache. Reusing one Audio element per sound keeps repeated plays from
// allocating a new decoder each time; rewinding to 0 lets a sound retrigger
// before its previous play has finished.
const cache = new Map()

const MUTE_KEY = 'muted'

export function isMuted() {
  try { return localStorage.getItem(MUTE_KEY) === 'true' } catch { return false }
}

export function setMuted(v) {
  try { localStorage.setItem(MUTE_KEY, v ? 'true' : 'false') } catch { /* storage blocked */ }
}

/**
 * Play a sound effect by name.
 * @param {keyof typeof SOUNDS} name
 * @param {{ volume?: number }} [opts] volume 0–1, default 0.6
 */
export function playSound(name, { volume = 0.6 } = {}) {
  const src = SOUNDS[name]
  if (!src || isMuted()) return

  try {
    let audio = cache.get(name)
    if (!audio) {
      audio = new Audio(src)
      audio.preload = 'auto'
      cache.set(name, audio)
    }
    audio.volume = Math.min(1, Math.max(0, volume))
    audio.currentTime = 0
    // play() returns a promise that rejects on autoplay policy or an
    // interrupted load. Both are expected; neither should reach the console.
    audio.play?.().catch(() => {})
  } catch {
    /* Audio unavailable (SSR, locked-down browser) — stay silent. */
  }
}
