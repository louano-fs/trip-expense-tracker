import { copy } from '../copy';

// Calls the guarded trip list route (F1.R10). Only the status is used here; no trip data exists in F1.
// Defined at module level so its identity is stable for RequireSession.
export function fetchTrips(): Promise<Response> {
  return fetch('/api/trips', { credentials: 'same-origin' });
}

// Placeholder until F2 adds the trip list. No data is shown here. The App wraps it in RequireSession (F1.R9).
export function Trips() {
  return (
    <section>
      <h2>{copy.tripsHeading}</h2>
      <p>{copy.tripsPlaceholder}</p>
    </section>
  );
}
