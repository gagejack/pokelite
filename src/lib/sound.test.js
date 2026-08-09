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
    return Promise.resolve()
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

describe('playSoundUrl restart rate cap', () => {
  it('plays the first call for a url', async () => {
    const { playSoundUrl } = await import('./sound.js')
    playSoundUrl('/sfx/Thunderbolt.m4a')
    expect(created).toHaveLength(1)
    expect(created[0].playCount).toBe(1)
  })

  it('ignores a repeat of the same clip inside the cap window', async () => {
    const { playSoundUrl } = await import('./sound.js')
    playSoundUrl('/sfx/Thunderbolt.m4a')
    vi.advanceTimersByTime(50)
    playSoundUrl('/sfx/Thunderbolt.m4a')

    // Second call must not restart the clip: one play, one initial rewind.
    expect(created[0].playCount).toBe(1)
    expect(created[0].rewinds).toEqual([0])
  })

  it('replays the same clip once the cap window has passed', async () => {
    const { playSoundUrl } = await import('./sound.js')
    playSoundUrl('/sfx/Thunderbolt.m4a')
    vi.advanceTimersByTime(200)
    playSoundUrl('/sfx/Thunderbolt.m4a')

    expect(created[0].playCount).toBe(2)
    expect(created[0].rewinds).toEqual([0, 0])
  })

  it('does not let one clip suppress a different clip', async () => {
    const { playSoundUrl } = await import('./sound.js')
    playSoundUrl('/sfx/Thunderbolt.m4a')
    vi.advanceTimersByTime(10)
    playSoundUrl('/sfx/Ember.m4a')

    expect(created).toHaveLength(2)
    expect(created[1].playCount).toBe(1)
  })

  it('stays silent when muted', async () => {
    localStorage.setItem('muted', 'true')
    const { playSoundUrl } = await import('./sound.js')
    playSoundUrl('/sfx/Thunderbolt.m4a')
    expect(created).toHaveLength(0)
  })
})
