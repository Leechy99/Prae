import { startServer } from './server';
import { getRuntimeConfig } from './config';

const config = getRuntimeConfig();

startServer(config.port).catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
