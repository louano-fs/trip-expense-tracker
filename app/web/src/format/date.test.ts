import { describe, expect, it } from 'vitest';
import { formatCreatedDate } from './date';

// Fixed instant, so the test does not depend on the real clock or on the machine's zone.
const INSTANT = '2026-11-15T23:30:00Z';

describe('F2.R5 created date display', () => {
  it('F2.R5 formats 2026-11-15T23:30:00Z as 15 Nov 2026 in UTC', () => {
    expect(formatCreatedDate(INSTANT, 'UTC')).toBe('15 Nov 2026');
  });

  it('F2.R5 formats 2026-11-15T23:30:00Z as 16 Nov 2026 in Asia/Tokyo, so the zone is honoured', () => {
    expect(formatCreatedDate(INSTANT, 'Asia/Tokyo')).toBe('16 Nov 2026');
  });
});
