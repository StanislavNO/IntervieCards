export type Difficulty = 'easy' | 'medium' | 'hard';
export type ReactionValue = -1 | 1;
export type UserReaction = ReactionValue | 0;

export type TelegramAuthPayload = {
  id: string;
  first_name: string;
  last_name?: string;
  username?: string;
  photo_url?: string;
  auth_date: number;
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

export type Card = {
  id: string;
  question: string;
  answer: string;
  sources: string[];
  tags: string[];
  difficulty: Difficulty;
  author: string;
  createdAt: string;
  likesCount: number;
  dislikesCount: number;
  score: number;
  userReaction: UserReaction;
};

export type NewCardInput = {
  question: string;
  answer: string;
  sources?: string[];
  tags?: string[];
  difficulty?: Difficulty;
  author?: string;
};

export type ReactionSummary = {
  cardId: string;
  likesCount: number;
  dislikesCount: number;
  score: number;
  userReaction: UserReaction;
};

export type UpdateCardInput = {
  question?: string;
  answer?: string;
  sources?: string[];
  tags?: string[];
  difficulty?: Difficulty;
};
