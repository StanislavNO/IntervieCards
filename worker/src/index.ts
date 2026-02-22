import { Context, Hono } from 'hono';
import { cors } from 'hono/cors';
import { z } from 'zod';

type Bindings = {
  DB: D1Database;
  ALLOWED_ORIGIN?: string;
  LIKES_SALT?: string;
};

type Difficulty = 'easy' | 'medium' | 'hard';
type CardSort = 'new' | 'popular';
type ReactionValue = -1 | 1;

type Card = {
  id: string;
  question: string;
  answer: string;
  sources: string[];
  tags: string[];
  difficulty: Difficulty;
  createdAt: string;
  updatedAt: string;
  likesCount: number;
  dislikesCount: number;
  score: number;
  userReaction: ReactionValue | 0;
};

type CardRow = {
  id: string;
  question: string;
  answer: string;
  sources: string;
  tags: string;
  difficulty: string;
  created_at: string;
  updated_at: string;
  likes_count: number | string | null;
  dislikes_count: number | string | null;
  score: number | string | null;
  user_reaction: number | string | null;
};

type CommentRow = {
  id: string;
  card_id: string;
  text: string;
  created_at: string;
};

type ReactionRow = {
  id: string;
  value: number;
};

type ReactionSummary = {
  likesCount: number;
  dislikesCount: number;
  score: number;
  userReaction: ReactionValue | 0;
};

const app = new Hono<{ Bindings: Bindings }>();
const nonEmpty = z.string().trim().min(1);
const difficultySchema = z.enum(['easy', 'medium', 'hard']);
const normalizedStringArray = z
  .array(nonEmpty)
  .max(30)
  .transform((items) => Array.from(new Set(items.map((item) => item.trim()))));

const createCardSchema = z.object({
  question: nonEmpty,
  answer: nonEmpty,
  sources: normalizedStringArray.optional().default([]),
  tags: normalizedStringArray.optional().default([]),
  difficulty: difficultySchema.optional().default('easy')
});

const updateCardSchema = z
  .object({
    question: nonEmpty.optional(),
    answer: nonEmpty.optional(),
    sources: normalizedStringArray.optional(),
    tags: normalizedStringArray.optional(),
    difficulty: difficultySchema.optional()
  })
  .refine((value) => Object.keys(value).length > 0, {
    message: 'At least one field must be provided'
  });

const createCommentSchema = z.object({
  text: nonEmpty.max(1200)
});

const reactionSchema = z.object({
  value: z.union([z.literal(1), z.literal(-1)])
});

app.use('/api/*', async (c, next) => {
  const allowedOrigins = parseAllowedOrigins(c.env.ALLOWED_ORIGIN);
  return cors({
    origin: (origin) => {
      if (allowedOrigins.length === 0) return '*';
      if (!origin) return allowedOrigins[0];
      return allowedOrigins.includes(origin) ? origin : allowedOrigins[0];
    },
    allowMethods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowHeaders: ['Content-Type']
  })(c, next);
});

app.get('/api/health', (c) => c.json({ ok: true }));

app.get('/api/cards', async (c) => {
  const sortQuery = c.req.query('sort');
  const sort: CardSort = sortQuery === 'popular' ? 'popular' : 'new';
  const requesterHash = await getRequesterHash(c);
  const orderClause =
    sort === 'popular'
      ? 'ORDER BY score DESC, likes_count DESC, datetime(c.created_at) DESC'
      : 'ORDER BY datetime(c.created_at) DESC';

  const rows = await c.env.DB.prepare(
    `
      SELECT
        c.id,
        c.question,
        c.answer,
        c.sources,
        c.tags,
        c.difficulty,
        c.created_at,
        c.updated_at,
        COALESCE(SUM(CASE WHEN r.value = 1 THEN 1 ELSE 0 END), 0) AS likes_count,
        COALESCE(SUM(CASE WHEN r.value = -1 THEN 1 ELSE 0 END), 0) AS dislikes_count,
        COALESCE(SUM(r.value), 0) AS score,
        COALESCE(MAX(CASE WHEN r.ip_hash = ? THEN r.value ELSE 0 END), 0) AS user_reaction
      FROM cards c
      LEFT JOIN reactions r ON r.card_id = c.id
      WHERE c.deleted_at IS NULL
      GROUP BY c.id
      ${orderClause}
    `
  )
    .bind(requesterHash)
    .all<CardRow>();

  return c.json((rows.results ?? []).map(mapCard));
});

app.get('/api/cards/:id', async (c) => {
  const id = c.req.param('id');
  const requesterHash = await getRequesterHash(c);
  const card = await getCardById(c.env.DB, id, requesterHash);
  if (!card) {
    return c.json({ error: 'Card not found' }, 404);
  }
  return c.json(card);
});

app.post('/api/cards', async (c) => {
  const body = await safeJson(c);
  if (!body.ok) {
    return c.json({ error: 'Invalid JSON payload' }, 400);
  }

  const parsed = createCardSchema.safeParse(body.value);
  if (!parsed.success) {
    return c.json({ error: 'Validation error', details: parsed.error.issues }, 400);
  }

  const now = new Date().toISOString();
  const card: Card = {
    id: crypto.randomUUID(),
    question: parsed.data.question,
    answer: parsed.data.answer,
    sources: parsed.data.sources,
    tags: parsed.data.tags,
    difficulty: parsed.data.difficulty,
    createdAt: now,
    updatedAt: now,
    likesCount: 0,
    dislikesCount: 0,
    score: 0,
    userReaction: 0
  };

  await c.env.DB.prepare(
    `
      INSERT INTO cards (id, question, answer, sources, tags, difficulty, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `
  )
    .bind(
      card.id,
      card.question,
      card.answer,
      JSON.stringify(card.sources),
      JSON.stringify(card.tags),
      card.difficulty,
      card.createdAt,
      card.updatedAt
    )
    .run();

  return c.json(card, 201);
});

app.put('/api/cards/:id', async (c) => {
  const id = c.req.param('id');
  const requesterHash = await getRequesterHash(c);
  const current = await getCardById(c.env.DB, id, requesterHash);
  if (!current) {
    return c.json({ error: 'Card not found' }, 404);
  }

  const body = await safeJson(c);
  if (!body.ok) {
    return c.json({ error: 'Invalid JSON payload' }, 400);
  }

  const parsed = updateCardSchema.safeParse(body.value);
  if (!parsed.success) {
    return c.json({ error: 'Validation error', details: parsed.error.issues }, 400);
  }

  const next: Card = {
    ...current,
    ...parsed.data,
    sources: parsed.data.sources ?? current.sources,
    tags: parsed.data.tags ?? current.tags,
    difficulty: parsed.data.difficulty ?? current.difficulty,
    updatedAt: new Date().toISOString()
  };

  await c.env.DB.prepare(
    `
      UPDATE cards
      SET question = ?, answer = ?, sources = ?, tags = ?, difficulty = ?, updated_at = ?
      WHERE id = ? AND deleted_at IS NULL
    `
  )
    .bind(
      next.question,
      next.answer,
      JSON.stringify(next.sources),
      JSON.stringify(next.tags),
      next.difficulty,
      next.updatedAt,
      id
    )
    .run();

  return c.json(next);
});

app.delete('/api/cards/:id', async (c) => {
  const id = c.req.param('id');
  const now = new Date().toISOString();
  const result = await c.env.DB.prepare(
    `
      UPDATE cards
      SET deleted_at = ?, updated_at = ?
      WHERE id = ? AND deleted_at IS NULL
    `
  )
    .bind(now, now, id)
    .run();

  const changes = Number(result.meta.changes ?? 0);
  if (changes === 0) {
    return c.json({ error: 'Card not found' }, 404);
  }

  return c.body(null, 204);
});

app.get('/api/cards/:id/comments', async (c) => {
  const cardId = c.req.param('id');
  const exists = await cardExists(c.env.DB, cardId);
  if (!exists) {
    return c.json({ error: 'Card not found' }, 404);
  }

  const result = await c.env.DB.prepare(
    `
      SELECT id, card_id, text, created_at
      FROM comments
      WHERE card_id = ?
      ORDER BY datetime(created_at) ASC
    `
  )
    .bind(cardId)
    .all<CommentRow>();

  return c.json(
    (result.results ?? []).map((row) => ({
      id: row.id,
      cardId: row.card_id,
      text: row.text,
      createdAt: row.created_at
    }))
  );
});

app.post('/api/cards/:id/comments', async (c) => {
  const cardId = c.req.param('id');
  const exists = await cardExists(c.env.DB, cardId);
  if (!exists) {
    return c.json({ error: 'Card not found' }, 404);
  }

  const body = await safeJson(c);
  if (!body.ok) {
    return c.json({ error: 'Invalid JSON payload' }, 400);
  }

  const parsed = createCommentSchema.safeParse(body.value);
  if (!parsed.success) {
    return c.json({ error: 'Validation error', details: parsed.error.issues }, 400);
  }

  const createdAt = new Date().toISOString();
  const payload = {
    id: crypto.randomUUID(),
    cardId,
    text: parsed.data.text,
    createdAt
  };

  await c.env.DB.prepare(
    `
      INSERT INTO comments (id, card_id, text, created_at)
      VALUES (?, ?, ?, ?)
    `
  )
    .bind(payload.id, payload.cardId, payload.text, payload.createdAt)
    .run();

  return c.json(payload, 201);
});

app.get('/api/cards/:id/reaction', async (c) => {
  const cardId = c.req.param('id');
  const exists = await cardExists(c.env.DB, cardId);
  if (!exists) {
    return c.json({ error: 'Card not found' }, 404);
  }

  const requesterHash = await getRequesterHash(c);
  const summary = await getReactionSummary(c.env.DB, cardId, requesterHash);

  return c.json({
    cardId,
    likesCount: summary.likesCount,
    dislikesCount: summary.dislikesCount,
    score: summary.score,
    userReaction: summary.userReaction
  });
});

app.post('/api/cards/:id/reaction', async (c) => {
  const cardId = c.req.param('id');
  const exists = await cardExists(c.env.DB, cardId);
  if (!exists) {
    return c.json({ error: 'Card not found' }, 404);
  }

  const body = await safeJson(c);
  if (!body.ok) {
    return c.json({ error: 'Invalid JSON payload' }, 400);
  }

  const parsed = reactionSchema.safeParse(body.value);
  if (!parsed.success) {
    return c.json({ error: 'Validation error', details: parsed.error.issues }, 400);
  }

  const requesterHash = await getRequesterHash(c);
  await setReaction(c.env.DB, cardId, requesterHash, parsed.data.value, true);

  const summary = await getReactionSummary(c.env.DB, cardId, requesterHash);

  return c.json({
    cardId,
    likesCount: summary.likesCount,
    dislikesCount: summary.dislikesCount,
    score: summary.score,
    userReaction: summary.userReaction
  });
});

app.get('/api/cards/:id/likes', async (c) => {
  const cardId = c.req.param('id');
  const exists = await cardExists(c.env.DB, cardId);
  if (!exists) {
    return c.json({ error: 'Card not found' }, 404);
  }

  const requesterHash = await getRequesterHash(c);
  const summary = await getReactionSummary(c.env.DB, cardId, requesterHash);
  return c.json({
    cardId,
    likesCount: summary.likesCount,
    dislikesCount: summary.dislikesCount,
    score: summary.score,
    userReaction: summary.userReaction,
    liked: summary.userReaction === 1
  });
});

app.post('/api/cards/:id/likes', async (c) => {
  const cardId = c.req.param('id');
  const exists = await cardExists(c.env.DB, cardId);
  if (!exists) {
    return c.json({ error: 'Card not found' }, 404);
  }

  const requesterHash = await getRequesterHash(c);
  await setReaction(c.env.DB, cardId, requesterHash, 1, false);

  const summary = await getReactionSummary(c.env.DB, cardId, requesterHash);

  return c.json({
    cardId,
    likesCount: summary.likesCount,
    dislikesCount: summary.dislikesCount,
    score: summary.score,
    userReaction: summary.userReaction,
    liked: summary.userReaction === 1
  });
});

app.notFound((c) => c.json({ error: 'Not found' }, 404));

app.onError((error, c) => {
  console.error(error);
  return c.json({ error: 'Internal server error' }, 500);
});

export default app;

function parseAllowedOrigins(value?: string): string[] {
  if (!value) return [];
  return value
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean);
}

function mapCard(row: CardRow): Card {
  return {
    id: row.id,
    question: row.question,
    answer: row.answer,
    sources: parseJsonArray(row.sources),
    tags: parseJsonArray(row.tags),
    difficulty: normalizeDifficulty(row.difficulty),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    likesCount: numberFromDb(row.likes_count),
    dislikesCount: numberFromDb(row.dislikes_count),
    score: numberFromDb(row.score),
    userReaction: normalizeUserReaction(row.user_reaction)
  };
}

function parseJsonArray(value: string): string[] {
  if (!value) return [];

  try {
    const parsed = JSON.parse(value);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((entry): entry is string => typeof entry === 'string').map((entry) => entry.trim()).filter(Boolean);
  } catch {
    return [];
  }
}

function normalizeDifficulty(value: string): Difficulty {
  return value === 'medium' || value === 'hard' ? value : 'easy';
}

function numberFromDb(value: number | string | null | undefined): number {
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : 0;
  }

  if (typeof value === 'string') {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }

  return 0;
}

function normalizeUserReaction(value: number | string | null | undefined): ReactionValue | 0 {
  const normalized = numberFromDb(value);
  if (normalized === 1) return 1;
  if (normalized === -1) return -1;
  return 0;
}

async function getCardById(db: D1Database, id: string, requesterHash: string): Promise<Card | null> {
  const row = await db
    .prepare(
      `
        SELECT
          c.id,
          c.question,
          c.answer,
          c.sources,
          c.tags,
          c.difficulty,
          c.created_at,
          c.updated_at,
          COALESCE(SUM(CASE WHEN r.value = 1 THEN 1 ELSE 0 END), 0) AS likes_count,
          COALESCE(SUM(CASE WHEN r.value = -1 THEN 1 ELSE 0 END), 0) AS dislikes_count,
          COALESCE(SUM(r.value), 0) AS score,
          COALESCE(MAX(CASE WHEN r.ip_hash = ? THEN r.value ELSE 0 END), 0) AS user_reaction
        FROM cards c
        LEFT JOIN reactions r ON r.card_id = c.id
        WHERE c.id = ? AND c.deleted_at IS NULL
        GROUP BY c.id
      `
    )
    .bind(requesterHash, id)
    .first<CardRow>();

  if (!row) return null;
  return mapCard(row);
}

async function cardExists(db: D1Database, id: string): Promise<boolean> {
  const row = await db.prepare(`SELECT id FROM cards WHERE id = ? AND deleted_at IS NULL`).bind(id).first<{ id: string }>();
  return Boolean(row?.id);
}

async function getReactionSummary(db: D1Database, cardId: string, requesterHash: string): Promise<ReactionSummary> {
  const row = await db
    .prepare(
      `
        SELECT
          COALESCE(SUM(CASE WHEN value = 1 THEN 1 ELSE 0 END), 0) AS likes_count,
          COALESCE(SUM(CASE WHEN value = -1 THEN 1 ELSE 0 END), 0) AS dislikes_count,
          COALESCE(SUM(value), 0) AS score,
          COALESCE(MAX(CASE WHEN ip_hash = ? THEN value ELSE 0 END), 0) AS user_reaction
        FROM reactions
        WHERE card_id = ?
      `
    )
    .bind(requesterHash, cardId)
    .first<{
      likes_count: number | string | null;
      dislikes_count: number | string | null;
      score: number | string | null;
      user_reaction: number | string | null;
    }>();

  return {
    likesCount: numberFromDb(row?.likes_count),
    dislikesCount: numberFromDb(row?.dislikes_count),
    score: numberFromDb(row?.score),
    userReaction: normalizeUserReaction(row?.user_reaction)
  };
}

async function setReaction(
  db: D1Database,
  cardId: string,
  requesterHash: string,
  value: ReactionValue,
  toggleWhenSame: boolean
): Promise<void> {
  const now = new Date().toISOString();
  const existing = await db
    .prepare(
      `
        SELECT id, value
        FROM reactions
        WHERE card_id = ? AND ip_hash = ?
        LIMIT 1
      `
    )
    .bind(cardId, requesterHash)
    .first<ReactionRow>();

  if (!existing) {
    await db
      .prepare(
        `
          INSERT INTO reactions (id, card_id, ip_hash, value, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?, ?)
        `
      )
      .bind(crypto.randomUUID(), cardId, requesterHash, value, now, now)
      .run();
    return;
  }

  const currentValue = numberFromDb(existing.value);
  if (currentValue === value) {
    if (toggleWhenSame) {
      await db.prepare(`DELETE FROM reactions WHERE id = ?`).bind(existing.id).run();
    }
    return;
  }

  await db
    .prepare(
      `
        UPDATE reactions
        SET value = ?, updated_at = ?
        WHERE id = ?
      `
    )
    .bind(value, now, existing.id)
    .run();
}

function extractClientIp(headers: Headers): string | null {
  const cfConnectingIp = headers.get('cf-connecting-ip');
  if (cfConnectingIp) return cfConnectingIp;

  const xForwardedFor = headers.get('x-forwarded-for');
  if (!xForwardedFor) return null;

  const [first] = xForwardedFor.split(',');
  return first?.trim() || null;
}

async function getRequesterHash(c: Context<{ Bindings: Bindings }>): Promise<string> {
  const rawIp = extractClientIp(c.req.raw.headers) ?? 'unknown';
  return hashValue(`${rawIp}:${c.env.LIKES_SALT ?? ''}`);
}

async function hashValue(value: string): Promise<string> {
  const encoded = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest('SHA-256', encoded);
  const bytes = new Uint8Array(digest);
  return Array.from(bytes)
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
}

async function safeJson(c: Context<{ Bindings: Bindings }>) {
  try {
    return { ok: true as const, value: await c.req.json() };
  } catch {
    return { ok: false as const };
  }
}
