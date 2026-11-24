import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, Navigate, useParams } from 'react-router-dom';
import { getTrip, type Trip } from '../api/trips';
import { ApiError } from '../api/client';
import { RequireSession } from '../components/RequireSession';
import { copy } from '../copy';
import { formatCreatedDate } from '../format/date';

// Copy for the trip page (F2.R7, F2.R12). Added in F2.T8 (new copy, for review). Wording from F2-trips.md.
const tripCopy = {
  loading: 'Loading trip…',
  placeholder: 'People, expenses and balances will appear here.',
  deleteTrip: 'Delete trip',
  backToTrips: 'Back to trips',
  notFoundHeading: 'Trip not found',
  notFoundText: 'It may have been deleted, or the link is wrong.',
} as const;

export interface TripPageProps {
  /** Told whether the browser holds a live session (passed through to RequireSession). */
  onSessionChange?: (live: boolean) => void;
}

// Calls the guarded trip route (F1.R10). Only the status is used here, so a 401 keeps the
// expired notice from RequireSession (F1.AC23). Defined at module level for a stable identity.
function fetchTrip(id: string): Promise<Response> {
  return fetch(`/api/trips/${encodeURIComponent(id)}`, { credentials: 'same-origin' });
}

// Trip page for /trips/:id (F2.R7, F2.R12). It sits behind RequireSession, so the trip
// request only starts once the gate has answered with a live session (F2.AC9).
export function TripPage({ onSessionChange }: TripPageProps) {
  const { id = '' } = useParams();
  const load = useCallback(() => fetchTrip(id), [id]);
  return (
    <RequireSession load={load} onSessionChange={onSessionChange}>
      <TripScreen id={id} onSessionChange={onSessionChange} />
    </RequireSession>
  );
}

type TripState =
  | { kind: 'loading' }
  | { kind: 'found'; trip: Trip }
  | { kind: 'not-found' }
  | { kind: 'failed' }
  | { kind: 'ended' };

interface TripScreenProps {
  id: string;
  onSessionChange?: (live: boolean) => void;
}

function TripScreen({ id, onSessionChange }: TripScreenProps) {
  const [state, setState] = useState<TripState>({ kind: 'loading' });
  // Keeps the latest callback without re-running the request when its identity changes.
  const onChangeRef = useRef(onSessionChange);
  useEffect(() => {
    onChangeRef.current = onSessionChange;
  });

  useEffect(() => {
    let active = true;
    setState({ kind: 'loading' });
    // The API takes a numeric trip ID. A non-numeric ID becomes NaN, which the API answers with 404.
    getTrip(Number(id))
      .then((result) => {
        if (!active) return;
        if (result === 'not-found') {
          setState({ kind: 'not-found' });
          return;
        }
        // A trip must be an object. Anything else is an unexpected response and is shown as a failure.
        if (typeof result !== 'object' || result === null) {
          setState({ kind: 'failed' });
          return;
        }
        setState({ kind: 'found', trip: result });
      })
      .catch((error: unknown) => {
        if (!active) return;
        // A 401 here means the session ended after the gate (F1.R9). Go to Log in (F2.AC9).
        if (error instanceof ApiError && error.status === 401) {
          onChangeRef.current?.(false);
          setState({ kind: 'ended' });
          return;
        }
        setState({ kind: 'failed' });
      });
    return () => {
      active = false;
    };
  }, [id]);

  if (state.kind === 'ended') {
    return <Navigate to="/login" replace />;
  }

  if (state.kind === 'loading') {
    return <p>{tripCopy.loading}</p>;
  }

  if (state.kind === 'failed') {
    return <p role="alert">{copy.genericError}</p>;
  }

  // Not found: nothing else is shown, and no trip data (F2.AC12).
  if (state.kind === 'not-found') {
    return (
      <section>
        <h2>{tripCopy.notFoundHeading}</h2>
        <p>{tripCopy.notFoundText}</p>
        <Link to="/trips">{tripCopy.backToTrips}</Link>
      </section>
    );
  }

  const { trip } = state;
  return (
    <section>
      <h1>{trip.name}</h1>
      <p>{copy.tripCreated(formatCreatedDate(trip.createdAt))}</p>
      <p>{tripCopy.placeholder}</p>
      <button type="button">{tripCopy.deleteTrip}</button>
      <Link to="/trips">{tripCopy.backToTrips}</Link>
    </section>
  );
}
