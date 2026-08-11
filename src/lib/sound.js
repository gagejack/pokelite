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

// Minimum gap between two plays of the SAME clip. Only a guard against
// StrictMode-style double-fires (same effect body running twice in one commit);
// real attack cadence is always longer and is handled by the channel below.
const SAME_CLIP_GUARD_MS = 120

// Last play time per URL, for the guard above.
const lastPlayedAt = new Map()

// The single move-SFX channel. Attacks alternate in a battle, so a new attack
// always replaces whatever clip is still ringing from the previous one.
let activeMoveAudio = null

// In-flight fade-outs, element → intervalId. Cancelled if the same element is
// retriggered before its fade completes (same-move back-to-back attacks).
const fades = new Map()

const FADE_MS = 80
const FADE_STEP_MS = 16

function cancelFade(audio) {
  const id = fades.get(audio)
  if (id !== undefined) {
    clearInterval(id)
    fades.delete(audio)
  }
}

// Ramp a playing clip to silence over ~80ms, then stop and rewind it. A hard
// pause() mid-waveform clicks; the fade is short enough to read as an
// interrupt, not a fade-out. A no-op for clips that already stopped.
function fadeOutAndStop(audio) {
  cancelFade(audio)
  if (audio.paused || audio.ended) {
    try { audio.currentTime = 0 } catch { /* not loaded yet */ }
    if (activeMoveAudio === audio) activeMoveAudio = null
    return
  }
  const startVolume = audio.volume
  const steps = Math.max(1, Math.round(FADE_MS / FADE_STEP_MS))
  let step = 0
  const id = setInterval(() => {
    step += 1
    if (step >= steps) {
      clearInterval(id)
      fades.delete(audio)
      audio.pause()
      try { audio.currentTime = 0 } catch { /* not loaded yet */ }
      if (activeMoveAudio === audio) activeMoveAudio = null
    } else {
      audio.volume = startVolume * (1 - step / steps)
    }
  }, FADE_STEP_MS)
  fades.set(audio, id)
}

/**
 * Stop whatever move SFX is currently ringing, with the same short fade used
 * between attacks. Called when the battle UI drops so a long clip doesn't
 * trail into the next screen.
 */
export function stopMoveSfx() {
  if (activeMoveAudio) fadeOutAndStop(activeMoveAudio)
}

/**
 * Play a sound by resolved URL. For callers that already hold a bundled asset
 * URL (move SFX) rather than a key in the SOUNDS registry.
 *
 * Mono channel: one clip rings at a time. A new play fades out and stops the
 * previous clip, then starts the new one from 0 — even for the same URL (a new
 * attack deserves a new sound). The only suppression is a repeat of the same
 * URL within SAME_CLIP_GUARD_MS, which catches effect double-fires. Distinct
 * URLs never share the guard.
 *
 * @param {string} url
 * @param {{ volume?: number }} [opts] volume 0–1, default 0.6
 */
export function playSoundUrl(url, { volume = getVolume() } = {}) {
  if (!url || isMuted()) return

  try {
    const now = Date.now()
    const last = lastPlayedAt.get(url)
    if (last !== undefined && now - last < SAME_CLIP_GUARD_MS) return
    lastPlayedAt.set(url, now)

    // New attack kills whatever is still ringing from the last one.
    if (activeMoveAudio) fadeOutAndStop(activeMoveAudio)

    let audio = cache.get(url)
    if (!audio) {
      audio = new Audio(url)
      audio.preload = 'auto'
      cache.set(url, audio)
    }
    cancelFade(audio)
    audio.volume = Math.min(1, Math.max(0, volume))
    audio.currentTime = 0
    audio.play?.().catch(() => {})
    activeMoveAudio = audio
  } catch {
    /* Audio unavailable (SSR, locked-down browser) — stay silent. */
  }
}
