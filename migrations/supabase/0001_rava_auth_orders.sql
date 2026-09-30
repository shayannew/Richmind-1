-- ============================================================================
-- RAVA V120 — Supabase schema + RLS
-- Run once in Supabase Dashboard → SQL Editor. Safe to re-run (idempotent).
--
-- Architecture note: the Node server uses the service-role key server-side to
-- mirror users/orders and call admin APIs. Supabase Auth is the identity
-- source (email+password, Google OAuth, verification + recovery emails via the
-- project's Resend SMTP). Row Level Security below makes sure a signed-in user
-- can only ever read their own mirrored data — nothing is world-readable.
-- ============================================================================

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------------
-- Mirror of app customers (email is unique; id matches auth.users.id when the
-- account came from Supabase Auth, otherwise a local id).
-- ---------------------------------------------------------------------------
create table if not exists public.users (
  id            uuid primary key default gen_random_uuid(),
  email         text not null unique,
  full_name     text,
  role          text not null default 'customer' check (role in ('customer','affiliate','admin')),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Orders: one row per purchase. user_id links to auth.users when known so RLS
-- can scope rows to their owner; guest checkouts keep user_id null and are
-- only reachable through the server (service role).
-- ---------------------------------------------------------------------------
create table if not exists public.orders (
  id             uuid primary key default gen_random_uuid(),
  order_no       text not null unique,
  user_id        uuid references auth.users(id) on delete set null,
  customer_email text not null,
  customer_name  text,
  product_slug   text,
  product_title  text,
  total          numeric(12,2) not null default 0 check (total >= 0),
  currency       text not null default 'USD',
  status         text not null default 'pending_payment',
  affiliate_code text,
  created_at     timestamptz not null default now(),
  paid_at        timestamptz
);
create index if not exists orders_user_id_idx   on public.orders(user_id);
create index if not exists orders_email_idx     on public.orders(lower(customer_email));
create index if not exists orders_created_idx   on public.orders(created_at desc);

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------
alter table public.users  enable row level security;
alter table public.orders enable row level security;

-- default deny (no policy = no access for anon/authenticated)

-- users: a signed-in user can see only their own mirror row (matched by email)
drop policy if exists "users self read" on public.users;
create policy "users self read" on public.users
  for select to authenticated
  using ( lower(email) = lower(coalesce(auth.jwt() ->> 'email', '')) );

-- orders: a signed-in user can see only their own orders (by user_id or email)
drop policy if exists "orders own read" on public.orders;
create policy "orders own read" on public.orders
  for select to authenticated
  using (
    user_id = (select nullif(auth.uid(), ''))
    or lower(customer_email) = lower(coalesce(auth.jwt() ->> 'email', ''))
  );

-- no insert/update/delete policies on either table for anon/authenticated:
-- only the server (service role, which bypasses RLS) writes.
