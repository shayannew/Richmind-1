-- RAVA V75 — Affiliate Tracking & Attribution indexes
ALTER TABLE orders ADD COLUMN product_slug TEXT;
CREATE INDEX IF NOT EXISTS idx_aff_clicks_tracking
  ON affiliate_clicks(affiliate_id, campaign, sub_id, product_id, created_at);
CREATE INDEX IF NOT EXISTS idx_aff_orders_tracking
  ON orders(affiliate_id, affiliate_campaign, affiliate_sub_id, product_slug, created_at);
