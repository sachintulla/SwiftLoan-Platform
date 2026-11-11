import { describe, it, expect, afterEach } from 'vitest';
import { webhookEnvTag } from './webhookEnv.js';

const snapshot = { ...process.env };
afterEach(() => { process.env = { ...snapshot }; });

describe('webhookEnvTag', () => {
  it('prefers APP_ENV, and takes the host from PUBLIC_BASE_URL', () => {
    process.env.APP_ENV = 'production';
    process.env.PUBLIC_BASE_URL = 'https://api.swiftloan.ai';
    expect(webhookEnvTag('ignored-host')).toEqual({ env: 'production', host: 'api.swiftloan.ai' });
  });

  it('falls back to NODE_ENV and the request host when nothing else is set', () => {
    delete process.env.APP_ENV;
    delete process.env.PUBLIC_BASE_URL;
    process.env.NODE_ENV = 'development';
    expect(webhookEnvTag('dev-box:4000')).toEqual({ env: 'development', host: 'dev-box:4000' });
  });

  it('defaults env to development and host to null with no inputs', () => {
    delete process.env.APP_ENV;
    delete process.env.PUBLIC_BASE_URL;
    delete process.env.NODE_ENV;
    expect(webhookEnvTag()).toEqual({ env: 'development', host: null });
  });
});
