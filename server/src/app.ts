import cors from 'cors';
import express from 'express';
import { ZodError } from 'zod';
import { issueAuthToken, parseBearerToken, resolveAuthSecret, verifyAuthToken, verifyTelegramAuthPayload } from './auth.js';
import type { CardRepository } from './repository.js';
import type { AuthUser } from './types.js';
import { createCardSchema, reactCardSchema, telegramAuthSchema, updateCardSchema } from './validation.js';

const ownerUsername = 'stanislavnur';

export function createApp(repository: CardRepository) {
  const app = express();

  app.use(cors());
  app.use(express.json({ limit: '1mb' }));

  app.get('/api/health', (_req, res) => {
    res.json({ ok: true });
  });

  app.post('/api/auth/telegram', async (req, res, next) => {
    try {
      const botToken = process.env.TELEGRAM_BOT_TOKEN?.trim();
      if (!botToken) {
        return res.status(503).json({ error: 'Telegram auth is not configured on server' });
      }

      const parsed = telegramAuthSchema.parse(req.body);
      const user = verifyTelegramAuthPayload(parsed, botToken);
      if (!user) {
        return res.status(401).json({ error: 'Invalid Telegram auth payload' });
      }

      const token = issueAuthToken(user, resolveAuthSecret());
      return res.json({ token, user });
    } catch (error) {
      return next(error);
    }
  });

  app.get('/api/auth/me', (req, res) => {
    const token = parseBearerToken(req.header('authorization'));
    if (!token) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const user = verifyAuthToken(token, resolveAuthSecret());
    if (!user) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    return res.json({ user });
  });

  app.post('/api/auth/logout', (_req, res) => {
    res.status(204).send();
  });

  function requireAuth(req: express.Request, res: express.Response, next: express.NextFunction) {
    const botTokenConfigured = Boolean(process.env.TELEGRAM_BOT_TOKEN?.trim());
    if (!botTokenConfigured) {
      return next();
    }

    const token = parseBearerToken(req.header('authorization'));
    if (!token) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const user = verifyAuthToken(token, resolveAuthSecret());
    if (!user) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    res.locals.authUser = user;
    return next();
  }

  function resolveCardAuthor(user: AuthUser | undefined): string {
    if (!user) {
      return 'stanislavnur';
    }

    const candidates = [user.username, [user.firstName, user.lastName].filter(Boolean).join(' '), user.id];
    for (const candidate of candidates) {
      if (typeof candidate === 'string' && candidate.trim().length > 0) {
        return candidate.trim();
      }
    }

    return 'stanislavnur';
  }

  function normalizeTag(tag: string): string {
    return tag.trim().toLowerCase();
  }

  function hasRemovedTags(previousTags: string[], nextTags: string[]): boolean {
    const nextSet = new Set(nextTags.map(normalizeTag));
    return previousTags.some((tag) => !nextSet.has(normalizeTag(tag)));
  }

  function isOwnerUser(user: AuthUser | undefined): boolean {
    return (user?.username ?? '').trim().toLowerCase() === ownerUsername;
  }

  function getRouteId(req: express.Request): string {
    const rawId = req.params.id;
    return Array.isArray(rawId) ? rawId[0] ?? '' : rawId;
  }

  app.get('/api/cards', async (_req, res, next) => {
    try {
      const cards = await repository.getAll();
      res.json(cards);
    } catch (error) {
      next(error);
    }
  });

  app.get('/api/cards/:id', async (req, res, next) => {
    try {
      const card = await repository.getById(getRouteId(req));
      if (!card) {
        return res.status(404).json({ error: 'Card not found' });
      }
      return res.json(card);
    } catch (error) {
      return next(error);
    }
  });

  app.post('/api/cards', requireAuth, async (req, res, next) => {
    try {
      const parsed = createCardSchema.parse(req.body);
      const author = resolveCardAuthor(res.locals.authUser as AuthUser | undefined);
      const card = await repository.create({ ...parsed, author });
      res.status(201).json(card);
    } catch (error) {
      next(error);
    }
  });

  app.put('/api/cards/:id', requireAuth, async (req, res, next) => {
    try {
      const id = getRouteId(req);
      const parsed = updateCardSchema.parse(req.body);
      const current = await repository.getById(id);
      if (!current) {
        return res.status(404).json({ error: 'Card not found' });
      }

      const authUser = res.locals.authUser as AuthUser | undefined;
      if (parsed.tags && hasRemovedTags(current.tags, parsed.tags) && !isOwnerUser(authUser)) {
        return res.status(403).json({ error: 'Only stanislavnur can delete tags' });
      }

      const card = await repository.update(id, parsed);

      if (!card) {
        return res.status(404).json({ error: 'Card not found' });
      }

      return res.json(card);
    } catch (error) {
      return next(error);
    }
  });

  app.delete('/api/cards/:id', requireAuth, async (req, res, next) => {
    try {
      const authUser = res.locals.authUser as AuthUser | undefined;
      if (!isOwnerUser(authUser)) {
        return res.status(403).json({ error: 'Only stanislavnur can delete cards' });
      }

      const removed = await repository.remove(getRouteId(req));
      if (!removed) {
        return res.status(404).json({ error: 'Card not found' });
      }

      return res.status(204).send();
    } catch (error) {
      return next(error);
    }
  });

  app.post('/api/cards/:id/reaction', requireAuth, async (req, res, next) => {
    try {
      const parsed = reactCardSchema.parse(req.body);
      const summary = await repository.react(getRouteId(req), parsed.value);
      if (!summary) {
        return res.status(404).json({ error: 'Card not found' });
      }
      return res.json(summary);
    } catch (error) {
      return next(error);
    }
  });

  app.use((error: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    if (error instanceof ZodError) {
      return res.status(400).json({ error: 'Validation error', details: error.issues });
    }

    return res.status(500).json({ error: 'Internal server error' });
  });

  return app;
}
