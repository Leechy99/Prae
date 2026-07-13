import { startServer } from './server';
import { getRuntimeConfig } from './config';

const config = getRuntimeConfig();

startServer(config.port)
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
