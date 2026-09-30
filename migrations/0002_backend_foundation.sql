PRAGMA foreign_keys = ON;
ALTER TABLE products ADD COLUMN sort_order INTEGER NOT NULL DEFAULT 0;
CREATE INDEX IF NOT EXISTS idx_products_sort ON products(sort_order, status);
CREATE INDEX IF NOT EXISTS idx_affiliate_clicks_product ON affiliate_clicks(product_id, created_at);
CREATE INDEX IF NOT EXISTS idx_commissions_affiliate_status ON commissions(affiliate_id, status, created_at);
CREATE INDEX IF NOT EXISTS idx_analytics_path_created ON analytics_events(path, created_at);

CREATE INDEX IF NOT EXISTS idx_analytics_event_created ON analytics_events(event_name, created_at);
CREATE INDEX IF NOT EXISTS idx_analytics_visitor_created ON analytics_events(visitor_id, created_at);
CREATE INDEX IF NOT EXISTS idx_analytics_session_created ON analytics_events(session_id, created_at);
