# Unity Developer Interview Flashcards

Local full-stack app for studying Unity interview questions with CRUD editing.

## Stack

- Backend: Node.js + Express + TypeScript
- Frontend: React + TypeScript + Vite
- Storage:
  - PostgreSQL (if `DATABASE_URL` is set)
  - local file fallback (`server/data/cards.json`)
- Cloudflare stack (new): Hono Worker + D1 + Pages
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
- `GET /api/cards?sort=popular`
- `GET /api/cards/:id`
- `POST /api/cards`
- `PUT /api/cards/:id`
- `DELETE /api/cards/:id`
- `GET /api/cards/:id/comments` (Cloudflare Worker)
- `POST /api/cards/:id/comments` (Cloudflare Worker)
- `GET /api/cards/:id/reaction` (Cloudflare Worker)
- `POST /api/cards/:id/reaction` (Cloudflare Worker)
- `GET /api/cards/:id/likes` (Cloudflare Worker)
- `POST /api/cards/:id/likes` (Cloudflare Worker)

Card shape:

```json
{
  "id": "uuid",
  "question": "string",
  "answer": "string",
  "sources": ["string"],
  "tags": ["string"],
  "difficulty": "easy | medium | hard",
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

### Optional PostgreSQL (recommended)

If `DATABASE_URL` is provided, server uses PostgreSQL automatically:

```bash
DATABASE_URL=postgresql://user:pass@host:5432/dbname npm run dev -w server
```

Optional for TLS connections:

```bash
DATABASE_SSL=true
```

### Local Cloudflare Dev

```bash
npm run dev:cloudflare
```

Set client env (optional) to point directly to Worker:

```bash
cp client/.env.example client/.env.local
# then set VITE_API_BASE_URL
```

## Tests

```bash
npm test
```

## Notes

- On first server start, `server/data/cards.json` is generated automatically from seeds.
- CRUD writes are persisted to `server/data/cards.json`.
- In PostgreSQL mode, data is persisted in DB table `cards`.

## Deploy To Koyeb (Docker)

This branch includes a production Docker setup:

- `Dockerfile` builds client + server
- Express serves API and static React build from one service
- `PORT` from Koyeb is supported automatically

### Steps

1. Push this branch to GitHub.
2. In Koyeb create a **PostgreSQL** service (or use external Postgres like Supabase/Neon).
3. Create a **Web Service** from your GitHub repo.
4. Select this branch and choose deployment via `Dockerfile`.
5. Add environment variable:
   - `DATABASE_URL=<your postgres connection string>`
6. (Optional) If your DB requires TLS, add:
   - `DATABASE_SSL=true`
7. Exposed port: `3001`.
8. Health check path: `/api/health`.
9. Deploy.

After deploy:

- App: `https://<your-koyeb-domain>/`
- API: `https://<your-koyeb-domain>/api/cards`

### Production Storage Note

If `DATABASE_URL` is not configured, app falls back to local file mode.
For production, always configure PostgreSQL to keep user edits persistent.

## Deploy To Cloudflare (Pages + Worker + D1)

1. Create D1 database:
```bash
npx wrangler d1 create unityprep-cards-db
```
2. Put returned `database_id` into `worker/wrangler.toml`.
3. Apply migration:
```bash
npm run d1:migrate:remote -w worker
```
4. Seed cards from `server/data/cards.json`:
```bash
npm run d1:seed:remote -w worker
```
5. Deploy Worker API:
```bash
npm run deploy -w worker
```
6. Deploy `client/` to Cloudflare Pages and set env variable:
```bash
VITE_API_BASE_URL=https://<your-worker>.workers.dev
```

## Possible Next Enhancements

- Card categories and filters
- Import/export decks
- Spaced repetition scheduling
- Authentication and cloud sync
