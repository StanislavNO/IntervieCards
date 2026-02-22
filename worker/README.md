# UnityPrep Worker (Cloudflare)

Hono API for UnityPrep Cards, backed by D1.

## Endpoints

- `GET /api/health`
- `GET /api/cards`
- `GET /api/cards?sort=popular`
- `GET /api/cards/:id`
- `POST /api/cards`
- `PUT /api/cards/:id`
- `DELETE /api/cards/:id` (soft delete)
- `GET /api/cards/:id/comments`
- `POST /api/cards/:id/comments`
- `GET /api/cards/:id/reaction`
- `POST /api/cards/:id/reaction` with `{ "value": 1 | -1 }`
- `GET /api/cards/:id/likes`
- `POST /api/cards/:id/likes`

## Setup

1. Create D1 DB:
```bash
npx wrangler d1 create unityprep-cards-db
```
2. Update `database_id` in `wrangler.toml`.
3. Apply migrations:
```bash
npm run d1:migrate:remote
```
4. Seed cards:
```bash
npm run d1:seed:remote
```
5. Deploy:
```bash
npm run deploy
```
