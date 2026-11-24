import { useEffect, useRef, useState } from 'react';
import { Navigate } from 'react-router-dom';
import { listTrips, type Trip } from '../api/trips';
import { ApiError } from '../api/client';
import { TripList } from '../components/TripList';
import { NewTripForm } from '../components/NewTripForm';
import { RequireSession } from '../components/RequireSession';
import { copy } from '../copy';

// Route gate for the Trips screen (F1.R9, F1.R10). Calls the guarded trip list route and
// only its status is used, so a 401 keeps the expired notice from RequireSession (F1.AC23).
// Defined at module level so its identity is stable for RequireSession.
export function fetchTrips(): Promise<Response> {
  return fetch('/api/trips', { credentials: 'same-origin' });
}

export interface TripsProps {
  /** Told whether the browser holds a live session (passed through to RequireSession). */
  onSessionChange?: (live: boolean) => void;
}

// Trips list screen (F2.R5, F2.R6). It sits behind RequireSession, so the list request
// only starts once the gate has answered with a live session (F2.AC9).
export function Trips({ onSessionChange }: TripsProps = {}) {
  return (
    <RequireSession load={fetchTrips} onSessionChange={onSessionChange}>
      <TripsScreen onSessionChange={onSessionChange} />
    </RequireSession>
  );
}

type ListState =
  | { kind: 'loading' }
  | { kind: 'loaded'; trips: Trip[] }
  | { kind: 'failed' }
  | { kind: 'ended' };

interface TripsScreenProps {
  onSessionChange?: (live: boolean) => void;
}

function TripsScreen({ onSessionChange }: TripsScreenProps) {
  const [state, setState] = useState<ListState>({ kind: 'loading' });
  const [attempt, setAttempt] = useState(0);
  const retryRef = useRef<HTMLButtonElement>(null);
  const [formOpen, setFormOpen] = useState(false);
  const newTripRef = useRef<HTMLButtonElement>(null);
  // Set when the form is cancelled, so focus returns to the "New trip" button (accessibility).
  const returnFocusRef = useRef(false);
  // Keeps the latest callback without re-running the request when its identity changes.
  const onChangeRef = useRef(onSessionChange);
  useEffect(() => {
    onChangeRef.current = onSessionChange;
  });

  useEffect(() => {
    let active = true;
    setState({ kind: 'loading' });
    listTrips()
      .then((trips) => {
        if (!active) return;
        // The list must be an array. Anything else is an unexpected response and is shown as a failure.
        if (!Array.isArray(trips)) {
          setState({ kind: 'failed' });
          return;
        }
        setState({ kind: 'loaded', trips });
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
  }, [attempt]);

  // After a failed load, focus stays on "Try again" so keyboard users can retry (accessibility).
  useEffect(() => {
    if (state.kind === 'failed') retryRef.current?.focus();
  }, [state.kind]);

  // When the form closes without creating a trip, focus goes back to "New trip".
  useEffect(() => {
    if (!formOpen && returnFocusRef.current) {
      returnFocusRef.current = false;
      newTripRef.current?.focus();
    }
  }, [formOpen]);

  if (state.kind === 'ended') {
    return <Navigate to="/login" replace />;
  }

  function closeForm() {
    returnFocusRef.current = true;
    setFormOpen(false);
  }

  return (
    <section>
      <h2>{copy.tripsHeading}</h2>
      {state.kind === 'loading' && <p>{copy.tripsLoading}</p>}
      {state.kind === 'failed' && (
        <>
          <p role="alert">{copy.tripsLoadFailed}</p>
          <button ref={retryRef} type="button" onClick={() => setAttempt((n) => n + 1)}>
            {copy.tryAgain}
          </button>
        </>
      )}
      {state.kind === 'loaded' && (
        <>
          {state.trips.length === 0 && <p>{copy.tripsEmpty}</p>}
          {/* One "New trip" button, shown in the empty state and the list (F2.R6, F2 screen 1). It is hidden while the form is open. */}
          {formOpen ? (
            <NewTripForm onCancel={closeForm} />
          ) : (
            <button ref={newTripRef} type="button" onClick={() => setFormOpen(true)}>
              {copy.newTripButton}
            </button>
          )}
          {state.trips.length > 0 && <TripList trips={state.trips} />}
        </>
      )}
    </section>
  );
}
