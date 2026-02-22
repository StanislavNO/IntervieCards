import { promises as fs } from 'node:fs';
import { Pool } from 'pg';
import { v4 as uuidv4, validate as uuidValidate } from 'uuid';
import { getDefaultCardsPath, getDefaultSeedPath, type CardRepository } from './repository.js';
import type { Card, Difficulty, NewCardInput, ReactionSummary, ReactionValue, UpdateCardInput } from './types.js';

type BootstrapCard = Partial<Card> & {
  question?: string;
  answer?: string;
};

type CardRow = {
  id: string;
  question: string;
  answer: string;
  sources: string[] | null;
  tags: string[] | null;
  difficulty: string;
  created_at: Date | string;
  likes_count: number | string;
  dislikes_count: number | string;
  score: number | string;
  user_reaction: number | string;
};

type PostgresRepositoryOptions = {
  cardsPath?: string;
  seedPath?: string;
  ssl?: boolean;
};

const allowedDifficulties = new Set<Difficulty>(['easy', 'medium', 'hard']);

export class PostgresCardRepository implements CardRepository {
  private readonly pool: Pool;
  private readonly cardsPath: string;
  private readonly seedPath: string;

  constructor(databaseUrl: string, options: PostgresRepositoryOptions = {}) {
    this.cardsPath = options.cardsPath ?? getDefaultCardsPath();
    this.seedPath = options.seedPath ?? getDefaultSeedPath();
    this.pool = new Pool({
      connectionString: databaseUrl,
      ssl: options.ssl ? { rejectUnauthorized: false } : undefined
    });
  }

  async init(): Promise<void> {
    await this.pool.query(`
      CREATE TABLE IF NOT EXISTS cards (
        id UUID PRIMARY KEY,
        question TEXT NOT NULL,
        answer TEXT NOT NULL,
        sources TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
        tags TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
        difficulty TEXT NOT NULL DEFAULT 'easy' CHECK (difficulty IN ('easy', 'medium', 'hard')),
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        likes_count INTEGER NOT NULL DEFAULT 0,
        dislikes_count INTEGER NOT NULL DEFAULT 0,
        score INTEGER NOT NULL DEFAULT 0,
        user_reaction SMALLINT NOT NULL DEFAULT 0 CHECK (user_reaction IN (-1, 0, 1))
      )
    `);

    await this.pool.query(`ALTER TABLE cards ADD COLUMN IF NOT EXISTS likes_count INTEGER NOT NULL DEFAULT 0`);
    await this.pool.query(`ALTER TABLE cards ADD COLUMN IF NOT EXISTS dislikes_count INTEGER NOT NULL DEFAULT 0`);
    await this.pool.query(`ALTER TABLE cards ADD COLUMN IF NOT EXISTS score INTEGER NOT NULL DEFAULT 0`);
    await this.pool.query(
      `ALTER TABLE cards ADD COLUMN IF NOT EXISTS user_reaction SMALLINT NOT NULL DEFAULT 0 CHECK (user_reaction IN (-1, 0, 1))`
    );
    await this.pool.query(`UPDATE cards SET score = likes_count - dislikes_count WHERE score <> likes_count - dislikes_count`);

    await this.pool.query(`CREATE INDEX IF NOT EXISTS idx_cards_created_at ON cards (created_at DESC)`);

    const countResult = await this.pool.query<{ count: string }>('SELECT COUNT(*)::TEXT AS count FROM cards');
    const count = Number.parseInt(countResult.rows[0]?.count ?? '0', 10);
    if (count > 0) {
      return;
    }

    const bootstrapCards = await this.loadBootstrapCards();
    if (bootstrapCards.length === 0) {
      return;
    }

    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');

      for (const card of bootstrapCards) {
        await client.query(
          `
          INSERT INTO cards (id, question, answer, sources, tags, difficulty, created_at, likes_count, dislikes_count, score, user_reaction)
          VALUES ($1, $2, $3, $4::TEXT[], $5::TEXT[], $6, $7::TIMESTAMPTZ, $8, $9, $10, $11)
          `,
          [
            card.id,
            card.question,
            card.answer,
            card.sources,
            card.tags,
            card.difficulty,
            card.createdAt,
            card.likesCount,
            card.dislikesCount,
            card.score,
            card.userReaction
          ]
        );
      }

      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  async getAll(): Promise<Card[]> {
    const result = await this.pool.query<CardRow>(
      `
      SELECT id, question, answer, sources, tags, difficulty, created_at, likes_count, dislikes_count, score, user_reaction
      FROM cards
      ORDER BY created_at DESC
      `
    );
    return result.rows.map((row) => this.mapRow(row));
  }

  async getById(id: string): Promise<Card | null> {
    const result = await this.pool.query<CardRow>(
      `
      SELECT id, question, answer, sources, tags, difficulty, created_at, likes_count, dislikes_count, score, user_reaction
      FROM cards
      WHERE id = $1
      `,
      [id]
    );

    if (result.rows.length === 0) {
      return null;
    }

    return this.mapRow(result.rows[0]);
  }

  async create(input: NewCardInput): Promise<Card> {
    const createdAt = new Date().toISOString();
    const card: Card = {
      id: uuidv4(),
      question: input.question,
      answer: input.answer,
      sources: this.normalizeStringArray(input.sources),
      tags: this.normalizeStringArray(input.tags),
      difficulty: this.normalizeDifficulty(input.difficulty),
      createdAt,
      likesCount: 0,
      dislikesCount: 0,
      score: 0,
      userReaction: 0
    };

    await this.pool.query(
      `
      INSERT INTO cards (id, question, answer, sources, tags, difficulty, created_at, likes_count, dislikes_count, score, user_reaction)
      VALUES ($1, $2, $3, $4::TEXT[], $5::TEXT[], $6, $7::TIMESTAMPTZ, $8, $9, $10, $11)
      `,
      [
        card.id,
        card.question,
        card.answer,
        card.sources,
        card.tags,
        card.difficulty,
        card.createdAt,
        card.likesCount,
        card.dislikesCount,
        card.score,
        card.userReaction
      ]
    );

    return card;
  }

  async update(id: string, input: UpdateCardInput): Promise<Card | null> {
    const current = await this.getById(id);
    if (!current) {
      return null;
    }

    const updated: Card = {
      ...current,
      ...input,
      sources: input.sources ? this.normalizeStringArray(input.sources) : current.sources,
      tags: input.tags ? this.normalizeStringArray(input.tags) : current.tags,
      difficulty: input.difficulty ? this.normalizeDifficulty(input.difficulty) : current.difficulty
    };

    await this.pool.query(
      `
      UPDATE cards
      SET question = $2,
          answer = $3,
          sources = $4::TEXT[],
          tags = $5::TEXT[],
          difficulty = $6
      WHERE id = $1
      `,
      [id, updated.question, updated.answer, updated.sources, updated.tags, updated.difficulty]
    );

    return updated;
  }

  async remove(id: string): Promise<boolean> {
    const result = await this.pool.query('DELETE FROM cards WHERE id = $1', [id]);
    return (result.rowCount ?? 0) > 0;
  }

  async react(id: string, value: ReactionValue): Promise<ReactionSummary | null> {
    const current = await this.getById(id);
    if (!current) {
      return null;
    }

    const previous = current.userReaction ?? 0;
    let likesCount = Math.max(0, current.likesCount ?? 0);
    let dislikesCount = Math.max(0, current.dislikesCount ?? 0);
    let userReaction: -1 | 0 | 1 = previous;

    if (previous === value) {
      userReaction = 0;
      if (value === 1) {
        likesCount = Math.max(0, likesCount - 1);
      } else {
        dislikesCount = Math.max(0, dislikesCount - 1);
      }
    } else {
      if (previous === 1) {
        likesCount = Math.max(0, likesCount - 1);
      } else if (previous === -1) {
        dislikesCount = Math.max(0, dislikesCount - 1);
      }

      if (value === 1) {
        likesCount += 1;
      } else {
        dislikesCount += 1;
      }
      userReaction = value;
    }

    const score = likesCount - dislikesCount;
    await this.pool.query(
      `
      UPDATE cards
      SET likes_count = $2,
          dislikes_count = $3,
          score = $4,
          user_reaction = $5
      WHERE id = $1
      `,
      [id, likesCount, dislikesCount, score, userReaction]
    );

    return {
      cardId: id,
      likesCount,
      dislikesCount,
      score,
      userReaction
    };
  }

  private async loadBootstrapCards(): Promise<Card[]> {
    const cardsFromFile = await this.readCardsFile(this.cardsPath);
    if (cardsFromFile.length > 0) {
      return cardsFromFile;
    }

    return this.readCardsFile(this.seedPath);
  }

  private async readCardsFile(filePath: string): Promise<Card[]> {
    try {
      const raw = await fs.readFile(filePath, 'utf8');
      const parsed = JSON.parse(raw);

      if (!Array.isArray(parsed)) {
        return [];
      }

      return parsed
        .map((entry) => this.normalizeCard(entry as BootstrapCard))
        .filter((entry): entry is Card => entry !== null);
    } catch {
      return [];
    }
  }

  private normalizeCard(card: BootstrapCard): Card | null {
    const question = typeof card.question === 'string' ? card.question.trim() : '';
    const answer = typeof card.answer === 'string' ? card.answer.trim() : '';
    if (!question || !answer) {
      return null;
    }

    const likesCount = this.toPositiveInt(card.likesCount);
    const dislikesCount = this.toPositiveInt(card.dislikesCount);

    return {
      id: typeof card.id === 'string' && uuidValidate(card.id) ? card.id : uuidv4(),
      question,
      answer,
      sources: this.normalizeStringArray(card.sources),
      tags: this.normalizeStringArray(card.tags),
      difficulty: this.normalizeDifficulty(card.difficulty),
      createdAt: this.normalizeDate(card.createdAt),
      likesCount,
      dislikesCount,
      score: likesCount - dislikesCount,
      userReaction: this.normalizeUserReaction(card.userReaction)
    };
  }

  private normalizeDate(value: unknown): string {
    if (typeof value !== 'string') {
      return new Date().toISOString();
    }

    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? new Date().toISOString() : parsed.toISOString();
  }

  private normalizeDifficulty(value: unknown): Difficulty {
    return typeof value === 'string' && allowedDifficulties.has(value as Difficulty) ? (value as Difficulty) : 'easy';
  }

  private normalizeStringArray(values: unknown): string[] {
    if (!Array.isArray(values)) {
      return [];
    }

    const unique = new Set<string>();
    for (const value of values) {
      if (typeof value !== 'string') {
        continue;
      }

      const trimmed = value.trim();
      if (!trimmed) {
        continue;
      }

      unique.add(trimmed);
    }

    return Array.from(unique);
  }

  private mapRow(row: CardRow): Card {
    const likesCount = this.toPositiveInt(row.likes_count);
    const dislikesCount = this.toPositiveInt(row.dislikes_count);

    return {
      id: row.id,
      question: row.question,
      answer: row.answer,
      sources: Array.isArray(row.sources) ? row.sources : [],
      tags: Array.isArray(row.tags) ? row.tags : [],
      difficulty: this.normalizeDifficulty(row.difficulty),
      createdAt: new Date(row.created_at).toISOString(),
      likesCount,
      dislikesCount,
      score: likesCount - dislikesCount,
      userReaction: this.normalizeUserReaction(row.user_reaction)
    };
  }

  private toInt(value: unknown): number {
    const parsed =
      typeof value === 'number' ? value : typeof value === 'string' ? Number.parseInt(value, 10) : Number.NaN;
    return Number.isFinite(parsed) ? parsed : 0;
  }

  private toPositiveInt(value: unknown): number {
    return Math.max(0, this.toInt(value));
  }

  private normalizeUserReaction(value: unknown): -1 | 0 | 1 {
    const parsed = this.toInt(value);
    return parsed === -1 || parsed === 1 ? parsed : 0;
  }
}
