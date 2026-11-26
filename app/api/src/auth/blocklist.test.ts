import { describe, expect, it } from 'vitest';
import { buildBlocklist, isBlockedPassword, STARTER_BLOCKLIST } from './blocklist.ts';

// Small in-test fake list, passed in as an argument. The real blocklist.txt is not read here.
const fakeList = buildBlocklist([
  'Password1234567',
  'trip expense tracker',
  'correct horse battery staple',
]);

describe('F1.AC17 blocklist entries', () => {
  it('F1.AC17 blocks a listed password typed in lowercase', () => {
    expect(isBlockedPassword('password1234567', 'sam@mail.com', fakeList)).toBe(true);
  });

  it('F1.AC17 blocks a listed password typed in uppercase', () => {
    expect(isBlockedPassword('PASSWORD1234567', 'sam@mail.com', fakeList)).toBe(true);
  });

  it('F1.AC17 blocks a listed app phrase in mixed case', () => {
    expect(isBlockedPassword('Trip Expense Tracker', 'sam@mail.com', fakeList)).toBe(true);
  });

  it('F1.AC17 does not block a password that is not on the list', () => {
    expect(isBlockedPassword('a quiet morning in lisbon', 'sam@mail.com', fakeList)).toBe(false);
  });

  it('F1.AC17 compares the whole password, so a listed prefix alone does not block', () => {
    expect(isBlockedPassword('Password1234567!', 'sam@mail.com', fakeList)).toBe(false);
  });
});

describe('F1.AC17 email-derived passwords', () => {
  it('F1.AC17 blocks a password equal to the email in any case', () => {
    expect(isBlockedPassword('SAMANTHA.TRAVEL@MAIL.COM', 'samantha.travel@mail.com', fakeList)).toBe(
      true,
    );
  });

  it('F1.AC17 blocks a password equal to the part before @ in any case', () => {
    // The local part is 15 characters, so it is a password the length rule accepts.
    expect('samantha.travel'.length).toBe(15);
    expect(isBlockedPassword('Samantha.Travel', 'samantha.travel@mail.com', fakeList)).toBe(true);
  });

  it('F1.AC17 compares the email with surrounding spaces and case ignored', () => {
    expect(isBlockedPassword('samantha.travel@mail.com', '  Samantha.Travel@Mail.com ', fakeList)).toBe(
      true,
    );
  });

  it('F1.AC17 does not block a password that only contains the local part', () => {
    expect(isBlockedPassword('samantha.travel trip', 'samantha.travel@mail.com', fakeList)).toBe(
      false,
    );
  });
});

describe('F1.AC17 starter list', () => {
  it('F1.AC17 starter list entries are all 15 characters or longer', () => {
    for (const entry of STARTER_BLOCKLIST) {
      expect(entry.length, `"${entry}"`).toBeGreaterThanOrEqual(15);
    }
  });

  it('F1.AC17 starter list entries are lowercase', () => {
    for (const entry of STARTER_BLOCKLIST) {
      expect(entry, `"${entry}"`).toBe(entry.toLowerCase());
    }
  });
});

describe('F1.R12 normalization in the blocklist check', () => {
  it('F1.R12 matches composed and decomposed forms of a listed entry', () => {
    const list = buildBlocklist(['café au lait en plein air']); // composed é
    expect(isBlockedPassword('café au lait en plein air', 'sam@mail.com', list)).toBe(true);
  });

  it('F1.R12 skips empty entries when building the list', () => {
    const list = buildBlocklist(['', 'trip expense tracker']);
    expect(list.size).toBe(1);
  });
});
