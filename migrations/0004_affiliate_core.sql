-- RAVA V72 — Affiliate core attribution fields
ALTER TABLE affiliate_clicks ADD COLUMN campaign TEXT;
ALTER TABLE affiliate_clicks ADD COLUMN sub_id TEXT;
ALTER TABLE affiliate_clicks ADD COLUMN landing_path TEXT;
ALTER TABLE affiliate_clicks ADD COLUMN referrer TEXT;
ALTER TABLE orders ADD COLUMN affiliate_campaign TEXT;
ALTER TABLE orders ADD COLUMN affiliate_sub_id TEXT;
ALTER TABLE orders ADD COLUMN affiliate_attributed_at TEXT;
ALTER TABLE orders ADD COLUMN affiliate_landing_path TEXT;
CREATE INDEX IF NOT EXISTS idx_clicks_affiliate_campaign ON affiliate_clicks(affiliate_id, campaign, created_at);
CREATE INDEX IF NOT EXISTS idx_orders_affiliate_campaign ON orders(affiliate_id, affiliate_campaign, created_at);
