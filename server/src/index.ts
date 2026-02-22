import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';
import { createApp } from './app.js';
import { FileCardRepository } from './repository.js';
import { PostgresCardRepository } from './postgres-repository.js';

const port = Number(process.env.PORT ?? 3001);
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const clientDistPath = path.resolve(__dirname, '../../client/dist');

async function bootstrap() {
  const databaseUrl = process.env.DATABASE_URL;
  const useDatabaseSsl = process.env.DATABASE_SSL === 'true';
  const repository = databaseUrl
    ? new PostgresCardRepository(databaseUrl, { ssl: useDatabaseSsl })
    : new FileCardRepository();
  await repository.init();
  console.log(databaseUrl ? 'Storage: PostgreSQL' : 'Storage: local file');

  const app = createApp(repository);

  // In production deploys (e.g. Docker/Koyeb), serve built React app from client/dist.
  if (existsSync(clientDistPath)) {
    app.use(express.static(clientDistPath));
    app.get(/^\/(?!api(?:\/|$)).*/, (_req, res) => {
      res.sendFile(path.join(clientDistPath, 'index.html'));
    });
  }

  app.listen(port, () => {
    console.log(`Server listening on http://localhost:${port}`);
  });
}

bootstrap().catch((error) => {
  console.error('Failed to start server:', error);
  process.exit(1);
});
