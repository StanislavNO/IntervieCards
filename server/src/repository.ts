import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { v4 as uuidv4 } from 'uuid';
import type { Card, NewCardInput, UpdateCardInput } from './types.js';

export interface CardRepository {
  getAll(): Promise<Card[]>;
  getById(id: string): Promise<Card | null>;
  create(input: NewCardInput): Promise<Card>;
  update(id: string, input: UpdateCardInput): Promise<Card | null>;
  remove(id: string): Promise<boolean>;
}

type SeedCard = {
  question: string;
  answer: string;
  sources?: string[];
  tags?: string[];
};

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const defaultDataDir = path.resolve(__dirname, '../data');

export function getDefaultCardsPath(): string {
  return path.join(defaultDataDir, 'cards.json');
}

export function getDefaultSeedPath(): string {
  return path.join(defaultDataDir, 'seed-cards.json');
}

export class FileCardRepository implements CardRepository {
  private readonly cardsPath: string;
  private readonly seedPath: string;
  private cards: Card[] = [];
  private writeQueue: Promise<void> = Promise.resolve();

  constructor(cardsPath = getDefaultCardsPath(), seedPath = getDefaultSeedPath()) {
    this.cardsPath = cardsPath;
    this.seedPath = seedPath;
  }

  async init(): Promise<void> {
    await fs.mkdir(path.dirname(this.cardsPath), { recursive: true });

    try {
      const raw = await fs.readFile(this.cardsPath, 'utf8');
      const parsed = JSON.parse(raw) as Partial<Card>[];
      this.cards = parsed.map((card) => this.normalizeCard(card));
      return;
    } catch {
      // cards file is missing or malformed, bootstrap from seeds
    }

    const seedRaw = await fs.readFile(this.seedPath, 'utf8');
    const seedCards = JSON.parse(seedRaw) as SeedCard[];
    const now = new Date().toISOString();

    this.cards = seedCards.map((seed) => ({
      id: uuidv4(),
      question: seed.question,
      answer: seed.answer,
      sources: seed.sources ?? [],
      tags: seed.tags ?? [],
      createdAt: now
    }));

    await this.persist();
  }

  async getAll(): Promise<Card[]> {
    return [...this.cards];
  }

  async getById(id: string): Promise<Card | null> {
    return this.cards.find((card) => card.id === id) ?? null;
  }

  async create(input: NewCardInput): Promise<Card> {
    const card: Card = {
      id: uuidv4(),
      question: input.question,
      answer: input.answer,
      sources: input.sources ?? [],
      tags: input.tags ?? [],
      createdAt: new Date().toISOString()
    };

    this.cards.unshift(card);
    await this.persist();
    return card;
  }

  async update(id: string, input: UpdateCardInput): Promise<Card | null> {
    const index = this.cards.findIndex((card) => card.id === id);
    if (index === -1) {
      return null;
    }

    const current = this.cards[index];
    const updated: Card = {
      ...current,
      ...input,
      sources: input.sources ?? current.sources,
      tags: input.tags ?? current.tags
    };

    this.cards[index] = updated;
    await this.persist();
    return updated;
  }

  async remove(id: string): Promise<boolean> {
    const nextCards = this.cards.filter((card) => card.id !== id);
    if (nextCards.length === this.cards.length) {
      return false;
    }

    this.cards = nextCards;
    await this.persist();
    return true;
  }

  private async persist(): Promise<void> {
    this.writeQueue = this.writeQueue
      .catch(() => undefined)
      .then(() => fs.writeFile(this.cardsPath, `${JSON.stringify(this.cards, null, 2)}\n`, 'utf8'));
    await this.writeQueue;
  }

  private normalizeCard(card: Partial<Card>): Card {
    return {
      id: card.id ?? uuidv4(),
      question: card.question ?? '',
      answer: card.answer ?? '',
      sources: Array.isArray(card.sources) ? card.sources : [],
      tags: Array.isArray(card.tags) ? card.tags : [],
      createdAt: card.createdAt ?? new Date().toISOString()
    };
  }
}
