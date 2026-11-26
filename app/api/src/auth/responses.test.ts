import { describe, expect, it } from 'vitest';
import { userView } from './responses.ts';

describe('F1.AC12 response builders leave out password fields', () => {
  it('F1.AC12 userView returns only id and email', () => {
    // A stored user row can carry secret fields. They are added through a variable so
    // the test checks the function's output, not the object literal's type.
    const stored = {
      id: 7,
      email: 'sam@mail.com',
      password: 'correct-horse-staple-42',
      password_hash: 'fake-argon2id-hash',
      passwordHash: 'fake-argon2id-hash',
    };

    const view = userView(stored);

    expect(view).toEqual({ id: 7, email: 'sam@mail.com' });
    expect(Object.keys(view).sort()).toEqual(['email', 'id']);
  });

  it('F1.AC12 userView output has no password or password_hash keys', () => {
    const stored = { id: 1, email: 'sam@mail.com', password_hash: 'x', password: 'y' };

    const view = userView(stored);

    expect('password' in view).toBe(false);
    expect('password_hash' in view).toBe(false);
  });
});
