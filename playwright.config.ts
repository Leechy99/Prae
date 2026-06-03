import { defineConfig } from '@playwright/test';
import { getRuntimeConfig } from './src/api/config';

const runtimeConfig = getRuntimeConfig({
  ...process.env,
  API_KEY: process.env.API_KEY || 'test-api-key',
  NODE_ENV: 'test',
});
const baseURL = `http://localhost:${runtimeConfig.port}`;

export default defineConfig({
  testDir: './tests/e2e',
  timeout: 30000,
  webServer: {
    command: 'npm run dev',
    url: `${baseURL}/health`,
    reuseExistingServer: false,
    timeout: 30000,
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
