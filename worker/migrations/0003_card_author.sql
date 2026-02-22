PRAGMA foreign_keys = ON;

ALTER TABLE cards ADD COLUMN author TEXT NOT NULL DEFAULT 'stanislavnur';

UPDATE cards
SET author = 'stanislavnur'
WHERE author IS NULL OR TRIM(author) = '';
