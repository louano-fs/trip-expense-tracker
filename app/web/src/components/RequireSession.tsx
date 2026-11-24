import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Navigate } from 'react-router-dom';
import { copy } from '../copy';

export interface RequireSessionProps {
  /** Calls the guarded trip route. A 401 means logged out or expired (F1.R9, F1.R10). */
  load: () => Promise<Response>;
  /** Told whether the browser holds a live session. Used to show or hide "Log out". */
  onSessionChange?: (live: boolean) => void;
  children: ReactNode;
}

type Outcome =
  | { kind: 'pending' }
  | { kind: 'live' }
  | { kind: 'ended'; expired: boolean }
  | { kind: 'failed' };

/**
 * Reads the `reason` field from a 401 body. Returns true only for `'expired'`
 * (F1.AC23). A body that is not JSON has no reason, so the redirect has no notice.
 */
export async function isExpiredReason(response: Response): Promise<boolean> {
  try {
    const body: unknown = await response.json();
    return typeof body === 'object' && body !== null && (body as { reason?: unknown }).reason === 'expired';
  } catch {
    // Not JSON: treat as no reason. The body is never logged.
    return false;
  }
}

// Route guard for trip pages (F1.R9). No child content renders until the API
// answers. A 401 redirects to Log in, with the expired notice only when the
// API says the session expired (F1.AC9, F1.AC23).
export function RequireSession({ load, onSessionChange, children }: RequireSessionProps) {
  const [outcome, setOutcome] = useState<Outcome>({ kind: 'pending' });
  // Keeps the latest callback without re-running the request when its identity changes.
  const onChangeRef = useRef(onSessionChange);
  useEffect(() => {
    onChangeRef.current = onSessionChange;
  });

  useEffect(() => {
    let active = true;
    setOutcome({ kind: 'pending' });
    load()
      .then(async (response) => {
        if (!active) return;
        if (response.status === 401) {
          const expired = await isExpiredReason(response);
          if (!active) return;
          setOutcome({ kind: 'ended', expired });
          onChangeRef.current?.(false);
          return;
        }
        // Only a 2xx means a live session. Any other status (including 404) is an error (F1.AC9, F1.AC10).
        if (response.ok) {
          setOutcome({ kind: 'live' });
          onChangeRef.current?.(true);
          return;
        }
        setOutcome({ kind: 'failed' });
      })
      .catch(() => {
        // A network failure is shown to the user. No trip content is rendered.
        if (active) setOutcome({ kind: 'failed' });
      });
    return () => {
      active = false;
    };
  }, [load]);

  if (outcome.kind === 'pending') {
    return null;
  }
  if (outcome.kind === 'ended') {
    return <Navigate to="/login" replace state={outcome.expired ? { notice: 'expired' } : undefined} />;
  }
  if (outcome.kind === 'failed') {
    return <p role="alert">{copy.genericError}</p>;
  }
  return <>{children}</>;
}
