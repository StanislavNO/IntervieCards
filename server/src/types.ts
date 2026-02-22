export type Card = {
  id: string;
  question: string;
  answer: string;
  sources: string[];
  tags: string[];
  createdAt: string;
};

export type NewCardInput = {
  question: string;
  answer: string;
  sources?: string[];
  tags?: string[];
};

export type UpdateCardInput = {
  question?: string;
  answer?: string;
  sources?: string[];
  tags?: string[];
};
