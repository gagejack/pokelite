// Persistence for a single in-progress run (the "Resume Run" feature).
//
// A saved run is captured when the player hits Home mid-run and holds
// everything needed to drop them back exactly where they were: region, starter,
// character, roster, bag, which map they're on, the run-stat counters, and the
// CURRENT map's generated layout + node progress (so the same map with the same
// cleared nodes is restored, not a freshly generated one).
//
// Storage: the logged-in user's Supabase account (row per user, upsert) so a run
// follows them across devices; logged-out players fall back to browser
// localStorage so it survives closing the tab on that device.
//
//   Expected Supabase schema:
//     table saved_runs (
//       user_id uuid primary key references auth.users,
//       run jsonb not null,
//       updated_at timestamptz default now()
//     )
//     -- RLS: user can select/insert/update/delete where user_id = auth.uid()

import { supabase } from './supabase'

const LOCAL_KEY = 'speedmon.savedRun'

// Save (or overwrite) the current saved run. `user` may be null (→ localStorage).
export async function saveRun(run, user) {
  if (user) {
    const { error } = await supabase
      .from('saved_runs')
      .upsert({ user_id: user.id, run, updated_at: new Date().toISOString() })
    if (error) {
      console.warn('saveRun (supabase) failed, falling back to localStorage:', error.message)
      writeLocal(run)
    }
    return
  }
  writeLocal(run)
}

// Load the saved run, or null if there isn't one. Logged-in users read their
// account; logged-out users read localStorage.
export async function loadRun(user) {
  if (user) {
    const { data, error } = await supabase
      .from('saved_runs')
      .select('run')
      .eq('user_id', user.id)
      .maybeSingle()
    if (error) {
      console.warn('loadRun (supabase) failed, falling back to localStorage:', error.message)
      return readLocal()
    }
    return data?.run ?? null
  }
  return readLocal()
}

// Clear the saved run (on resume, new run, restart, or run end). Clears BOTH
// stores so a stale copy can't linger across a login/logout.
export async function clearRun(user) {
  writeLocal(null)
  if (user) {
    const { error } = await supabase.from('saved_runs').delete().eq('user_id', user.id)
    if (error) console.warn('clearRun (supabase) failed:', error.message)
  }
}

function writeLocal(run) {
  try {
    if (run == null) localStorage.removeItem(LOCAL_KEY)
    else localStorage.setItem(LOCAL_KEY, JSON.stringify(run))
  } catch (e) {
    console.warn('writeLocal failed:', e)
  }
}

function readLocal() {
  try {
    const raw = localStorage.getItem(LOCAL_KEY)
    return raw ? JSON.parse(raw) : null
  } catch (e) {
    console.warn('readLocal failed:', e)
    return null
  }
}
