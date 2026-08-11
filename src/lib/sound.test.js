import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// A minimal stand-in for HTMLAudioElement. Records every rewind so a test can
// tell "the clip restarted" apart from "the call was ignored".
class FakeAudio {
  constructor(src) {
    this.src = src
    this.volume = 1
    this.preload = ''
    this._currentTime = 0
    this.playCount = 0
    this.rewinds = []
    this.paused = true
    this.ended = false
  }
  set currentTime(v) {
    this._currentTime = v
    this.rewinds.push(v)
  }
  get currentTime() {
    return this._currentTime
  }
  play() {
    this.playCount += 1
    this.paused = false
    this.ended = false
    return Promise.resolve()
  }
  pause() {
    this.paused = true
  }
}

let created
let store

beforeEach(async () => {
  created = []
  vi.stubGlobal('Audio', class extends FakeAudio {
    constructor(src) {
      super(src)
      created.push(this)
    }
  })
  // This runner has no localStorage; sound.js reads mute/volume from it.
  store = new Map()
  vi.stubGlobal('localStorage', {
    getItem: k => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => store.set(k, String(v)),
    removeItem: k => store.delete(k),
    clear: () => store.clear(),
  })
  vi.useFakeTimers()
  // Fresh module per test: playSoundUrl's cache and rate-limit state are
  // module-level, so they must not leak between cases.
  vi.resetModules()
})

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

describe('playSoundUrl mono move channel', () => {
  it('plays the first call for a url', async () => {
    const { playSoundUrl } = await import('./sound.js')
    playSoundUrl('/sfx/Thunderbolt.m4a')
    expect(created).toHaveLength(1)
    expect(created[0].playCount).toBe(1)
  })

  it('drops a repeat of the same clip inside the guard window', async () => {
    const { playSoundUrl } = await import('./sound.js')
    playSoundUrl('/sfx/Thunderbolt.m4a')
    vi.advanceTimersByTime(50)
    playSoundUrl('/sfx/Thunderbolt.m4a')

    // Second call must not restart the clip: one play, one initial rewind.
    expect(created[0].playCount).toBe(1)
    expect(created[0].rewinds).toEqual([0])
  })

  it('fades out and stops the previous clip when a new one starts', async () => {
    const { playSoundUrl } = await import('./sound.js')
    playSoundUrl('/sfx/Thunderbolt.m4a')
    vi.advanceTimersByTime(200)
    playSoundUrl('/sfx/Ember.m4a')

    const thunderbolt = created[0]
    const ember = created[1]
    expect(ember.playCount).toBe(1)
    expect(thunderbolt.paused).toBe(false) // fading, not yet stopped

    // 80ms fade at 16ms steps: after 100ms the old clip is stopped + rewound.
    vi.advanceTimersByTime(100)
    expect(thunderbolt.paused).toBe(true)
    expect(thunderbolt.currentTime).toBe(0)
    expect(ember.paused).toBe(false) // new clip survives the old one's fade
  })

  it('restarts the same clip after the guard window', async () => {
    const { playSoundUrl } = await import('./sound.js')
    playSoundUrl('/sfx/Thunderbolt.m4a')
    vi.advanceTimersByTime(200)
    playSoundUrl('/sfx/Thunderbolt.m4a')

    expect(created[0].playCount).toBe(2)
    expect(created[0].rewinds).toEqual([0, 0])
  })

  it('a retrigger mid-fade cancels the fade and restores volume', async () => {
    const { playSoundUrl } = await import('./sound.js')
    playSoundUrl('/sfx/Thunderbolt.m4a')
    vi.advanceTimersByTime(200)
    playSoundUrl('/sfx/Ember.m4a') // Thunderbolt now fading (80ms)

    const thunderbolt = created[0]
    const ember = created[1]
    vi.advanceTimersByTime(48) // 3 of 5 fade steps — volume dipped, not stopped
    expect(thunderbolt.volume).toBeLessThan(0.6)
    expect(thunderbolt.paused).toBe(false)

    // Thunderbolt's user attacks again before its fade completes.
    vi.advanceTimersByTime(160) // past the guard window since Thunderbolt's play
    playSoundUrl('/sfx/Thunderbolt.m4a')

    expect(thunderbolt.playCount).toBe(2)
    expect(thunderbolt.volume).toBe(0.6) // reset for the new play
    vi.advanceTimersByTime(200) // Ember's fade runs to completion
    expect(thunderbolt.paused).toBe(false) // cancelled fade never stopped it
    expect(ember.paused).toBe(true)
  })

  it('stopMoveSfx fades out and stops the ringing clip', async () => {
    const { playSoundUrl, stopMoveSfx } = await import('./sound.js')
    playSoundUrl('/sfx/Thunderbolt.m4a')
    stopMoveSfx()
    expect(created[0].paused).toBe(false) // fading first
    vi.advanceTimersByTime(100)
    expect(created[0].paused).toBe(true)
    expect(created[0].currentTime).toBe(0)
  })

  it('stopMoveSfx with nothing playing is a no-op', async () => {
    const { stopMoveSfx } = await import('./sound.js')
    expect(() => stopMoveSfx()).not.toThrow()
  })

  it('stays silent when muted', async () => {
    localStorage.setItem('muted', 'true')
    const { playSoundUrl } = await import('./sound.js')
    playSoundUrl('/sfx/Thunderbolt.m4a')
    expect(created).toHaveLength(0)
  })
})
