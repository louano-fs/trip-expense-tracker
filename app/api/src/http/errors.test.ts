import { describe, expect, it } from 'vitest';
import { createErrorHandler, type ErrorLogger } from './errors.ts';

// The error handler has no AC of its own. Its rules come from the project rules (logging and errors).

interface LogCall {
  obj: object;
  msg: string;
}

function fakeLogger(): ErrorLogger & { calls: LogCall[] } {
  const calls: LogCall[] = [];
  return {
    calls,
    error(obj, msg) {
      calls.push({ obj, msg });
    },
  };
}

function fakeResponse(headersSent = false) {
  const res = {
    headersSent,
    statusCode: 200,
    body: undefined as unknown,
    status(code: number) {
      res.statusCode = code;
    },
    json(body: unknown) {
      res.body = body;
    },
  };
  return res;
}

describe('createErrorHandler', () => {
  it('F1 logging rule: a thrown error becomes a 500 with the generic message', () => {
    const logger = fakeLogger();
    const res = fakeResponse();
    const handler = createErrorHandler(logger);

    handler(new Error('boom'), { method: 'POST', path: '/api/login' }, res, () => {});

    expect(res.statusCode).toBe(500);
    expect(res.body).toEqual({ error: 'Something went wrong. Please try again.' });
  });

  it('F1 logging rule: the logger is called without the request body or cookies', () => {
    const logger = fakeLogger();
    const handler = createErrorHandler(logger);
    const secretPassword = 'correct horse battery staple';
    const secretToken = 'session-token-value';

    handler(
      new Error('boom'),
      { method: 'POST', path: '/api/register' },
      fakeResponse(),
      () => {},
    );

    expect(logger.calls).toHaveLength(1);
    const logged = JSON.stringify(logger.calls[0]);
    expect(logged).toContain('/api/register');
    expect(logged).not.toContain(secretPassword);
    expect(logged).not.toContain(secretToken);
    expect(logger.calls[0].obj).not.toHaveProperty('body');
    expect(logger.calls[0].obj).not.toHaveProperty('headers');
  });

  it('F1 logging rule: a response already sent is passed on to the next handler', () => {
    const logger = fakeLogger();
    const res = fakeResponse(true);
    const handler = createErrorHandler(logger);
    const error = new Error('late');
    let passedOn: unknown;

    handler(error, { method: 'GET', path: '/x' }, res, (err) => {
      passedOn = err;
    });

    expect(passedOn).toBe(error);
    expect(res.body).toBeUndefined();
  });
});
