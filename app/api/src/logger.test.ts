import { describe, expect, it } from 'vitest';
import { createLogger } from './logger.ts';

// Fake destination: records each JSON line pino writes, in memory.
class MemoryStream {
  readonly lines: string[] = [];

  write(msg: string): boolean {
    this.lines.push(msg);
    return true;
  }
}

function logEntries(entries: Record<string, unknown>): Record<string, unknown>[] {
  const stream = new MemoryStream();
  // timestamp: false keeps the real clock out of the test output.
  const logger = createLogger({ destination: stream, level: 'info', timestamp: false });
  logger.info(entries, 'test entry');
  return stream.lines.map((line) => JSON.parse(line) as Record<string, unknown>);
}

describe('createLogger redaction', () => {
  // Supports F1.AC12 and the logging rule in project-rules.md.
  it('supports F1.AC12 replaces password and cookie fields with [Redacted]', () => {
    const [entry] = logEntries({ password: 'hunter2-hunter2', cookie: '__Host-sid=abc' });

    expect(entry?.password).toBe('[Redacted]');
    expect(entry?.cookie).toBe('[Redacted]');
  });

  it('supports F1.AC12 replaces password_hash, set-cookie and req.headers.cookie', () => {
    const [entry] = logEntries({
      password_hash: '$argon2id$v=19$m=19456',
      'set-cookie': '__Host-sid=abc',
      req: { headers: { cookie: '__Host-sid=abc' } },
    });

    expect(entry?.password_hash).toBe('[Redacted]');
    expect(entry?.['set-cookie']).toBe('[Redacted]');
    expect((entry?.req as { headers: { cookie: string } }).headers.cookie).toBe('[Redacted]');
  });

  it('supports F1.AC12 never writes the secret value anywhere in the output', () => {
    const stream = new MemoryStream();
    const logger = createLogger({ destination: stream, level: 'info', timestamp: false });

    logger.info({ password: 'hunter2-hunter2' }, 'login attempt');

    expect(stream.lines.join('')).not.toContain('hunter2-hunter2');
  });

  it('supports the logging rule keeps ordinary fields unchanged', () => {
    const [entry] = logEntries({ port: 3000 });

    expect(entry?.port).toBe(3000);
    expect(entry?.msg).toBe('test entry');
  });
});
