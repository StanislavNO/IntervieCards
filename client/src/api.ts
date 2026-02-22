import type { Card, CardPayload } from './types';

async function request<T>(input: RequestInfo | URL, init?: RequestInit): Promise<T> {
  const response = await fetch(input, {
    headers: {
      'Content-Type': 'application/json'
    },
    ...init
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(text || `Request failed: ${response.status}`);
  }

  if (response.status === 204) {
    return undefined as T;
  }

  return (await response.json()) as T;
}

export const cardsApi = {
  getAll: () => request<Card[]>('/api/cards'),
  create: (payload: CardPayload) => request<Card>('/api/cards', { method: 'POST', body: JSON.stringify(payload) }),
  update: (id: string, payload: CardPayload) =>
    request<Card>(`/api/cards/${id}`, { method: 'PUT', body: JSON.stringify(payload) }),
  remove: (id: string) => request<void>(`/api/cards/${id}`, { method: 'DELETE' })
};
