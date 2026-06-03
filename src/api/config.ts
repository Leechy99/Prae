export interface RuntimeConfig {
  apiKey: string;
  env: string;
  isProduction: boolean;
  port: number;
}

export type RuntimeEnv = Partial<NodeJS.ProcessEnv>;

const DEFAULT_API_KEY = 'dev-api-key';
const DEFAULT_ENV = 'development';
const DEFAULT_PORT = 3000;

export function getRuntimeConfig(env: RuntimeEnv = process.env): RuntimeConfig {
  const nodeEnv = env.NODE_ENV || DEFAULT_ENV;
  const isProduction = nodeEnv === 'production';
  const apiKey = env.API_KEY || (isProduction ? undefined : DEFAULT_API_KEY);
  const portValue = env.PORT || (isProduction ? undefined : String(DEFAULT_PORT));

  if (!apiKey) {
    throw new Error('API_KEY is required when NODE_ENV=production');
  }

  if (!portValue) {
    throw new Error('PORT is required when NODE_ENV=production');
  }

  const port = parsePort(portValue);

  return {
    apiKey,
    env: nodeEnv,
    isProduction,
    port,
  };
}

function parsePort(value: string): number {
  if (!/^\d+$/.test(value)) {
    throw new Error('PORT must be an integer');
  }

  const port = Number(value);
  if (port < 1 || port > 65535) {
    throw new Error('PORT must be between 1 and 65535');
  }

  return port;
}
