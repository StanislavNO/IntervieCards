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

describe('cards api', () => {
  let app: ReturnType<typeof createApp>;

  beforeEach(async () => {
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
  });

  it('creates a card', async () => {
    const createResponse = await request(app).post('/api/cards').send({
      question: 'New question',
      answer: 'New answer',
      sources: ['src1'],
      tags: ['ECS', 'C#']
    });

    expect(createResponse.status).toBe(201);
    expect(createResponse.body.question).toBe('New question');
    expect(createResponse.body.tags).toEqual(['ECS', 'C#']);

    const listResponse = await request(app).get('/api/cards');
    expect(listResponse.body).toHaveLength(3);
  });

  it('updates a card', async () => {
    const listResponse = await request(app).get('/api/cards');
    const cardId = listResponse.body[0].id as string;

    const updateResponse = await request(app).put(`/api/cards/${cardId}`).send({
      question: 'Updated',
      answer: 'Updated answer',
      sources: ['src2'],
      tags: ['Rendering']
    });

    expect(updateResponse.status).toBe(200);
    expect(updateResponse.body.question).toBe('Updated');
    expect(updateResponse.body.tags).toEqual(['Rendering']);
  });

  it('deletes a card', async () => {
    const listResponse = await request(app).get('/api/cards');
    const cardId = listResponse.body[0].id as string;

    const deleteResponse = await request(app).delete(`/api/cards/${cardId}`);
    expect(deleteResponse.status).toBe(204);

    const nextList = await request(app).get('/api/cards');
    expect(nextList.body).toHaveLength(1);
  });

  it('returns 404 for missing card', async () => {
    const response = await request(app).get('/api/cards/not-found');
    expect(response.status).toBe(404);
  });

  it('returns 400 for invalid create payload', async () => {
    const response = await request(app).post('/api/cards').send({
      question: '',
      answer: ''
    });

    expect(response.status).toBe(400);
  });
});
