import { Context, Hono } from 'hono';
import { cors } from 'hono/cors';
import { z } from 'zod';

type Bindings = {
  DB: D1Database;
  ALLOWED_ORIGIN?: string;
  LIKES_SALT?: string;
  TELEGRAM_BOT_TOKEN?: string;
  AUTH_SECRET?: string;
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

type TelegramAuthPayload = {
  id: string;
  first_name: string;
  last_name?: string;
  username?: string;
  photo_url?: string;
  auth_date: number;
  hash: string;
};

type AuthUser = {
  id: string;
  firstName: string;
  lastName?: string;
  username?: string;
  photoUrl?: string;
  authDate: number;
};

const telegramAuthMaxAgeSeconds = 24 * 60 * 60;
const authTokenLifetimeSeconds = 30 * 24 * 60 * 60;
const tokenHeader = { alg: 'HS256', typ: 'JWT' } as const;
const textEncoder = new TextEncoder();
const nonEmpty = z.string().trim().min(1);
const numericString = z.string().trim().regex(/^\d+$/);
const optionalTrimmedString = z
  .string()
  .trim()
  .max(255)
  .optional()
  .transform((value) => (value ? value : undefined));

const app = new Hono<{ Bindings: Bindings }>();
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

const telegramAuthSchema = z.object({
  id: z
    .union([z.number().int().positive().transform(String), numericString])
    .transform((value) => String(value)),
  first_name: nonEmpty.max(255),
  last_name: optionalTrimmedString,
  username: optionalTrimmedString,
  photo_url: optionalTrimmedString,
  auth_date: z.union([z.number().int().positive(), numericString.transform((value) => Number(value))]),
  hash: z.string().trim().regex(/^[a-f0-9]{64}$/iu)
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
    allowHeaders: ['Content-Type', 'Authorization']
  })(c, next);
});

app.get('/api/health', (c) => c.json({ ok: true }));

app.post('/api/auth/telegram', async (c) => {
  const botToken = c.env.TELEGRAM_BOT_TOKEN?.trim();
  if (!botToken) {
    return c.json({ error: 'Telegram auth is not configured on server' }, 503);
  }

  const body = await safeJson(c);
  if (!body.ok) {
    return c.json({ error: 'Invalid JSON payload' }, 400);
  }

  const parsed = telegramAuthSchema.safeParse(body.value);
  if (!parsed.success) {
    return c.json({ error: 'Validation error', details: parsed.error.issues }, 400);
  }

  const user = await verifyTelegramAuthPayload(parsed.data, botToken);
  if (!user) {
    return c.json({ error: 'Invalid Telegram auth payload' }, 401);
  }

  const token = await issueAuthToken(user, resolveAuthSecret(c.env));
  return c.json({ token, user });
});

app.get('/api/auth/me', async (c) => {
  const token = parseBearerToken(c.req.header('authorization'));
  if (!token) {
    return c.json({ error: 'Unauthorized' }, 401);
  }

  const user = await verifyAuthToken(token, resolveAuthSecret(c.env));
  if (!user) {
    return c.json({ error: 'Unauthorized' }, 401);
  }

  return c.json({ user });
});

app.post('/api/auth/logout', (c) => c.body(null, 204));

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
  const unauthorized = await requireAuth(c);
  if (unauthorized) {
    return unauthorized;
  }

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
  const unauthorized = await requireAuth(c);
  if (unauthorized) {
    return unauthorized;
  }

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
  const unauthorized = await requireAuth(c);
  if (unauthorized) {
    return unauthorized;
  }

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
  const unauthorized = await requireAuth(c);
  if (unauthorized) {
    return unauthorized;
  }

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

async function requireAuth(c: Context<{ Bindings: Bindings }>): Promise<Response | null> {
  const authEnabled = Boolean(c.env.TELEGRAM_BOT_TOKEN?.trim());
  if (!authEnabled) {
    return null;
  }

  const token = parseBearerToken(c.req.header('authorization'));
  if (!token) {
    return c.json({ error: 'Unauthorized' }, 401);
  }

  const user = await verifyAuthToken(token, resolveAuthSecret(c.env));
  if (!user) {
    return c.json({ error: 'Unauthorized' }, 401);
  }

  return null;
}

function parseBearerToken(headerValue: string | undefined): string | null {
  if (!headerValue) {
    return null;
  }

  const [scheme, token] = headerValue.split(' ');
  if (!scheme || !token || scheme.toLowerCase() !== 'bearer') {
    return null;
  }

  return token.trim() || null;
}

function resolveAuthSecret(env: Bindings): string {
  return env.AUTH_SECRET?.trim() || env.TELEGRAM_BOT_TOKEN?.trim() || 'unityprep-dev-auth-secret';
}

async function verifyTelegramAuthPayload(payload: TelegramAuthPayload, botToken: string): Promise<AuthUser | null> {
  const now = Math.floor(Date.now() / 1000);
  if (payload.auth_date > now + 60 || now - payload.auth_date > telegramAuthMaxAgeSeconds) {
    return null;
  }

  const dataCheckString = getTelegramDataCheckString(payload);
  const secretKey = await digestSha256(botToken);
  const computedHash = await signHmacSha256Hex(secretKey, dataCheckString);
  const payloadHash = payload.hash.toLowerCase();

  if (!timingSafeEqualHex(computedHash, payloadHash)) {
    return null;
  }

  return {
    id: payload.id,
    firstName: payload.first_name,
    lastName: payload.last_name,
    username: payload.username,
    photoUrl: payload.photo_url,
    authDate: payload.auth_date
  };
}

function getTelegramDataCheckString(payload: TelegramAuthPayload): string {
  const fields: Record<string, string> = {
    id: payload.id,
    auth_date: String(payload.auth_date),
    first_name: payload.first_name
  };

  if (payload.last_name) {
    fields.last_name = payload.last_name;
  }
  if (payload.username) {
    fields.username = payload.username;
  }
  if (payload.photo_url) {
    fields.photo_url = payload.photo_url;
  }

  return Object.entries(fields)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, value]) => `${key}=${value}`)
    .join('\n');
}

async function issueAuthToken(user: AuthUser, secret: string): Promise<string> {
  const iat = Math.floor(Date.now() / 1000);
  const exp = iat + authTokenLifetimeSeconds;
  const payload = {
    sub: user.id,
    firstName: user.firstName,
    lastName: user.lastName,
    username: user.username,
    photoUrl: user.photoUrl,
    authDate: user.authDate,
    iat,
    exp
  };

  const encodedHeader = base64UrlEncodeText(JSON.stringify(tokenHeader));
  const encodedPayload = base64UrlEncodeText(JSON.stringify(payload));
  const data = `${encodedHeader}.${encodedPayload}`;
  const signature = await signHmacSha256(toArrayBuffer(textEncoder.encode(secret)), data);

  return `${data}.${base64UrlEncodeBytes(signature)}`;
}

async function verifyAuthToken(token: string, secret: string): Promise<AuthUser | null> {
  const parts = token.split('.');
  if (parts.length !== 3) {
    return null;
  }

  const [encodedHeader, encodedPayload, encodedSignature] = parts;
  const signatureBytes = base64UrlDecodeBytes(encodedSignature);
  if (!signatureBytes) {
    return null;
  }

  const data = `${encodedHeader}.${encodedPayload}`;
  const expectedSignature = await signHmacSha256(toArrayBuffer(textEncoder.encode(secret)), data);
  if (!timingSafeEqualBytes(signatureBytes, expectedSignature)) {
    return null;
  }

  const headerRaw = base64UrlDecodeText(encodedHeader);
  const payloadRaw = base64UrlDecodeText(encodedPayload);
  if (!headerRaw || !payloadRaw) {
    return null;
  }

  try {
    const header = JSON.parse(headerRaw) as { alg?: string; typ?: string };
    if (header.alg !== 'HS256' || header.typ !== 'JWT') {
      return null;
    }

    const decodedPayload = JSON.parse(payloadRaw) as {
      sub?: string;
      firstName?: string;
      lastName?: string;
      username?: string;
      photoUrl?: string;
      authDate?: number;
      exp?: number;
    };

    if (typeof decodedPayload.sub !== 'string' || typeof decodedPayload.firstName !== 'string') {
      return null;
    }

    if (typeof decodedPayload.exp !== 'number' || decodedPayload.exp <= Math.floor(Date.now() / 1000)) {
      return null;
    }

    return {
      id: decodedPayload.sub,
      firstName: decodedPayload.firstName,
      lastName: decodedPayload.lastName,
      username: decodedPayload.username,
      photoUrl: decodedPayload.photoUrl,
      authDate: typeof decodedPayload.authDate === 'number' ? decodedPayload.authDate : 0
    };
  } catch {
    return null;
  }
}

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
  const encoded = textEncoder.encode(value);
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

async function digestSha256(value: string): Promise<ArrayBuffer> {
  const digest = await crypto.subtle.digest('SHA-256', textEncoder.encode(value));
  return digest;
}

async function signHmacSha256Hex(key: ArrayBuffer, data: string): Promise<string> {
  const bytes = await signHmacSha256(key, data);
  return bytesToHex(bytes);
}

async function signHmacSha256(key: ArrayBuffer, data: string): Promise<Uint8Array> {
  const cryptoKey = await crypto.subtle.importKey('raw', key, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const signature = await crypto.subtle.sign('HMAC', cryptoKey, textEncoder.encode(data));
  return new Uint8Array(signature);
}

function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  const copy = new Uint8Array(bytes.length);
  copy.set(bytes);
  return copy.buffer;
}

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
}

function hexToBytes(value: string): Uint8Array | null {
  if (value.length % 2 !== 0) {
    return null;
  }

  const bytes = new Uint8Array(value.length / 2);
  for (let index = 0; index < value.length; index += 2) {
    const part = value.slice(index, index + 2);
    const parsed = Number.parseInt(part, 16);
    if (Number.isNaN(parsed)) {
      return null;
    }
    bytes[index / 2] = parsed;
  }
  return bytes;
}

function timingSafeEqualHex(left: string, right: string): boolean {
  const leftBytes = hexToBytes(left);
  const rightBytes = hexToBytes(right);
  if (!leftBytes || !rightBytes) {
    return false;
  }
  return timingSafeEqualBytes(leftBytes, rightBytes);
}

function timingSafeEqualBytes(left: Uint8Array, right: Uint8Array): boolean {
  if (left.length !== right.length) {
    return false;
  }

  let diff = 0;
  for (let index = 0; index < left.length; index += 1) {
    diff |= left[index] ^ right[index];
  }
  return diff === 0;
}

function base64UrlEncodeText(value: string): string {
  return base64UrlEncodeBytes(textEncoder.encode(value));
}

function base64UrlDecodeText(value: string): string | null {
  const bytes = base64UrlDecodeBytes(value);
  if (!bytes) {
    return null;
  }
  try {
    return new TextDecoder().decode(bytes);
  } catch {
    return null;
  }
}

function base64UrlEncodeBytes(bytes: Uint8Array): string {
  return bytesToBase64(bytes).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function base64UrlDecodeBytes(value: string): Uint8Array | null {
  const normalized = value.replace(/-/g, '+').replace(/_/g, '/');
  const paddingLength = (4 - (normalized.length % 4)) % 4;
  try {
    return base64ToBytes(`${normalized}${'='.repeat(paddingLength)}`);
  } catch {
    return null;
  }
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = '';
  for (let index = 0; index < bytes.length; index += 1) {
    binary += String.fromCharCode(bytes[index]);
  }
  return btoa(binary);
}

function base64ToBytes(value: string): Uint8Array {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
}
