import { startServer } from './server';

const PORT = process.env.PORT ? parseInt(process.env.PORT) : 3000;

startServer(PORT).catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});