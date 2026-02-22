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
  author: string;
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

export type TelegramAuthPayload = {
  id: string | number;
  first_name: string;
  last_name?: string;
  username?: string;
  photo_url?: string;
  auth_date: string | number;
  hash: string;
};

export type AuthUser = {
  id: string;
  firstName: string;
  lastName?: string;
  username?: string;
  photoUrl?: string;
  authDate: number;
};

export type AuthSession = {
  token: string;
  user: AuthUser;
};
