import { useCallback } from 'react';
import { useParams } from 'react-router-dom';
import { RequireSession } from '../components/RequireSession';

export interface TripPageProps {
  /** Told whether the browser holds a live session (passed through to RequireSession). */
  onSessionChange?: (live: boolean) => void;
}

// Calls the guarded trip route (F1.R10). Only the status is used here; no trip data exists in F1.
function fetchTrip(id: string): Promise<Response> {
  return fetch(`/api/trips/${encodeURIComponent(id)}`, { credentials: 'same-origin' });
}

// Shell for /trips/:id. It shows nothing from the API result: content sits inside RequireSession,
// so it renders only when the session is live (F1.R9). Trip content comes in F2.
export function TripPage({ onSessionChange }: TripPageProps) {
  const { id = '' } = useParams();
  const load = useCallback(() => fetchTrip(id), [id]);
  return (
    <RequireSession load={load} onSessionChange={onSessionChange}>
      <section>
        <h2>Trip</h2>
        <p>Trip details will show up here soon.</p>
      </section>
    </RequireSession>
  );
}
