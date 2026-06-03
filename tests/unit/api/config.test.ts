import { getRuntimeConfig } from '../../../src/api/config';

describe('runtime config', () => {
  it('uses local development defaults when env vars are omitted', () => {
    const config = getRuntimeConfig({});

    expect(config).toEqual({
      apiKey: 'dev-api-key',
      env: 'development',
      isProduction: false,
      port: 3000,
    });
  });

  it('reads API key and port from the environment', () => {
    const config = getRuntimeConfig({
      API_KEY: 'configured-key',
      PORT: '4001',
      NODE_ENV: 'test',
    });

    expect(config.apiKey).toBe('configured-key');
    expect(config.port).toBe(4001);
    expect(config.env).toBe('test');
  });

  it('fails fast when production API key or port is missing', () => {
    expect(() => getRuntimeConfig({ NODE_ENV: 'production', PORT: '3000' })).toThrow(
      'API_KEY is required when NODE_ENV=production'
    );

    expect(() => getRuntimeConfig({ NODE_ENV: 'production', API_KEY: 'prod-key' })).toThrow(
      'PORT is required when NODE_ENV=production'
    );
  });

  it('rejects invalid ports', () => {
    expect(() => getRuntimeConfig({ PORT: 'not-a-port' })).toThrow('PORT must be an integer');
    expect(() => getRuntimeConfig({ PORT: '70000' })).toThrow('PORT must be between 1 and 65535');
  });
});
