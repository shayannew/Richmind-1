-- RAVA V84 — Orders 2.0 + digital delivery
ALTER TABLE products ADD COLUMN delivery_json TEXT NOT NULL DEFAULT '{}';
ALTER TABLE orders ADD COLUMN delivery_json TEXT NOT NULL DEFAULT '{}';
ALTER TABLE orders ADD COLUMN delivery_email_status TEXT NOT NULL DEFAULT 'not_sent';
ALTER TABLE orders ADD COLUMN delivery_email_sent_at TEXT;
ALTER TABLE orders ADD COLUMN delivery_token_hash TEXT;
ALTER TABLE orders ADD COLUMN delivery_first_opened_at TEXT;
CREATE TABLE IF NOT EXISTS email_outbox (
  id TEXT PRIMARY KEY,
  type TEXT NOT NULL,
  to_email TEXT NOT NULL,
  subject TEXT NOT NULL,
  order_no TEXT,
  payload_json TEXT NOT NULL DEFAULT '{}',
  status TEXT NOT NULL DEFAULT 'queued',
  attempts INTEGER NOT NULL DEFAULT 0,
  last_error TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  sent_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_email_outbox_status_created ON email_outbox(status, created_at);
CREATE INDEX IF NOT EXISTS idx_orders_delivery_email ON orders(delivery_email_status, delivery_email_sent_at);
