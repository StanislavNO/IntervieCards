import cors from 'cors';
import express from 'express';
import { ZodError } from 'zod';
import type { CardRepository } from './repository.js';
import { createCardSchema, updateCardSchema } from './validation.js';

export function createApp(repository: CardRepository) {
  const app = express();

  app.use(cors());
  app.use(express.json({ limit: '1mb' }));

  app.get('/api/health', (_req, res) => {
    res.json({ ok: true });
  });

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
      const card = await repository.getById(req.params.id);
      if (!card) {
        return res.status(404).json({ error: 'Card not found' });
      }
      return res.json(card);
    } catch (error) {
      return next(error);
    }
  });

  app.post('/api/cards', async (req, res, next) => {
    try {
      const parsed = createCardSchema.parse(req.body);
      const card = await repository.create(parsed);
      res.status(201).json(card);
    } catch (error) {
      next(error);
    }
  });

  app.put('/api/cards/:id', async (req, res, next) => {
    try {
      const parsed = updateCardSchema.parse(req.body);
      const card = await repository.update(req.params.id, parsed);

      if (!card) {
        return res.status(404).json({ error: 'Card not found' });
      }

      return res.json(card);
    } catch (error) {
      return next(error);
    }
  });

  app.delete('/api/cards/:id', async (req, res, next) => {
    try {
      const removed = await repository.remove(req.params.id);
      if (!removed) {
        return res.status(404).json({ error: 'Card not found' });
      }

      return res.status(204).send();
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
