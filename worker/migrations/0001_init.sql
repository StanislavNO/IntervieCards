PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS cards (
  id TEXT PRIMARY KEY,
  question TEXT NOT NULL,
  answer TEXT NOT NULL,
  sources TEXT NOT NULL DEFAULT '[]',
  tags TEXT NOT NULL DEFAULT '[]',
  difficulty TEXT NOT NULL DEFAULT 'easy' CHECK (difficulty IN ('easy', 'medium', 'hard')),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_cards_created_at ON cards(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_cards_deleted_at ON cards(deleted_at);

CREATE TABLE IF NOT EXISTS comments (
  id TEXT PRIMARY KEY,
  card_id TEXT NOT NULL,
  text TEXT NOT NULL,
  created_at TEXT NOT NULL,
  FOREIGN KEY(card_id) REFERENCES cards(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_comments_card_created ON comments(card_id, created_at);

CREATE TABLE IF NOT EXISTS likes (
  id TEXT PRIMARY KEY,
  card_id TEXT NOT NULL,
  ip_hash TEXT NOT NULL,
  created_at TEXT NOT NULL,
  FOREIGN KEY(card_id) REFERENCES cards(id) ON DELETE CASCADE,
  UNIQUE(card_id, ip_hash)
);

CREATE INDEX IF NOT EXISTS idx_likes_card ON likes(card_id);
