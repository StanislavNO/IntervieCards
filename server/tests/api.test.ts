import crypto from 'node:crypto';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import { FileCardRepository } from '../src/repository.js';

const seedCards = [
  {
    question: 'Q1',
    answer: 'A1',
    sources: ['https://docs.unity3d.com'],
    tags: ['C#']
  },
  {
    question: 'Q2',
    answer: 'A2',
    sources: []
  }
];

const botToken = 'test-telegram-bot-token';

type TelegramPayload = {
  id: string;
  first_name: string;
  last_name?: string;
  username?: string;
  photo_url?: string;
  auth_date: number;
  hash: string;
};

type TelegramPayloadInput = Omit<TelegramPayload, 'hash'>;

function buildTelegramPayload(overrides: Partial<TelegramPayloadInput> = {}): TelegramPayload {
  const payload: TelegramPayloadInput = {
    id: '99887766',
    first_name: 'Stanislav',
    last_name: 'NO',
    username: 'stanislav_no',
    auth_date: Math.floor(Date.now() / 1000),
    ...overrides
  };

  const dataCheckString = Object.entries(payload)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, value]) => `${key}=${value}`)
    .join('\n');

  const secretKey = crypto.createHash('sha256').update(botToken).digest();
  const hash = crypto.createHmac('sha256', secretKey).update(dataCheckString).digest('hex');

  return {
    ...payload,
    hash
  };
}

async function loginAndGetToken(app: ReturnType<typeof createApp>, overrides: Partial<TelegramPayloadInput> = {}): Promise<string> {
  const payload = buildTelegramPayload(overrides);
  const response = await request(app).post('/api/auth/telegram').send(payload);
  expect(response.status).toBe(200);
  return response.body.token as string;
}

describe('cards api', () => {
  let app: ReturnType<typeof createApp>;

  beforeEach(async () => {
    process.env.TELEGRAM_BOT_TOKEN = botToken;
    process.env.AUTH_SECRET = 'test-auth-secret';

    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'cards-api-'));
    const cardsPath = path.join(tempDir, 'cards.json');
    const seedPath = path.join(tempDir, 'seed-cards.json');

    await fs.writeFile(seedPath, JSON.stringify(seedCards), 'utf8');

    const repository = new FileCardRepository(cardsPath, seedPath);
    await repository.init();
    app = createApp(repository);
  });

  it('returns initial cards', async () => {
    const response = await request(app).get('/api/cards');

    expect(response.status).toBe(200);
    expect(response.body).toHaveLength(2);
    expect(response.body[0]).toHaveProperty('id');
    expect(response.body[0].tags).toEqual(expect.any(Array));
    expect(response.body[0].difficulty).toEqual(expect.any(String));
    expect(response.body[0].author).toBe('stanislavnur');
  });

  it('creates a card', async () => {
    const token = await loginAndGetToken(app);

    const createResponse = await request(app)
      .post('/api/cards')
      .set('Authorization', `Bearer ${token}`)
      .send({
        question: 'New question',
        answer: 'New answer',
        sources: ['src1'],
        tags: ['ECS', 'C#']
      });

    expect(createResponse.status).toBe(201);
    expect(createResponse.body.question).toBe('New question');
    expect(createResponse.body.tags).toEqual(['ECS', 'C#']);
    expect(createResponse.body.difficulty).toBe('easy');
    expect(createResponse.body.author).toBe('stanislav_no');

    const listResponse = await request(app).get('/api/cards');
    expect(listResponse.body).toHaveLength(3);
  });

  it('updates a card', async () => {
    const token = await loginAndGetToken(app, { username: 'stanislavnur' });
    const listResponse = await request(app).get('/api/cards');
    const cardId = listResponse.body[0].id as string;

    const updateResponse = await request(app)
      .put(`/api/cards/${cardId}`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        question: 'Updated',
        answer: 'Updated answer',
        sources: ['src2'],
        tags: ['Rendering'],
        difficulty: 'hard'
      });

    expect(updateResponse.status).toBe(200);
    expect(updateResponse.body.question).toBe('Updated');
    expect(updateResponse.body.tags).toEqual(['Rendering']);
    expect(updateResponse.body.difficulty).toBe('hard');
  });

  it('deletes a card', async () => {
    const token = await loginAndGetToken(app, { username: 'stanislavnur' });
    const listResponse = await request(app).get('/api/cards');
    const cardId = listResponse.body[0].id as string;

    const deleteResponse = await request(app).delete(`/api/cards/${cardId}`).set('Authorization', `Bearer ${token}`);
    expect(deleteResponse.status).toBe(204);

    const nextList = await request(app).get('/api/cards');
    expect(nextList.body).toHaveLength(1);
  });

  it('returns 403 when non-owner tries to delete a card', async () => {
    const token = await loginAndGetToken(app, { username: 'another_user' });
    const listResponse = await request(app).get('/api/cards');
    const cardId = listResponse.body[0].id as string;

    const deleteResponse = await request(app).delete(`/api/cards/${cardId}`).set('Authorization', `Bearer ${token}`);
    expect(deleteResponse.status).toBe(403);
  });

  it('returns 403 when non-owner tries to remove tags', async () => {
    const token = await loginAndGetToken(app, { username: 'another_user' });
    const listResponse = await request(app).get('/api/cards');
    const cardWithTags = (listResponse.body as Array<{ id: string; tags: string[] }>).find((card) => card.tags.length > 0);
    expect(cardWithTags).toBeDefined();

    const updateResponse = await request(app)
      .put(`/api/cards/${cardWithTags!.id}`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        question: 'Updated',
        answer: 'Updated answer',
        sources: ['src2'],
        tags: [],
        difficulty: 'hard'
      });

    expect(updateResponse.status).toBe(403);
  });

  it('returns 404 for missing card', async () => {
    const response = await request(app).get('/api/cards/not-found');
    expect(response.status).toBe(404);
  });

  it('updates card reactions and score', async () => {
    const token = await loginAndGetToken(app);
    const listResponse = await request(app).get('/api/cards');
    const cardId = listResponse.body[0].id as string;

    const likeResponse = await request(app)
      .post(`/api/cards/${cardId}/reaction`)
      .set('Authorization', `Bearer ${token}`)
      .send({ value: 1 });
    expect(likeResponse.status).toBe(200);
    expect(likeResponse.body).toMatchObject({
      cardId,
      likesCount: 1,
      dislikesCount: 0,
      score: 1,
      userReaction: 1
    });

    const unlikeResponse = await request(app)
      .post(`/api/cards/${cardId}/reaction`)
      .set('Authorization', `Bearer ${token}`)
      .send({ value: 1 });
    expect(unlikeResponse.status).toBe(200);
    expect(unlikeResponse.body).toMatchObject({
      cardId,
      likesCount: 0,
      dislikesCount: 0,
      score: 0,
      userReaction: 0
    });

    const dislikeResponse = await request(app)
      .post(`/api/cards/${cardId}/reaction`)
      .set('Authorization', `Bearer ${token}`)
      .send({ value: -1 });
    expect(dislikeResponse.status).toBe(200);
    expect(dislikeResponse.body).toMatchObject({
      cardId,
      likesCount: 0,
      dislikesCount: 1,
      score: -1,
      userReaction: -1
    });

    const cardResponse = await request(app).get(`/api/cards/${cardId}`);
    expect(cardResponse.status).toBe(200);
    expect(cardResponse.body.likesCount).toBe(0);
    expect(cardResponse.body.dislikesCount).toBe(1);
    expect(cardResponse.body.score).toBe(-1);
    expect(cardResponse.body.userReaction).toBe(-1);
  });

  it('returns 400 for invalid create payload', async () => {
    const token = await loginAndGetToken(app);
    const response = await request(app)
      .post('/api/cards')
      .set('Authorization', `Bearer ${token}`)
      .send({
        question: '',
        answer: ''
      });

    expect(response.status).toBe(400);
  });

  it('logs in via telegram and returns current user', async () => {
    const payload = buildTelegramPayload();

    const loginResponse = await request(app).post('/api/auth/telegram').send(payload);
    expect(loginResponse.status).toBe(200);
    expect(loginResponse.body).toHaveProperty('token');
    expect(loginResponse.body.user).toMatchObject({
      id: payload.id,
      username: payload.username,
      firstName: payload.first_name
    });

    const meResponse = await request(app).get('/api/auth/me').set('Authorization', `Bearer ${loginResponse.body.token}`);
    expect(meResponse.status).toBe(200);
    expect(meResponse.body.user).toMatchObject({
      id: payload.id,
      username: payload.username,
      firstName: payload.first_name
    });
  });

  it('returns 401 on /api/auth/me without token', async () => {
    const response = await request(app).get('/api/auth/me');
    expect(response.status).toBe(401);
  });

  it('returns 401 when creating card without auth token', async () => {
    const response = await request(app).post('/api/cards').send({
      question: 'Q',
      answer: 'A'
    });
    expect(response.status).toBe(401);
  });

  it('returns 401 when self-presentation generation is called without auth', async () => {
    const response = await request(app).post('/api/self-presentation/generate').send({
      data: {},
      settings: { duration: 90 }
    });

    expect(response.status).toBe(401);
  });

  it('returns 501 placeholder response for self-presentation generation', async () => {
    const token = await loginAndGetToken(app);
    const response = await request(app)
      .post('/api/self-presentation/generate')
      .set('Authorization', `Bearer ${token}`)
      .send({
        data: {
          profile: { name: 'Stanislav', targetLevel: 'Middle' },
          jobs: []
        },
        settings: { duration: 120 }
      });

    expect(response.status).toBe(501);
    expect(response.body).toMatchObject({
      ok: false,
      upgradeRequired: true
    });
  });

  it('returns 400 for invalid self-presentation generation payload', async () => {
    const token = await loginAndGetToken(app);
    const response = await request(app)
      .post('/api/self-presentation/generate')
      .set('Authorization', `Bearer ${token}`)
      .send({
        data: {},
        settings: { duration: 999 }
      });

    expect(response.status).toBe(400);
  });
});
