import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const workerDir = path.resolve(__dirname, '..');
const repoDir = path.resolve(workerDir, '..');
const cardsPath = path.join(repoDir, 'server', 'data', 'cards.json');

const [databaseName, mode] = process.argv.slice(2);
const remote = mode === '--remote';

if (!databaseName) {
  console.error('Usage: node scripts/seed-d1.mjs <database-name> [--local|--remote]');
  process.exit(1);
}

const cards = JSON.parse(readFileSync(cardsPath, 'utf8'));
if (!Array.isArray(cards)) {
  console.error('server/data/cards.json must contain an array');
  process.exit(1);
}

const defaultAuthor = 'stanislavnur';

const sqlLines = [];

for (const card of cards) {
  const id = isNonEmptyString(card?.id) ? card.id : randomUUID();
  const question = isNonEmptyString(card?.question) ? card.question : '';
  const answer = isNonEmptyString(card?.answer) ? card.answer : '';
  const sources = Array.isArray(card?.sources) ? card.sources.filter((s) => typeof s === 'string') : [];
  const tags = Array.isArray(card?.tags) ? card.tags.filter((t) => typeof t === 'string') : [];
  const difficulty = ['easy', 'medium', 'hard'].includes(card?.difficulty) ? card.difficulty : 'easy';
  const author = isNonEmptyString(card?.author) ? card.author.trim() : defaultAuthor;
  const createdAt = parseDate(card?.createdAt);
  const updatedAt = createdAt;

  if (!question || !answer) {
    continue;
  }

  sqlLines.push(`
INSERT INTO cards (id, question, answer, sources, tags, difficulty, author, created_at, updated_at, deleted_at)
VALUES (${sqlString(id)}, ${sqlString(question)}, ${sqlString(answer)}, ${sqlString(JSON.stringify(sources))}, ${sqlString(
    JSON.stringify(tags)
  )}, ${sqlString(difficulty)}, ${sqlString(author)}, ${sqlString(createdAt)}, ${sqlString(updatedAt)}, NULL)
ON CONFLICT(id) DO UPDATE SET
  question = excluded.question,
  answer = excluded.answer,
  sources = excluded.sources,
  tags = excluded.tags,
  difficulty = excluded.difficulty,
  author = excluded.author,
  created_at = excluded.created_at,
  updated_at = excluded.updated_at,
  deleted_at = NULL;`.trim());
}

const tempDir = mkdtempSync(path.join(tmpdir(), 'unityprep-d1-seed-'));
const sqlPath = path.join(tempDir, 'seed.sql');
writeFileSync(sqlPath, `${sqlLines.join('\n\n')}\n`, 'utf8');

try {
  const args = ['wrangler', 'd1', 'execute', databaseName, remote ? '--remote' : '--local', '--file', sqlPath];
  execFileSync('npx', args, { cwd: workerDir, stdio: 'inherit' });
} finally {
  rmSync(tempDir, { recursive: true, force: true });
}

function sqlString(value) {
  return `'${String(value).replace(/'/g, "''")}'`;
}

function isNonEmptyString(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

function parseDate(value) {
  if (typeof value !== 'string') {
    return new Date().toISOString();
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return new Date().toISOString();
  }
  return parsed.toISOString();
}
