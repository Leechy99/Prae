import express, { Express } from 'express';
import { Server } from 'http';
import { createRouter } from './routes';

export interface StartedServer {
  app: Express;
  server: Server;
  close(): Promise<void>;
}

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

export function startServer(port: number): Promise<StartedServer> {
  return new Promise((resolve, reject) => {
    const app = createApp();
    let closePromise: Promise<void> | undefined;
    const server = app.listen(port, () => {
      console.log(`Server listening on port ${port}`);
      resolve({
        app,
        server,
        close: () => {
          if (!closePromise) {
            closePromise = new Promise<void>((closeResolve, closeReject) => {
              if (!server.listening) {
                closeResolve();
                return;
              }

              server.close((error?: Error) => {
                if (error) {
                  closeReject(error);
                  return;
                }

                closeResolve();
              });
            });
          }

          return closePromise;
        },
      });
    });

    server.on('error', (err: Error) => {
      reject(err);
    });
  });
}
