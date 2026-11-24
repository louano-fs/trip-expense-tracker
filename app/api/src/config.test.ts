import { describe, expect, it } from 'vitest';
import { loadConfig } from './config.ts';

// These tests have no acceptance criterion of their own. They support F1.R7
// (the session cookie is always Secure, except in tests).
describe('loadConfig', () => {
  it('throws when the required DATABASE_PATH is missing', () => {
    expect(() => loadConfig({})).toThrow(/DATABASE_PATH/);
  });

  it('throws when DATABASE_PATH is blank', () => {
    expect(() => loadConfig({ DATABASE_PATH: '   ' })).toThrow(/DATABASE_PATH/);
  });

  it('applies defaults for port, blocklist path and cookie Secure flag', () => {
    const config = loadConfig({ DATABASE_PATH: 'data/test.sqlite' });

    expect(config.databasePath).toBe('data/test.sqlite');
    expect(config.port).toBe(3000);
    expect(config.blocklistPath).toBe('src/auth/blocklist.txt');
    expect(config.cookieSecure).toBe(true);
  });

  it('reads a valid PORT', () => {
    const config = loadConfig({ DATABASE_PATH: 'x.sqlite', PORT: '8080' });

    expect(config.port).toBe(8080);
  });

  it('throws when PORT is not a whole number from 1 to 65535', () => {
    expect(() => loadConfig({ DATABASE_PATH: 'x.sqlite', PORT: 'abc' })).toThrow(/PORT/);
    expect(() => loadConfig({ DATABASE_PATH: 'x.sqlite', PORT: '0' })).toThrow(/PORT/);
    expect(() => loadConfig({ DATABASE_PATH: 'x.sqlite', PORT: '70000' })).toThrow(/PORT/);
  });

  it('keeps the cookie Secure flag on unless the test-only override is "true"', () => {
    const override = loadConfig({
      DATABASE_PATH: 'x.sqlite',
      TEST_ALLOW_INSECURE_COOKIES: 'true',
    });
    const other = loadConfig({
      DATABASE_PATH: 'x.sqlite',
      TEST_ALLOW_INSECURE_COOKIES: 'yes',
    });

    expect(override.cookieSecure).toBe(false);
    expect(other.cookieSecure).toBe(true);
  });
});
