-- Username login support for PokeLite.
-- Run this once in the Supabase SQL editor (Dashboard → SQL Editor → New query).
--
-- It creates a `profiles` table mapping each auth user to a unique (case-insensitive)
-- username + their signup email, locks it down with RLS, and exposes a single
-- SECURITY DEFINER function that resolves a username → email so the client can
-- look up the email BEFORE signing in (login is by username + password).

-- 1. Profiles table -----------------------------------------------------------
create table if not exists public.profiles (
  id         uuid primary key references auth.users (id) on delete cascade,
  username   text not null,
  email      text not null,
  created_at timestamptz not null default now()
);

-- Case-insensitive uniqueness on username (so "Ash" and "ash" can't both exist).
create unique index if not exists profiles_username_lower_idx
  on public.profiles (lower(username));

-- 2. Row Level Security -------------------------------------------------------
alter table public.profiles enable row level security;

-- A user may insert only their own profile row (id must equal their auth uid).
drop policy if exists "profiles_insert_own" on public.profiles;
create policy "profiles_insert_own"
  on public.profiles for insert
  with check (auth.uid() = id);

-- A user may read only their own row (no open reads of other users' emails).
drop policy if exists "profiles_select_own" on public.profiles;
create policy "profiles_select_own"
  on public.profiles for select
  using (auth.uid() = id);

-- 3. Username → email lookup (callable pre-auth) ------------------------------
-- SECURITY DEFINER so it can read the table despite RLS, but it returns ONLY the
-- single matching email (or null) — it never exposes the rest of the table.
create or replace function public.get_email_for_username(uname text)
returns text
language sql
security definer
set search_path = public
as $$
  select email
  from public.profiles
  where lower(username) = lower(uname)
  limit 1;
$$;

-- Allow anonymous (not-yet-logged-in) and authenticated callers to run it.
grant execute on function public.get_email_for_username(text) to anon, authenticated;

-- 4. Admin role column (run this ALTER if the table already exists) -------------
alter table public.profiles add column if not exists role text not null default 'player';

-- After running the ALTER, promote a user to admin:
-- update public.profiles set role = 'admin' where lower(username) = 'jeblonski';
