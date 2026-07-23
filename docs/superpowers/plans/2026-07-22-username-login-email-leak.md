# Username→Email Leak Fix — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
>
> **Split of responsibility:** Tasks 1–3 are **code an agent writes** (Edge Function, client swap, SQL file — all committed to the repo). Tasks 4–6 are a **manual operator runbook** for the human (Gage): Supabase CLI deploy, Vercel push, dashboard SQL. An agent MUST NOT run Task 4–6 commands — they touch live infrastructure and require the human's Supabase/Vercel session. The agent's job ends at "code committed, ready to deploy."

**Goal:** Stop the username→email enumeration leak by moving username login into a Supabase Edge Function so the email never reaches the client and unknown-username vs. wrong-password are indistinguishable.

**Architecture:** A new Edge Function `login-with-username` takes `{username,password}`, looks up the email server-side (service_role), proxies to Supabase's GoTrue token endpoint, and returns session tokens or a generic 401. The client calls it via `functions.invoke` + `setSession` instead of the old RPC. The old RPC's client grants are revoked last.

**Tech Stack:** Supabase Edge Functions (Deno/TypeScript), Supabase CLI, React (Vite) client, GitHub→Vercel auto-deploy for the client.

## Global Constraints

- **The email must NEVER appear in any client-visible response.** The Edge Function returns session tokens only.
- **All login failures return an identical generic result** — `401 { error: "Invalid username or password" }` — for unknown username, wrong password, or missing fields. No branch reveals which factor was wrong.
- **`service_role` key lives only in the Edge Function's secrets**, never in client code or the repo.
- **`handleRegister` is unchanged** — only the login path changes.
- **Project ref:** `nxgziqsrnwzzcjbzihfk` (from the Supabase URL). Supabase CLI is already installed at `/opt/homebrew/bin/supabase`.
- **Deploy order is load-bearing (Tasks 4→5→6):** deploy the function → push the client → revoke the RPC LAST, so login never breaks mid-rollout.
- `functions.invoke` surfaces a non-2xx (our 401) as `error` with `data: null` — it does NOT put the 401 body in `data`. The client checks `if (error || !data?.access_token)`.
- **The function MUST be deployed with `--no-verify-jwt`** — it is called by logged-out users, so the platform's default JWT gate would reject every login. The function authenticates internally; disabling the gate is correct and does not weaken security.

---

## File structure

**New (committed by the agent, Tasks 1–3):**
- `supabase/functions/login-with-username/index.ts` — the Edge Function.
- `supabase/functions/login-with-username/deno.json` — minimal Deno config (import map), so the function's imports resolve consistently.
- `supabase/revoke_email_rpc.sql` — the grant-revoke migration (pasted in the dashboard at Task 6).

**Modified (Task 2):**
- `src/components/LoginForm.jsx` — `handleLogin` swaps RPC+signInWithPassword for `functions.invoke` + `setSession`.

**Not touched:** `supabase/username_auth.sql` (the function definition stays for rollback; only its grants change, in the new revoke file). Registration, all other tables/RLS.

---

### Task 1: Edge Function `login-with-username`

**Files:**
- Create: `supabase/functions/login-with-username/index.ts`
- Create: `supabase/functions/login-with-username/deno.json`

**Interfaces:**
- Produces: an HTTP endpoint accepting `POST { username: string, password: string }`, returning `200` with a GoTrue session JSON (`{ access_token, refresh_token, ... }`) on success, or `401 { error: "Invalid username or password" }` on any failure. Handles `OPTIONS` preflight with CORS headers.

**Note on testing:** Edge Functions run on Deno, not Node, and this one calls live Supabase services — it cannot be meaningfully unit-tested in this repo's Node harness setup. Verification is (a) a review read-through against the constraints, and (b) the manual smoke test in Task 4/5. This is the same "no unit test by nature" situation as the SQL tasks in earlier plans — flagged explicitly, not a hidden gap.

- [ ] **Step 1: Create the Deno config**

Create `supabase/functions/login-with-username/deno.json`:

```json
{
  "imports": {
    "std/": "https://deno.land/std@0.224.0/",
    "@supabase/supabase-js": "https://esm.sh/@supabase/supabase-js@2"
  }
}
```

- [ ] **Step 2: Write the function**

Create `supabase/functions/login-with-username/index.ts`:

```ts
// Username login without leaking emails (security fix, 2026-07-22).
//
// Takes { username, password }, looks up the email SERVER-SIDE (service_role,
// bypasses RLS), proxies to Supabase's GoTrue token endpoint to verify the
// password + mint a session, and returns ONLY the session tokens. Unknown
// username and wrong password both return an identical generic 401 — no
// existence oracle, no email ever reaches the client.
import { serve } from "std/http/server.ts"
import { createClient } from "@supabase/supabase-js"

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
}
const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, "Content-Type": "application/json" },
  })

const GENERIC = { error: "Invalid username or password" }

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors })
  if (req.method !== "POST") return json(401, GENERIC)

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!
  const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!
  // Supabase reserves the SUPABASE_ prefix for its own injected vars, so the
  // service-role secret is set under a custom name (see Task 4).
  const SERVICE_ROLE_KEY = Deno.env.get("SR_KEY")!

  let username = "", password = ""
  try {
    const body = await req.json()
    username = String(body?.username ?? "")
    password = String(body?.password ?? "")
  } catch {
    return json(401, GENERIC)
  }
  if (!username || !password) return json(401, GENERIC)

  // 1. Email lookup, server-side only. Never returned to the client.
  const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY)
  const { data } = await admin
    .from("profiles")
    .select("email")
    .ilike("username", username)
    .maybeSingle()

  // 2. Verify password + mint session via GoTrue's real token endpoint.
  let session: unknown = null
  if (data?.email) {
    const res = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
      method: "POST",
      headers: { apikey: ANON_KEY, "Content-Type": "application/json" },
      body: JSON.stringify({ email: data.email, password }),
    })
    if (res.ok) session = await res.json()
  }

  // 3. Identical generic failure for unknown-user AND wrong-password.
  if (!session) return json(401, GENERIC)
  return json(200, session) // tokens only — no email
})
```

- [ ] **Step 3: Local syntax check (optional but recommended)**

If Deno is available locally, verify the file parses:

Run: `deno check supabase/functions/login-with-username/index.ts` (from repo root)
Expected: no type errors. (If `deno` isn't installed, skip — the deploy in Task 4 will surface any error. Do NOT install Deno just for this.)

- [ ] **Step 4: Commit**

```bash
git add supabase/functions/login-with-username/
git commit -m "feat(auth): login-with-username Edge Function (no email leak)"
```

---

### Task 2: Client login swap (`src/components/LoginForm.jsx`)

**Files:**
- Modify: `src/components/LoginForm.jsx` — `handleLogin` (lines 21–36).

**Interfaces:**
- Consumes: the `login-with-username` Edge Function (Task 1) via `supabase.functions.invoke`.
- Produces: same external behavior (`onAuthSuccess()` on success, generic error otherwise) — no signature change.

- [ ] **Step 1: Replace `handleLogin`**

In `src/components/LoginForm.jsx`, replace the entire `handleLogin` function (currently lines 21–36) with:

```js
  // Login by username via the login-with-username Edge Function. The email is
  // resolved + the password verified SERVER-SIDE; only session tokens come back
  // (no email ever reaches the client). Any failure is a single generic message.
  async function handleLogin() {
    setAuthError(null)
    if (!username.trim() || !password) { setAuthError('Enter username and password'); return }
    setAuthLoading(true)

    const { data, error } = await supabase.functions.invoke('login-with-username', {
      body: { username: username.trim(), password },
    })

    // functions.invoke surfaces a non-2xx (our 401) as `error` with data: null.
    if (error || !data?.access_token) {
      setAuthLoading(false)
      setAuthError('Invalid username or password')
      return
    }

    // Establish the session from the tokens the function returned.
    const { error: sessErr } = await supabase.auth.setSession({
      access_token: data.access_token,
      refresh_token: data.refresh_token,
    })
    setAuthLoading(false)
    if (sessErr) { setAuthError('Invalid username or password'); return }
    onAuthSuccess?.()
  }
```

- [ ] **Step 2: Confirm the old RPC call is gone**

Run: `grep -n "get_email_for_username\|signInWithPassword" src/components/LoginForm.jsx`
Expected: **no output** (the RPC and the direct signIn are both removed from the client).

- [ ] **Step 3: Build + lint**

```
npm run build   # clean
npm run lint    # no NEW problems vs the 46 pre-existing baseline
```

- [ ] **Step 4: Commit**

```bash
git add src/components/LoginForm.jsx
git commit -m "feat(auth): client login via Edge Function, drop email RPC"
```

---

### Task 3: SQL revoke migration file (`supabase/revoke_email_rpc.sql`)

**Files:**
- Create: `supabase/revoke_email_rpc.sql`

**Interfaces:**
- Produces: an idempotent SQL script (pasted into the dashboard at Task 6) that removes the old RPC's client grants.

- [ ] **Step 1: Write the SQL**

Create `supabase/revoke_email_rpc.sql`:

```sql
-- Close the username→email enumeration leak (security fix, 2026-07-22).
--
-- Login now goes through the login-with-username Edge Function; the email never
-- reaches the client. Revoke the old RPC's client grants so the enumeration
-- oracle is no longer callable from any browser key. The function DEFINITION is
-- kept (in username_auth.sql) for reference/rollback — only its grants change.
--
-- Run in the Supabase SQL editor AFTER the new client is live (see the plan's
-- deploy sequence). Idempotent — safe to re-run.

revoke execute on function public.get_email_for_username(text) from anon;
revoke execute on function public.get_email_for_username(text) from authenticated;

-- Rollback (only if you must restore the old flow):
--   grant execute on function public.get_email_for_username(text) to anon, authenticated;
```

- [ ] **Step 2: Commit**

```bash
git add supabase/revoke_email_rpc.sql
git commit -m "feat(auth): SQL to revoke the email-lookup RPC grants"
```

---

## OPERATOR RUNBOOK (manual — Gage runs these; the agent stops here)

> Tasks 4–6 are **not** agent steps. They deploy live infrastructure and need
> your Supabase/Vercel session. Do them **in this order**. After each, verify
> before moving on. If anything looks wrong, STOP — the rollback is trivial at
> every stage.

### Task 4: Deploy the Edge Function (Supabase CLI)

The CLI is already installed (`/opt/homebrew/bin/supabase`). Run these from the repo root (`/Users/gagejack/Desktop/Speedmon`):

- [ ] **Step 1: Log in to the CLI** (one-time; opens a browser)

```bash
supabase login
```

- [ ] **Step 2: Link this repo to your project** (one-time)

```bash
supabase link --project-ref nxgziqsrnwzzcjbzihfk
```

- [ ] **Step 3: Set the service-role secret**

Get the service_role key from the Supabase dashboard → Project Settings → API → `service_role` `secret` (NOT the anon key). Then:

```bash
supabase secrets set SR_KEY=<paste-the-service_role-key-here>
```

(Named `SR_KEY` because Supabase reserves the `SUPABASE_` prefix — the function reads `Deno.env.get("SR_KEY")`.)

- [ ] **Step 4: Deploy the function — WITH JWT VERIFICATION OFF**

```bash
supabase functions deploy login-with-username --no-verify-jwt
```

Expected: "Deployed Function login-with-username".

**Why `--no-verify-jwt` is REQUIRED here:** by default Supabase's gateway
rejects any Edge Function call that lacks a valid logged-in user JWT — but this
function is called by users who are *not yet logged in* (that's the entire point
of login). Without this flag, a logged-out login attempt is rejected at the
gateway before the function even runs, and login silently fails. Security is not
weakened: the function does its own authentication (it verifies the password via
GoTrue and returns a generic 401 otherwise), so disabling the platform's JWT
gate just lets unauthenticated callers reach it — exactly as intended.

If it reports a syntax/type error, fix `index.ts` and redeploy — nothing is
live-affecting yet (the client still uses the old RPC at this point).

- [ ] **Step 5: Smoke-test the function directly** (still no user impact)

Test unknown-user and (if you know a test account) wrong-password both give the same 401. Replace `<ANON_KEY>` with your anon key (the one already in the client):

```bash
curl -s -i -X POST \
  "https://nxgziqsrnwzzcjbzihfk.supabase.co/functions/v1/login-with-username" \
  -H "apikey: <ANON_KEY>" -H "Content-Type: application/json" \
  -d '{"username":"definitely_not_a_real_user_xyz","password":"whatever"}'
```

Expected: `HTTP/… 401` with body `{"error":"Invalid username or password"}` and **no email anywhere** in the response.

### Task 5: Ship the client (GitHub → Vercel)

- [ ] **Step 1: Push the committed code to GitHub**

The code from Tasks 1–3 is committed locally. Push it:

```bash
git push origin main
```

Vercel auto-deploys the new client. **At this point both login paths work** — new bundle uses the Edge Function, and the old RPC is still granted, so any user on the old cached bundle still logs in too. No breakage.

- [ ] **Step 2: Verify login in production** (after Vercel finishes)

On the live site: log in with a real account → succeeds. Try a wrong password → generic "Invalid username or password". Open the browser Network tab during login and confirm the `login-with-username` response contains **tokens only, no email**.

Do NOT proceed to Task 6 until production login is confirmed working on the new bundle.

### Task 6: Revoke the old RPC (dashboard SQL — do this LAST)

- [ ] **Step 1: Run the revoke SQL**

In the Supabase dashboard → SQL Editor → New query, paste the contents of `supabase/revoke_email_rpc.sql` and run it.

- [ ] **Step 2: Confirm the oracle is closed**

In the live site's browser console (logged in or not), run:

```js
const { data, error } = await window.supabase?.rpc?.('get_email_for_username', { uname: 'anyone' })
```

…or simply confirm via the Network tab that the app no longer calls `get_email_for_username` anywhere. Expected: the RPC now returns a permission error if called; the app's login still works (it uses the Edge Function). The enumeration leak is closed.

- [ ] **Step 3: Done — the leak is fixed.** Email never reaches the client; unknown-user and wrong-password are indistinguishable; the old oracle is uncallable.

---

## Rollback (any stage)

- **After Task 4/5, before 6:** revert the client commit and `git push` — Vercel redeploys the previous bundle. The RPC is still granted, so the old flow works. The Edge Function can stay deployed idle.
- **After Task 6:** re-grant in the SQL editor: `grant execute on function public.get_email_for_username(text) to anon, authenticated;` then revert the client commit and push.

---

## Self-Review

**Spec coverage:**
- Edge Function (email lookup server-side, GoTrue proxy, tokens-only, generic 401) → Task 1 ✅
- Client swap to `functions.invoke` + `setSession`, RPC removed, register untouched → Task 2 ✅
- Revoke old RPC grants → Task 3 (file) + Task 6 (apply) ✅
- Deploy sequencing (function → client → revoke last) with every exact command → Tasks 4–6 ✅
- `functions.invoke` non-2xx-as-error semantics handled → Task 2 Step 1 + Global Constraints ✅
- service_role only in function secrets, never client/repo → Task 4 Step 3 + Global Constraints ✅
- Verification (identical failures, no email on wire, oracle closed) → Task 4 Step 5, Task 5 Step 2, Task 6 Step 2 ✅

**Placeholder scan:** No TBD/TODO. `<ANON_KEY>` / `<paste-the-service_role-key-here>` are intentional human-supplied secrets, not placeholders in code — they're values only the operator has and must never be committed. Task 1's "no unit test by nature" is flagged explicitly, not hidden.

**Type consistency:** The Edge Function reads `SR_KEY` (Task 1) and the operator sets `SR_KEY` (Task 4 Step 3) — names match. The function returns `{ access_token, refresh_token, ... }` and the client reads exactly those fields (Task 2). Endpoint name `login-with-username` is identical across the function dir (Task 1), the client invoke (Task 2), and the deploy/curl commands (Tasks 4–5).

**Agent/operator boundary:** Tasks 1–3 are pure repo code (agent-safe). Tasks 4–6 are explicitly marked human-only and touch no repo files except pasting the already-committed SQL. An agent executing this plan stops after Task 3.
