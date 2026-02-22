export type Difficulty = 'easy' | 'medium' | 'hard';
export type ReactionValue = -1 | 1;
export type CardSort = 'new' | 'popular';

export type Card = {
  id: string;
  question: string;
  answer: string;
  sources: string[];
  tags: string[];
  difficulty: Difficulty;
  createdAt: string;
  updatedAt?: string;
  likesCount?: number;
  dislikesCount?: number;
  score?: number;
  userReaction?: ReactionValue | 0;
};

export type CardPayload = {
  question: string;
  answer: string;
  sources: string[];
  tags: string[];
  difficulty: Difficulty;
};

export type ReactionResponse = {
  cardId: string;
  likesCount: number;
  dislikesCount: number;
  score: number;
  userReaction: ReactionValue | 0;
};
