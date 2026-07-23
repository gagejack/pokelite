# Design — Close the username→email enumeration leak

> Fix for a security finding: `get_email_for_username` is a `SECURITY DEFINER`
> RPC granted to `anon` that returns a real email for any guessed username —
> a free, scriptable account-enumeration + email-harvesting oracle. This design
> moves username login into a Supabase Edge Function so the email never reaches
> the client and unknown-username vs. wrong-password become indistinguishable.

## Problem

Login is by username, but Supabase auth is by email. Today the client bridges
that gap in two steps ([src/components/LoginForm.jsx](../../../src/components/LoginForm.jsx) `handleLogin`):

```
client → rpc get_email_for_username(username)   → returns EMAIL to the client
client → signInWithPassword({ email, password }) → session
```

`get_email_for_username` ([supabase/username_auth.sql](../../../supabase/username_auth.sql)) is
`SECURITY DEFINER`, `set search_path = public`, and `grant execute ... to anon,
authenticated`. So anyone — no login required — can call it for arbitrary
usernames and receive the matching email. That is:

- an **existence oracle** (username exists ⇔ non-null return), and
- **email harvesting** (the return value *is* the email).

The client never actually *uses* the email except to hand it straight to
`signInWithPassword`. The leak exists purely as plumbing.

## Goal (threat model: B — fully close the oracle)

- The email **never** crosses to the client.
- Unknown-username and wrong-password are **indistinguishable by response
  content** (identical generic 401).
- The old RPC is **not client-callable** afterward.
- Timing side-channel is explicitly **out of scope** (accepted): "no such user"
  may return marginally faster than "wrong password." Content is identical; only
  latency differs. Noted as trivial future hardening (a dummy verify call), not
  implemented now — proportionate to a friends'-game threat model.

Non-goals: changing registration (it uses the user's own email, no leak),
changing any other table's RLS, rate-limiting (the oracle is closed at the
source, so bulk probing yields nothing useful).

## Architecture

Replace the two-step client flow with a single call to a new Supabase **Edge
Function** `login-with-username`, a thin username→email translator in front of
Supabase's own token endpoint. A Postgres function cannot mint a GoTrue session,
so an Edge Function (server-side Deno, holds `service_role`) is the only
mechanism that keeps the email server-side while still issuing a session.

**Flow after:**
```
client → POST edge/login-with-username { username, password }
              │  (server-side, in the function:)
              ├─ look up email by username via service_role   (email stays server-side)
              ├─ POST GoTrue /auth/v1/token?grant_type=password { email, password }
              └─ return GoTrue's session verbatim  OR  generic 401
client → supabase.auth.setSession(tokens) → authenticated
```

The function never custom-handles passwords — GoTrue verifies them and mints the
session. The function only translates username→email and normalizes the failure
response.

## Components

### 1. Edge Function `supabase/functions/login-with-username/index.ts` (Deno)

Responsibilities:
1. Parse `{ username, password }`; missing either → generic 401.
2. Look up the email server-side with the **service_role** client
   (`from('profiles').select('email').ilike('username', username).maybeSingle()`).
   `ilike` matches the existing case-insensitive `lower(username)` unique index.
   The email is used only in step 3; never returned.
3. If a user was found, `POST ${SUPABASE_URL}/auth/v1/token?grant_type=password`
   with `{ email, password }` and the **anon** key as `apikey`. On `res.ok`,
   capture the session JSON (`access_token`, `refresh_token`, …).
4. If no session (unknown user OR GoTrue rejected the password) → identical
   `401 { error: "Invalid username or password" }`. On success →
   `200` with the **session tokens only** (no email).

Cross-cutting:
- **CORS:** return CORS headers (allow the site origin; handle the `OPTIONS`
  preflight) so the browser can invoke it.
- **Secrets:** `SERVICE_ROLE_KEY` set via `supabase secrets set` — lives only in
  the function's environment, never in client code. `SUPABASE_URL` / anon key
  are non-secret (anon key already ships in the client).

Sketch:

```ts
import { serve } from "https://deno.land/std/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
}
const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } })

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors })
  const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!
  const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!
  const SERVICE_ROLE_KEY = Deno.env.get("SERVICE_ROLE_KEY")!

  let username = "", password = ""
  try { ({ username, password } = await req.json()) } catch { /* fall through */ }
  if (!username || !password) return json(401, { error: "Invalid username or password" })

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY)
  const { data } = await admin
    .from("profiles").select("email").ilike("username", username).maybeSingle()

  let session: unknown = null
  if (data?.email) {
    const res = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
      method: "POST",
      headers: { apikey: ANON_KEY, "Content-Type": "application/json" },
      body: JSON.stringify({ email: data.email, password }),
    })
    if (res.ok) session = await res.json()
  }

  if (!session) return json(401, { error: "Invalid username or password" })
  return json(200, session)
})
```

> Note: Supabase injects `SUPABASE_URL` / `SUPABASE_ANON_KEY` into Edge Functions
> automatically; only `SERVICE_ROLE_KEY` needs `supabase secrets set`. (If the
> platform reserves the `SUPABASE_` secret prefix, name the custom one e.g.
> `SR_KEY` — resolve at implementation time by checking `supabase secrets list`.)

### 2. Client `src/components/LoginForm.jsx`

`handleLogin` becomes a single invoke + `setSession`; the RPC call is removed:

```js
async function handleLogin() {
  setAuthError(null)
  if (!username.trim() || !password) { setAuthError('Enter username and password'); return }
  setAuthLoading(true)

  const { data, error } = await supabase.functions.invoke('login-with-username', {
    body: { username: username.trim(), password },
  })
  setAuthLoading(false)

  if (error || !data?.access_token) { setAuthError('Invalid username or password'); return }

  const { error: sessErr } = await supabase.auth.setSession({
    access_token: data.access_token,
    refresh_token: data.refresh_token,
  })
  if (sessErr) { setAuthError('Invalid username or password'); return }
  onAuthSuccess?.()
}
```

- `setSession` installs the tokens; the existing `onAuthStateChange` listeners in
  MainMenu/App fire normally, so the rest of the app sees a login as before.
- **`handleRegister` is unchanged** (uses the user's own email; no leak).
- **`functions.invoke` semantics (verified):** a non-2xx status (our 401) is
  surfaced as `error` (a `FunctionsHttpError`) with `data: null` — it does *not*
  put the 401 body in `data`. So `if (error || !data?.access_token)` correctly
  catches every failure; the client must not try to read a body off the error.
  Only a 200 populates `data` with the session tokens.

### 3. SQL `supabase/revoke_email_rpc.sql`

```sql
-- Login now goes through the login-with-username Edge Function; the email never
-- reaches the client. Make the old oracle uncallable from any client key.
revoke execute on function public.get_email_for_username(text) from anon, authenticated;
-- Function kept for reference/rollback; only its client grants are removed.
```

## Data flow

- **Success:** username+password → function → email lookup (server) → GoTrue
  token endpoint → session tokens → client `setSession` → authenticated. Email
  stays server-side throughout.
- **Unknown username:** lookup returns null → skip token call → generic 401.
- **Wrong password:** lookup returns email → GoTrue rejects → generic 401.
  (Identical body to the unknown-username case.)

## Error handling

- All failure paths (missing fields, unknown user, wrong password, malformed
  body) return the same `401 { error: "Invalid username or password" }`.
- Client shows a single generic message for any failure — no branch reveals
  which factor was wrong.
- Network payloads never contain an email on any path.

## Testing / verification

1. **Happy path:** valid username+password logs in; session persists; resume/menu
   work as before.
2. **Wrong password:** generic error; response body has no email.
3. **Unknown username:** *identical* generic error and status; no email.
4. **Oracle closed:** calling `get_email_for_username` from the browser console
   returns a permission error (grant revoked).
5. **No email on the wire:** inspect the Network tab across all three login
   outcomes — confirm no email field in any response.
6. **Register unaffected:** new account creation still works.

## Deploy steps (operator)

1. `supabase functions deploy login-with-username`
2. `supabase secrets set SERVICE_ROLE_KEY=<service_role key>` (from project settings)
3. Run `supabase/revoke_email_rpc.sql` in the SQL editor.
4. Ship the client change.

(Order matters: deploy the function and revoke *after* the client is ready to
call the function, or do the revoke last so login isn't briefly broken. The
implementation plan will sequence this.)

## Rollback

Re-grant the RPC (`grant execute on function public.get_email_for_username(text)
to anon, authenticated;`) and revert the client `handleLogin` — the old flow is
restored. The Edge Function can be left deployed (idle) or deleted.
