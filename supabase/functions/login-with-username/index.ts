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
  // supabase-js's functions.invoke() adds x-client-info (and may add other
  // x-supabase-* headers), so they must be allowed or the browser's CORS
  // preflight blocks the request (curl skips preflight, which is why it worked).
  "Access-Control-Allow-Headers":
    "authorization, apikey, content-type, x-client-info, x-supabase-api-version",
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
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let session: any = null
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

  // Return ONLY the token fields. GoTrue's raw session embeds a `user` object
  // (including the caller's own email); stripping it keeps the response body
  // tokens-only. (The access_token JWT still carries the standard email claim —
  // unavoidable for any Supabase login — but no email sits in plain JSON.)
  const { access_token, refresh_token, expires_in, expires_at, token_type } = session
  return json(200, { access_token, refresh_token, expires_in, expires_at, token_type })
})
