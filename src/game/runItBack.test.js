import { test, expect } from 'vitest'
import { shouldCaptureSnapshot, isRunItBackAvailable, shouldRecordPayout } from './runItBack.js'

// ── shouldCaptureSnapshot ────────────────────────────────────────────────

test('does not capture when the item is not owned', () => {
  expect(shouldCaptureSnapshot({
    ownsRunItBack: false, alreadyUsedThisRun: false, snapshotMapIndex: null, currentMapIndex: 0,
  })).toBe(false)
})

test('does not capture when this run already used its one offer', () => {
  expect(shouldCaptureSnapshot({
    ownsRunItBack: true, alreadyUsedThisRun: true, snapshotMapIndex: null, currentMapIndex: 2,
  })).toBe(false)
})

test('captures on the first call for a fresh map (no snapshot yet)', () => {
  expect(shouldCaptureSnapshot({
    ownsRunItBack: true, alreadyUsedThisRun: false, snapshotMapIndex: null, currentMapIndex: 0,
  })).toBe(true)
})

test('does NOT re-capture on a later node-clear within the SAME map', () => {
  // snapshotMapIndex already equals currentMapIndex — a node was cleared
  // since the map-start capture, but onProgressChange fired again.
  expect(shouldCaptureSnapshot({
    ownsRunItBack: true, alreadyUsedThisRun: false, snapshotMapIndex: 3, currentMapIndex: 3,
  })).toBe(false)
})

test('captures again once a NEW map starts (mapIndex advanced)', () => {
  expect(shouldCaptureSnapshot({
    ownsRunItBack: true, alreadyUsedThisRun: false, snapshotMapIndex: 3, currentMapIndex: 4,
  })).toBe(true)
})

// ── isRunItBackAvailable ─────────────────────────────────────────────────

test('not available with no snapshot', () => {
  expect(isRunItBackAvailable({ hasSnapshot: false, alreadyUsedThisRun: false })).toBe(false)
})

test('not available once already used, even if a snapshot is (stale-)present', () => {
  expect(isRunItBackAvailable({ hasSnapshot: true, alreadyUsedThisRun: true })).toBe(false)
})

test('available with a snapshot and no prior use this run', () => {
  expect(isRunItBackAvailable({ hasSnapshot: true, alreadyUsedThisRun: false })).toBe(true)
})

// ── shouldRecordPayout: the double-pay guard ────────────────────────────

test('a fresh loss (guard not yet set) should pay', () => {
  expect(shouldRecordPayout('loss', false)).toBe(true)
})

test('a fresh win (guard not yet set) should pay', () => {
  expect(shouldRecordPayout('win', false)).toBe(true)
})

test('a loss that already paid (guard set) must NOT pay again', () => {
  expect(shouldRecordPayout('loss', true)).toBe(false)
})

test('run_it_back never pays, regardless of the guard — restoring is not a payout event', () => {
  expect(shouldRecordPayout('run_it_back', false)).toBe(false)
  expect(shouldRecordPayout('run_it_back', true)).toBe(false)
})

test('the full sequence: loss pays once, Run It Back re-arms nothing itself, the REPLAY\'s own outcome pays again', () => {
  let guard = false

  // 1. Player loses. Guard was false, so this pays — matches App.jsx setting
  //    runEnded.current = true immediately after.
  expect(shouldRecordPayout('loss', guard)).toBe(true)
  guard = true

  // 2. Player clicks Run It Back. This is never a payout trigger by itself...
  expect(shouldRecordPayout('run_it_back', guard)).toBe(false)
  // ...but restoring re-arms the guard for the replay's own eventual outcome
  // (App.jsx's runItBack() sets runEnded.current = false).
  guard = false

  // 3. The replay ends (say, in another loss). Guard is armed again, so THIS
  //    outcome pays — a new, distinct loss, not a second payment for step 1.
  expect(shouldRecordPayout('loss', guard)).toBe(true)
})
