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
const VOLUME_KEY = 'volume'
const DEFAULT_VOLUME = 0.6

export function isMuted() {
  try { return localStorage.getItem(MUTE_KEY) === 'true' } catch { return false }
}

export function setMuted(v) {
  try { localStorage.setItem(MUTE_KEY, v ? 'true' : 'false') } catch { /* storage blocked */ }
}

export function getVolume() {
  try {
    const v = parseFloat(localStorage.getItem(VOLUME_KEY))
    return isNaN(v) ? DEFAULT_VOLUME : Math.min(1, Math.max(0, v))
  } catch { return DEFAULT_VOLUME }
}

export function setVolume(v) {
  try { localStorage.setItem(VOLUME_KEY, v) } catch { /* storage blocked */ }
}

/**
 * Play a sound effect by name.
 * @param {keyof typeof SOUNDS} name
 * @param {{ volume?: number }} [opts] volume 0–1, default 0.6
 */
export function playSound(name, { volume = getVolume() } = {}) {
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

// Minimum gap between two plays of the SAME clip. A Pokémon keeps one move for
// a whole battle, so consecutive attacks resolve to the same URL — and the
// cache below holds one Audio element per URL. Without this floor, each attack
// rewinds a clip that is still playing, so a long sound (Thunderbolt is 2.7s,
// against a 750ms gap between attacks at 1x) never gets past its opening
// transient and the battle turns into a stutter. Below the floor the repeat is
// dropped rather than restarted: re-attacking the same instant is better
// represented by one clean sound than by a chopped one.
const MIN_REPLAY_GAP_MS = 120

// Last play time per URL, for the gap check above.
const lastPlayedAt = new Map()

/**
 * Play a sound by resolved URL. For callers that already hold a bundled asset
 * URL (move SFX) rather than a key in the SOUNDS registry.
 *
 * Shares the same cache as playSound, keyed by URL. A repeat of the same clip
 * within MIN_REPLAY_GAP_MS is ignored so the clip can ring out; a repeat after
 * that rewinds and plays again. Distinct URLs never suppress each other.
 *
 * @param {string} url
 * @param {{ volume?: number }} [opts] volume 0–1, default 0.6
 */
export function playSoundUrl(url, { volume = getVolume() } = {}) {
  if (!url || isMuted()) return

  try {
    const now = Date.now()
    const last = lastPlayedAt.get(url)
    if (last !== undefined && now - last < MIN_REPLAY_GAP_MS) return
    lastPlayedAt.set(url, now)

    let audio = cache.get(url)
    if (!audio) {
      audio = new Audio(url)
      audio.preload = 'auto'
      cache.set(url, audio)
    }
    audio.volume = Math.min(1, Math.max(0, volume))
    audio.currentTime = 0
    audio.play?.().catch(() => {})
  } catch {
    /* Audio unavailable (SSR, locked-down browser) — stay silent. */
  }
}
