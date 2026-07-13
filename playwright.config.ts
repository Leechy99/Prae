import { defineConfig } from '@playwright/test';
import { getRuntimeConfig } from './src/api/config';

const runtimeConfig = getRuntimeConfig({
  ...process.env,
  API_KEY: 'test-api-key',
  NODE_ENV: 'test',
});
const baseURL = `http://localhost:${runtimeConfig.port}`;

export default defineConfig({
  testDir: './tests/e2e',
  timeout: 30000,
  webServer: {
    command: 'node -r ts-node/register src/api/index.ts',
    url: `${baseURL}/health`,
    reuseExistingServer: false,
    timeout: 30000,
    gracefulShutdown: {
      signal: 'SIGTERM',
      timeout: 5000,
    },
    env: {
      API_KEY: runtimeConfig.apiKey,
      PORT: String(runtimeConfig.port),
      NODE_ENV: runtimeConfig.env,
    },
  },
  use: {
    baseURL,
    headless: true,
  },
});
