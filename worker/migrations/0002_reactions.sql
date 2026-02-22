PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS reactions (
  id TEXT PRIMARY KEY,
  card_id TEXT NOT NULL,
  ip_hash TEXT NOT NULL,
  value INTEGER NOT NULL CHECK (value IN (-1, 1)),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY(card_id) REFERENCES cards(id) ON DELETE CASCADE,
  UNIQUE(card_id, ip_hash)
);

CREATE INDEX IF NOT EXISTS idx_reactions_card ON reactions(card_id);
CREATE INDEX IF NOT EXISTS idx_reactions_ip_hash ON reactions(ip_hash);

INSERT OR IGNORE INTO reactions (id, card_id, ip_hash, value, created_at, updated_at)
SELECT id, card_id, ip_hash, 1, created_at, created_at
FROM likes;
