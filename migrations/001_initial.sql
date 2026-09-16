-- Resolve indexer initial schema (SQLite)
-- Idempotent unique constraints ensure safe reprocessing.

CREATE TABLE IF NOT EXISTS checkpoints (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  cursor TEXT NOT NULL,
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE TABLE IF NOT EXISTS markets (
  id INTEGER PRIMARY KEY NOT NULL,
  creator TEXT NOT NULL,
  resolver TEXT NOT NULL,
  question TEXT,
  description TEXT,
  token TEXT NOT NULL,
  created_at INTEGER,
  close_at INTEGER NOT NULL,
  resolution_timeout INTEGER NOT NULL,
  yes_pool TEXT NOT NULL DEFAULT '0',
  no_pool TEXT NOT NULL DEFAULT '0',
  status TEXT NOT NULL DEFAULT 'open'
    CHECK (status IN ('open', 'resolved', 'invalid')),
  outcome TEXT CHECK (outcome IS NULL OR outcome IN ('yes', 'no', 'invalid')),
  finalized_at INTEGER,
  created_tx TEXT,
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE INDEX IF NOT EXISTS idx_markets_status ON markets(status);
CREATE INDEX IF NOT EXISTS idx_markets_created_at ON markets(created_at);

CREATE TABLE IF NOT EXISTS positions (
  market_id INTEGER NOT NULL,
  user_address TEXT NOT NULL,
  yes_amount TEXT NOT NULL DEFAULT '0',
  no_amount TEXT NOT NULL DEFAULT '0',
  claimed INTEGER NOT NULL DEFAULT 0 CHECK (claimed IN (0, 1)),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  PRIMARY KEY (market_id, user_address),
  FOREIGN KEY (market_id) REFERENCES markets(id)
);

CREATE INDEX IF NOT EXISTS idx_positions_user ON positions(user_address);

CREATE TABLE IF NOT EXISTS activity (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_address TEXT NOT NULL,
  market_id INTEGER NOT NULL,
  type TEXT NOT NULL
    CHECK (type IN ('stake', 'claim', 'resolve', 'invalidate', 'create')),
  amount TEXT,
  side TEXT CHECK (side IS NULL OR side IN ('yes', 'no')),
  outcome TEXT CHECK (outcome IS NULL OR outcome IN ('yes', 'no', 'invalid')),
  claim_kind TEXT CHECK (claim_kind IS NULL OR claim_kind IN ('payout', 'refund')),
  tx_hash TEXT NOT NULL,
  ledger INTEGER,
  ts TEXT NOT NULL,
  UNIQUE (tx_hash, type, user_address, market_id)
);

CREATE INDEX IF NOT EXISTS idx_activity_user ON activity(user_address, id DESC);
CREATE INDEX IF NOT EXISTS idx_activity_market ON activity(market_id, id DESC);

CREATE TABLE IF NOT EXISTS processed_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  tx_hash TEXT NOT NULL,
  event_index INTEGER NOT NULL,
  event_type TEXT NOT NULL,
  ledger INTEGER,
  processed_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  UNIQUE (tx_hash, event_index)
);

CREATE INDEX IF NOT EXISTS idx_processed_events_ledger ON processed_events(ledger);

CREATE TABLE IF NOT EXISTS schema_migrations (
  id TEXT PRIMARY KEY,
  applied_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
