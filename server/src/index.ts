import { createApp } from './app.js';
import { FileCardRepository } from './repository.js';

const port = Number(process.env.PORT ?? 3001);

async function bootstrap() {
  const repository = new FileCardRepository();
  await repository.init();

  const app = createApp(repository);
  app.listen(port, () => {
    console.log(`Server listening on http://localhost:${port}`);
  });
}

bootstrap().catch((error) => {
  console.error('Failed to start server:', error);
  process.exit(1);
});
