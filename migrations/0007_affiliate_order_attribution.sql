-- RAVA V76 — Conversion & Order Attribution Pro
-- Snapshot exact click-level attribution on the order so reporting survives later cookie changes.
ALTER TABLE orders ADD COLUMN affiliate_click_id TEXT;
ALTER TABLE orders ADD COLUMN affiliate_first_click_id TEXT;
ALTER TABLE orders ADD COLUMN affiliate_first_click_at TEXT;
ALTER TABLE orders ADD COLUMN affiliate_attribution_model TEXT;
ALTER TABLE orders ADD COLUMN affiliate_attribution_expires_at TEXT;
ALTER TABLE orders ADD COLUMN affiliate_visitor_id TEXT;
CREATE INDEX IF NOT EXISTS idx_orders_affiliate_click_id ON orders(affiliate_click_id);
CREATE INDEX IF NOT EXISTS idx_orders_affiliate_status_date ON orders(affiliate_id,status,created_at);
