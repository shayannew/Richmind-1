-- RAVA production database blueprint (PostgreSQL/Supabase compatible)
create table if not exists users (
  id text primary key,
  name text not null,
  email text not null unique,
  password_hash text not null,
  role text not null default 'customer' check (role in ('customer','affiliate','admin')),
  status text not null default 'active' check (status in ('active','disabled')),
  created_at timestamptz not null default now()
);
create table if not exists pages (
  id text primary key,
  kind text not null,
  slug text not null,
  title text not null,
  content jsonb not null default '[]'::jsonb,
  seo jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  unique(kind, slug)
);
create table if not exists products (
  id text primary key,
  slug text not null unique,
  title text not null,
  price numeric(12,2) not null default 0,
  currency text not null default 'USD',
  status text not null default 'published',
  sort_order integer not null default 0,
  landing jsonb not null default '{}'::jsonb,
  seo jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create table if not exists posts (
  id text primary key,
  slug text not null unique,
  title text not null,
  category text,
  content jsonb not null default '[]'::jsonb,
  seo jsonb not null default '{}'::jsonb,
  published_at timestamptz,
  updated_at timestamptz not null default now()
);
create table if not exists orders (
  id text primary key,
  order_no text not null unique,
  user_id text references users(id),
  product_id text references products(id),
  total numeric(12,2) not null,
  currency text not null,
  status text not null,
  payment_method text,
  affiliate_id text,
  affiliate_code text,
  commission_rate numeric(6,3) default 0,
  commission_amount numeric(12,2) default 0,
  affiliate_campaign text,
  affiliate_sub_id text,
  affiliate_attributed_at timestamptz,
  affiliate_landing_path text,
  affiliate_click_id text,
  affiliate_first_click_id text,
  affiliate_first_click_at timestamptz,
  affiliate_attribution_model text,
  affiliate_attribution_expires_at timestamptz,
  affiliate_visitor_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create table if not exists transactions (
  id text primary key,
  order_id text references orders(id),
  provider text not null,
  provider_transaction_id text,
  status text not null,
  amount numeric(12,2) not null,
  currency text not null,
  raw jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create table if not exists affiliates (
  id text primary key,
  user_id text references users(id),
  code text not null unique,
  commission_rate numeric(6,3) not null default 10,
  status text not null default 'active',
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create table if not exists affiliate_clicks (
  id bigserial primary key,
  affiliate_id text references affiliates(id),
  product_id text references products(id),
  visitor_id text,
  session_id text,
  source text,
  campaign text,
  sub_id text,
  landing_path text,
  referrer text,
  created_at timestamptz not null default now()
);
create table if not exists commissions (
  id text primary key,
  affiliate_id text references affiliates(id),
  order_id text references orders(id),
  amount numeric(12,2) not null,
  status text not null check (status in ('pending','approved','paid','rejected','reversed')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create table if not exists withdrawals (
  id text primary key,
  affiliate_id text references affiliates(id),
  amount numeric(12,2) not null,
  destination text,
  status text not null check (status in ('requested','approved','paid','rejected')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create table if not exists media (
  id text primary key,
  name text not null,
  url text not null,
  type text not null,
  alt text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create table if not exists analytics_events (
  id bigserial primary key,
  event_name text not null,
  path text,
  visitor_id text,
  session_id text,
  referrer text,
  device text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists idx_orders_user on orders(user_id);
create index if not exists idx_orders_affiliate on orders(affiliate_id);
create index if not exists idx_clicks_affiliate_created on affiliate_clicks(affiliate_id, created_at);
create index if not exists idx_events_created on analytics_events(created_at);

-- V74 affiliate campaign/link management
create table if not exists affiliate_campaigns (
  id text primary key,
  affiliate_id text references affiliates(id),
  name text not null,
  slug text not null,
  channel text,
  product_slug text,
  status text not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(affiliate_id, slug)
);
create table if not exists affiliate_links (
  id text primary key,
  affiliate_id text references affiliates(id),
  campaign_id text,
  product_slug text not null,
  label text,
  sub_id text,
  status text not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(affiliate_id, product_slug, campaign_id, sub_id)
);

-- V75 affiliate tracking indexes
CREATE INDEX IF NOT EXISTS idx_aff_clicks_tracking ON affiliate_clicks(affiliate_id, campaign, sub_id, product_id, created_at);
CREATE INDEX IF NOT EXISTS idx_aff_orders_tracking ON orders(affiliate_id, affiliate_campaign, affiliate_sub_id, product_slug, created_at);
