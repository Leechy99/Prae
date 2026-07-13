import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests/e2e',
  timeout: 30000,
  webServer: {
    command: 'node -r ts-node/register src/api/index.ts',
    url: 'http://localhost:3000/health',
    reuseExistingServer: false,
    timeout: 30000,
    gracefulShutdown: {
      signal: 'SIGTERM',
      timeout: 5000,
    },
    env: {
      API_KEY: 'test-api-key',
      PORT: '3000',
    },
  },
  use: {
    baseURL: 'http://localhost:3000',
    headless: true,
  },
});
