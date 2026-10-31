-- GuardianStream database schema (PostgreSQL)

CREATE TABLE IF NOT EXISTS filter_sets (
  content_id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  provider TEXT NOT NULL,
  provider_content_id TEXT NOT NULL,
  duration DOUBLE PRECISION NOT NULL,
  segments_json TEXT NOT NULL,
  coverage_json TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_filter_sets_hash_prefix
  ON filter_sets (LEFT(content_id, 4));

CREATE TABLE IF NOT EXISTS users (
  user_id TEXT PRIMARY KEY,
  reputation DOUBLE PRECISION NOT NULL DEFAULT 0,
  total_submissions INTEGER NOT NULL DEFAULT 0,
  accepted_submissions INTEGER NOT NULL DEFAULT 0,
  rejected_submissions INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS votes (
  id SERIAL PRIMARY KEY,
  segment_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  direction INTEGER NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(segment_id, user_id)
);

CREATE TABLE IF NOT EXISTS taxonomy_categories (
  id TEXT PRIMARY KEY,
  layer INTEGER NOT NULL,
  name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  default_action TEXT NOT NULL DEFAULT 'mute',
  default_threshold INTEGER NOT NULL DEFAULT 2,
  created_by TEXT NOT NULL DEFAULT 'system',
  usage_count INTEGER NOT NULL DEFAULT 0,
  subscriber_count INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'active',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS category_packs (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  author TEXT NOT NULL,
  categories_json TEXT NOT NULL,
  subscribers INTEGER NOT NULL DEFAULT 0,
  rating DOUBLE PRECISION NOT NULL DEFAULT 0,
  tags_json TEXT NOT NULL DEFAULT '[]',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
