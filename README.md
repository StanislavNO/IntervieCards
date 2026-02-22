# Unity Developer Interview Flashcards

Local full-stack app for studying Unity interview questions with CRUD editing.

## Stack

- Backend: Node.js + Express + TypeScript
- Frontend: React + TypeScript + Vite
- Storage: local file (`server/data/cards.json`), initialized from `server/data/seed-cards.json`
- Tests: Vitest + Supertest (API)

## Features

- 100 preloaded Unity interview flashcards
- Flip-card UI: question front / answer + citations back
- Real-time search (question + answer)
- Теги карточек: `C#`, `Математика`, `Rendering`, `ECS` + пользовательские теги
- Add / edit / delete cards
- Dark/light theme toggle with persistence in `localStorage`
- Responsive card grid for desktop/mobile

## Project Structure

- `server/` Express API and persistence layer
- `client/` React UI
- `server/data/seed-cards.json` initial dataset

## API

- `GET /api/cards`
- `GET /api/cards/:id`
- `POST /api/cards`
- `PUT /api/cards/:id`
- `DELETE /api/cards/:id`

Card shape:

```json
{
  "id": "uuid",
  "question": "string",
  "answer": "string",
  "sources": ["string"],
  "tags": ["string"],
  "createdAt": "ISO timestamp"
}
```

## Run Locally

```bash
npm install
npm run dev
```

- Frontend: `http://localhost:5173`
- Backend: `http://localhost:3001`

## Tests

```bash
npm test
```

## Notes

- On first server start, `server/data/cards.json` is generated automatically from seeds.
- CRUD writes are persisted to `server/data/cards.json`.

## Possible Next Enhancements

- Card categories and filters
- Import/export decks
- Spaced repetition scheduling
- Authentication and cloud sync
