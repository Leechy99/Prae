import express, { Express } from 'express';
import { createRouter } from './routes';

export function createApp(): Express {
  const app = express();

  // Parse JSON bodies
  app.use(express.json({ limit: '10mb' }));

  // Parse URL-encoded bodies
  app.use(express.urlencoded({ extended: true }));

  // Mount API routes
  app.use(createRouter());

  return app;
}

export function startServer(port: number): Promise<Express> {
  return new Promise((resolve, reject) => {
    const app = createApp();
    const server = app.listen(port, () => {
      console.log(`Server listening on port ${port}`);
      resolve(app);
    });

    server.on('error', (err: Error) => {
      reject(err);
    });
  });
}