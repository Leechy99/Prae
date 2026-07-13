import { startServer } from './server';

const PORT = process.env.PORT ? parseInt(process.env.PORT) : 3000;

startServer(PORT)
  .then((started) => {
    const shutdown = async (): Promise<void> => {
      await started.close();
      process.exit(0);
    };

    process.once('SIGINT', shutdown);
    process.once('SIGTERM', shutdown);
  })
  .catch((err) => {
    console.error('Failed to start server:', err);
    process.exit(1);
  });
