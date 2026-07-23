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
