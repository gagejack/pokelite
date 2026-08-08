-- Admin-tunable shop prices for Speedmon's meta progression shop (Balance
-- Dashboard "Shop" tab).
--
-- Every metacash upgrade, key item, and sprite tier price in
-- src/game/metaCatalog.js has a matching (optional) override row here:
--   item_id — a metaCatalog.js catalog item id (e.g. 'quick_heal',
--             'extra_slot') OR a sprite tier id ('common' | 'uncommon' |
--             'elite' | 'champion').
--   price   — the override price, in the item's own currency (metacash
--             dollars or keys — see metaCatalog.js's `currency` field per
--             item; this table does not duplicate that field, it only
--             overrides the number).
--
-- Values are shared: every player reads them (a shop price is part of what
-- the game looks like), only admins can write. metaCatalog.js's own values
-- remain the fallback when a row is missing or the fetch fails, so the shop
-- always shows a sane price. Same shape and same reasoning as
-- region_balance.sql — see that file for the full rationale; this one only
-- differs in the write side needing INSERT+UPDATE via upsert (region_balance
-- does too — both already have insert+update admin policies) and having no
-- seed data, since "no row" already means "use the catalog default," so
-- there is nothing to seed.
--
-- Run once in the Supabase SQL editor (Dashboard → SQL Editor → New query).
-- Idempotent — safe to re-run.

-- 1. Table --------------------------------------------------------------------
create table if not exists public.meta_shop_prices (
  item_id    text        primary key,
  price      int         not null,
  updated_at timestamptz not null default now(),
  updated_by uuid        references auth.users (id) on delete set null
);

-- Keep prices non-negative and below a sane ceiling so a fat-fingered admin
-- edit can't produce a negative price (which would mean the shop pays the
-- player) or an absurdly large one that reads as broken. $0 is allowed on
-- purpose — an admin may legitimately want to run a free promo on an item.
alter table public.meta_shop_prices
  drop constraint if exists meta_shop_prices_range;
alter table public.meta_shop_prices
  add constraint meta_shop_prices_range check (
    price >= 0 and price <= 1000000
  );

-- No seed data: an absent row already means "use the metaCatalog.js
-- default," so there is nothing to seed on first run.

-- 2. Row Level Security -------------------------------------------------------
alter table public.meta_shop_prices enable row level security;

-- Everyone (including anonymous players) may READ prices — every player's
-- shop must show the tuned price, not just admins'.
drop policy if exists "meta_shop_prices_select_all" on public.meta_shop_prices;
create policy "meta_shop_prices_select_all"
  on public.meta_shop_prices for select
  using (true);

-- Only admins may WRITE. Mirrors the role check the client uses to show the
-- balance dashboard, but enforced server-side — the client-side gate only
-- hides the UI, it is not a security boundary.
drop policy if exists "meta_shop_prices_update_admin" on public.meta_shop_prices;
create policy "meta_shop_prices_update_admin"
  on public.meta_shop_prices for update
  using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.role = 'admin'
    )
  );

drop policy if exists "meta_shop_prices_insert_admin" on public.meta_shop_prices;
create policy "meta_shop_prices_insert_admin"
  on public.meta_shop_prices for insert
  with check (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.role = 'admin'
    )
  );
