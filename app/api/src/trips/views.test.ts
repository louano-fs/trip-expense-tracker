import { describe, expect, it } from 'vitest';
import { tripView } from './views.ts';
import type { StoredTrip } from './store.ts';

describe('F2.AC13 trip response shape', () => {
  const trip: StoredTrip = {
    id: 7,
    owner_id: 42,
    name: 'Lisbon',
    createdAt: '2026-11-24T10:00:00.000Z',
  };

  it('F2.AC13 tripView returns only id, name and createdAt', () => {
    expect(tripView(trip)).toEqual({
      id: 7,
      name: 'Lisbon',
      createdAt: '2026-11-24T10:00:00.000Z',
    });
  });

  it('F2.AC13 tripView output has no owner_id', () => {
    const view = tripView(trip);
    expect(Object.keys(view).sort()).toEqual(['createdAt', 'id', 'name']);
    expect(view).not.toHaveProperty('owner_id');
  });
});
