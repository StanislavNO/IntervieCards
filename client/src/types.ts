export type Card = {
  id: string;
  question: string;
  answer: string;
  sources: string[];
  tags: string[];
  createdAt: string;
};

export type CardPayload = {
  question: string;
  answer: string;
  sources: string[];
  tags: string[];
};
