import type { Card, CardPayload, CardSort, ReactionResponse, ReactionValue } from './types';

const apiBaseUrl = (import.meta.env.VITE_API_BASE_URL as string | undefined)?.trim().replace(/\/+$/, '') ?? '';

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

function withBase(path: string): string {
  if (!apiBaseUrl) {
    return path;
  }
  return `${apiBaseUrl}${path}`;
}

function withQuery(path: string, query?: Record<string, string | undefined>): string {
  if (!query) {
    return path;
  }

  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value) {
      params.set(key, value);
    }
  }

  const queryString = params.toString();
  if (!queryString) {
    return path;
  }

  return `${path}?${queryString}`;
}

export const cardsApi = {
  getAll: (sort?: CardSort) => request<Card[]>(withBase(withQuery('/api/cards', { sort }))),
  create: (payload: CardPayload) => request<Card>(withBase('/api/cards'), { method: 'POST', body: JSON.stringify(payload) }),
  update: (id: string, payload: CardPayload) =>
    request<Card>(withBase(`/api/cards/${id}`), { method: 'PUT', body: JSON.stringify(payload) }),
  remove: (id: string) => request<void>(withBase(`/api/cards/${id}`), { method: 'DELETE' }),
  react: (id: string, value: ReactionValue) =>
    request<ReactionResponse>(withBase(`/api/cards/${id}/reaction`), { method: 'POST', body: JSON.stringify({ value }) })
};
