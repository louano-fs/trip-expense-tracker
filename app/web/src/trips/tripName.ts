// Trip name check for instant feedback on the New trip form (F2.R2). The server
// (app/api/src/trips/validation.ts) stays authoritative, so these two rules must match it.

export const TRIP_NAME_MAX_LENGTH = 100;

// Copy from docs/specs/features/F2-trips.md, "States & errors".
export const TRIP_NAME_MESSAGES = {
  nameEmpty: 'Enter a trip name.',
  nameTooLong: 'Trip name must be 100 characters or fewer.',
} as const;

export type TripNameCheck = { ok: true; name: string } | { ok: false; message: string };

/**
 * Checks a trip name (F2.R2, F2.AC2, F2.AC3).
 * Trims spaces at both ends, then requires 1 to 100 characters.
 * Each Unicode code point counts as one character (same counting as F1.R3).
 */
export function checkTripName(raw: string): TripNameCheck {
  const name = raw.trim();
  if (name === '') {
    return { ok: false, message: TRIP_NAME_MESSAGES.nameEmpty };
  }
  if ([...name].length > TRIP_NAME_MAX_LENGTH) {
    return { ok: false, message: TRIP_NAME_MESSAGES.nameTooLong };
  }
  return { ok: true, name };
}
