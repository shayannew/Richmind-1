-- RAVA V78 — Affiliate wallet & payouts
CREATE TABLE IF NOT EXISTS affiliate_payouts (
  id TEXT PRIMARY KEY,
  affiliate_id TEXT NOT NULL,
  amount REAL NOT NULL,
  currency TEXT NOT NULL DEFAULT 'USD',
  method TEXT NOT NULL,
  destination TEXT NOT NULL,
  fee REAL NOT NULL DEFAULT 0,
  net_amount REAL NOT NULL DEFAULT 0,
  status TEXT NOT NULL CHECK (status IN ('requested','approved','paid','rejected','cancelled')),
  requested_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  approved_at TEXT,
  paid_at TEXT,
  rejected_at TEXT,
  cancelled_at TEXT,
  processor_reference TEXT,
  rejection_reason TEXT,
  allocations_json TEXT NOT NULL DEFAULT '[]',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_affiliate_payouts_affiliate_status ON affiliate_payouts(affiliate_id,status,requested_at);
CREATE INDEX IF NOT EXISTS idx_affiliate_payouts_status_requested ON affiliate_payouts(status,requested_at);
