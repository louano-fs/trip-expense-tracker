// Placeholder for the trip endpoints until F2 adds them (F1.R10). It only shows the login gate in front of a trip route.
// Every trip endpoint runs apiGuard before any trip data is read; F1 has no trips, so a live session gets 200 with null (by id) or an empty list.
import { apiGuard } from '../../auth/guards.ts';
import type { Clock, SessionStore } from '../../auth/sessions.ts';
import { readSessionToken } from '../cookies.ts';
import type { RouteResponse } from './auth.ts';

/** The request fields the placeholder reads. Express's Request satisfies this. */
export interface PlaceholderRequest {
  headers: { cookie?: string | undefined };
}

export interface PlaceholderDeps {
  sessions: SessionStore;
  clock: Clock;
}

/** A refused request: the status and the body to send. The body never contains trip data. */
interface GateDenied {
  status: 401;
  body: { error: 'Unauthorized'; reason?: 'expired' };
}

/**
 * The login gate (F1.R10). Returns null for a live session, or the 401 to send.
 * The 401 has `reason: 'expired'` only when a session cookie was sent but no live session matched,
 * so the web app can show the expired notice (F1.R7, F1.AC23). With no cookie there is no reason key.
 */
function loginGate(req: PlaceholderRequest, deps: PlaceholderDeps): GateDenied | null {
  const token = readSessionToken(req.headers.cookie);
  const guard = apiGuard({
    token,
    sessions: deps.sessions,
    clock: deps.clock,
  });
  if (guard.ok) {
    return null;
  }
  return {
    status: guard.status,
    body: token === undefined ? { error: 'Unauthorized' } : { error: 'Unauthorized', reason: 'expired' },
  };
}

/**
 * GET /api/trips/:id: 401 with no data when logged out or expired (F1.R10); 200 with `trip: null` otherwise,
 * since F1 has no trips. The web app treats any non-2xx as an error, so 200 is what marks a live session.
 */
export function tripPlaceholderRoute(deps: PlaceholderDeps): (req: PlaceholderRequest, res: RouteResponse) => void {
  return (req, res) => {
    const denied = loginGate(req, deps);
    if (denied !== null) {
      res.status(denied.status);
      res.json(denied.body);
      return;
    }
    res.status(200);
    res.json({ trip: null });
  };
}

/**
 * GET /api/trips: 401 with no data when logged out or expired (F1.R10); 200 with an empty list otherwise,
 * since F1 has no trips. F2 replaces it with the real list.
 */
export function tripListPlaceholderRoute(deps: PlaceholderDeps): (req: PlaceholderRequest, res: RouteResponse) => void {
  return (req, res) => {
    const denied = loginGate(req, deps);
    if (denied !== null) {
      res.status(denied.status);
      res.json(denied.body);
      return;
    }
    res.status(200);
    res.json({ trips: [] });
  };
}
