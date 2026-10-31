-- GuardianStream database schema (SQLite for development, PostgreSQL for production)

CREATE TABLE IF NOT EXISTS filter_sets (
  content_id TEXT PRIMARY KEY,   -- sha256 of "provider:native_id"
  title TEXT NOT NULL,
  provider TEXT NOT NULL,
  provider_content_id TEXT NOT NULL,
  duration REAL NOT NULL,
  segments_json TEXT NOT NULL,   -- JSON array of GSFSegment
  coverage_json TEXT NOT NULL,   -- JSON FilterCoverage
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Hash prefix index for k-anonymity lookups
CREATE INDEX IF NOT EXISTS idx_filter_sets_hash_prefix
  ON filter_sets (substr(content_id, 1, 4));

CREATE TABLE IF NOT EXISTS users (
  user_id TEXT PRIMARY KEY,      -- sha256(local_secret, 5000 iterations)
  reputation REAL NOT NULL DEFAULT 0,
  total_submissions INTEGER NOT NULL DEFAULT 0,
  accepted_submissions INTEGER NOT NULL DEFAULT 0,
  rejected_submissions INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS votes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  segment_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  direction INTEGER NOT NULL,    -- 1 = up, -1 = down
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(segment_id, user_id)
);

CREATE TABLE IF NOT EXISTS taxonomy_categories (
  id TEXT PRIMARY KEY,           -- "blasphemy.gods_name"
  layer INTEGER NOT NULL,        -- 1, 2, or 3
  name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  default_action TEXT NOT NULL DEFAULT 'mute',
  default_threshold INTEGER NOT NULL DEFAULT 2,
  created_by TEXT NOT NULL DEFAULT 'system',
  usage_count INTEGER NOT NULL DEFAULT 0,
  subscriber_count INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'active',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS category_packs (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  author TEXT NOT NULL,
  categories_json TEXT NOT NULL,  -- JSON array of {categoryId, threshold, action}
  subscribers INTEGER NOT NULL DEFAULT 0,
  rating REAL NOT NULL DEFAULT 0,
  tags_json TEXT NOT NULL DEFAULT '[]',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
