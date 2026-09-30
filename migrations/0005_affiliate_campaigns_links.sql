-- RAVA V74 — Affiliate Campaign + Link Management
CREATE TABLE IF NOT EXISTS affiliate_campaigns (
  id TEXT PRIMARY KEY,
  affiliate_id TEXT NOT NULL,
  name TEXT NOT NULL,
  slug TEXT NOT NULL,
  channel TEXT,
  product_slug TEXT,
  status TEXT NOT NULL DEFAULT 'active',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_aff_campaign_aff_slug
  ON affiliate_campaigns(affiliate_id, slug);
CREATE INDEX IF NOT EXISTS idx_aff_campaign_status
  ON affiliate_campaigns(affiliate_id, status, created_at);

CREATE TABLE IF NOT EXISTS affiliate_links (
  id TEXT PRIMARY KEY,
  affiliate_id TEXT NOT NULL,
  campaign_id TEXT,
  product_slug TEXT NOT NULL,
  label TEXT,
  sub_id TEXT,
  status TEXT NOT NULL DEFAULT 'active',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_aff_link_unique_combo
  ON affiliate_links(affiliate_id, product_slug, campaign_id, sub_id);
CREATE INDEX IF NOT EXISTS idx_aff_link_status
  ON affiliate_links(affiliate_id, status, created_at);
CREATE INDEX IF NOT EXISTS idx_aff_link_campaign
  ON affiliate_links(affiliate_id, campaign_id, created_at);
